import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { CORS_ORIGINS } from "../../config/env";
import {
  getBillingInfo,
  savePendingPreapproval,
  activateSubscription,
  markPastDue,
  markCanceled,
  findUserIdByPreapprovalId,
  BillingInfo,
} from "./billing.repository";

const FRONTEND_URL = CORS_ORIGINS[0] || "http://localhost:4000";
const MONTHLY_PRICE_CLP = 5000;
const SUBSCRIPTION_REASON = "Cotiza Easy Pro — Suscripción mensual";

function getAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("MP_ACCESS_TOKEN no está configurado");
  return token;
}

function mpClient(): MercadoPagoConfig {
  return new MercadoPagoConfig({ accessToken: getAccessToken(), options: { timeout: 10_000 } });
}

export type SubscriptionState = BillingInfo & {
  /** true si la cuenta debe quedar bloqueada (trial vencido y sin suscripción activa). */
  isBlocked: boolean;
  /** días restantes de trial, redondeados hacia arriba; null si ya no aplica. */
  trialDaysLeft: number | null;
};

export async function getSubscriptionState(userId: string): Promise<SubscriptionState | null> {
  const info = await getBillingInfo(userId);
  if (!info) return null;

  const now = Date.now();
  const trialEndsAtMs = info.trialEndsAt ? new Date(info.trialEndsAt).getTime() : null;

  const inActiveTrial = info.subscriptionStatus === "trial" && trialEndsAtMs !== null && trialEndsAtMs > now;
  const isActive = info.subscriptionStatus === "active";

  return {
    ...info,
    isBlocked: !isActive && !inActiveTrial,
    trialDaysLeft: inActiveTrial ? Math.ceil((trialEndsAtMs! - now) / 86_400_000) : null,
  };
}

/** Crea (o reutiliza) la suscripción en MercadoPago y devuelve la URL de checkout. */
export async function createCheckout(userId: string, email: string): Promise<{ checkoutUrl: string }> {
  const existing = await getBillingInfo(userId);
  if (existing?.subscriptionStatus === "active") {
    throw new Error("Ya tienes una suscripción activa.");
  }

  // Si había un checkout anterior sin confirmar (el usuario apretó el botón más
  // de una vez, o reintentó porque pareció colgarse), lo cancelamos antes de
  // crear uno nuevo. Si no, mp_preapproval_id en la BD queda apuntando siempre
  // al último intento — y si el usuario termina pagando en la pestaña vieja, el
  // webhook llega con un preapproval_id que ya no matchea a ningún usuario y la
  // cuenta nunca se activa aunque el pago se haya hecho.
  if (existing?.mpPreapprovalId) {
    const prevClient = new PreApproval(mpClient());
    const prev = await prevClient.get({ id: existing.mpPreapprovalId }).catch(() => null);
    // Si ya está autorizada pero el webhook todavía no sincronizó el estado local
    // (carrera rara pero posible), mejor no tocarla — no cancelamos una suscripción
    // que en MercadoPago ya es real.
    if (prev && prev.status !== "authorized") {
      await prevClient.update({ id: existing.mpPreapprovalId, body: { status: "cancelled" } }).catch((err) => {
        console.warn(`[billing] no se pudo cancelar el preapproval previo ${existing.mpPreapprovalId}:`, err.message);
      });
    }
  }

  const preApproval = new PreApproval(mpClient());

  const result = await preApproval.create({
    body: {
      reason: SUBSCRIPTION_REASON,
      external_reference: userId,
      payer_email: email,
      back_url: `${FRONTEND_URL}/suscripcion/exito`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: MONTHLY_PRICE_CLP,
        currency_id: "CLP",
      },
    },
  });

  if (!result.id || !result.init_point) {
    throw new Error("MercadoPago no devolvió un checkout válido");
  }

  await savePendingPreapproval(userId, result.id);

  return { checkoutUrl: result.init_point };
}

/** Cancela la suscripción activa del usuario en MercadoPago. */
export async function cancelSubscription(userId: string): Promise<void> {
  const info = await getBillingInfo(userId);
  if (!info?.mpPreapprovalId) throw new Error("No hay una suscripción para cancelar");

  const preApproval = new PreApproval(mpClient());
  await preApproval.update({ id: info.mpPreapprovalId, body: { status: "cancelled" } });
  await markCanceled(userId);
}

/**
 * Sincroniza el estado local de un usuario con el estado real de su preapproval en
 * MercadoPago. Se llama desde el webhook — nunca confiamos ciegamente en el payload
 * del webhook, siempre se vuelve a consultar la API con el id recibido.
 */
export async function syncPreapproval(preapprovalId: string): Promise<void> {
  const userId = await findUserIdByPreapprovalId(preapprovalId);
  if (!userId) {
    console.warn(`[billing] Webhook para preapproval ${preapprovalId} sin usuario asociado`);
    return;
  }

  const preApproval = new PreApproval(mpClient());
  const info = await preApproval.get({ id: preapprovalId });

  switch (info.status) {
    case "authorized": {
      const nextPayment = info.next_payment_date ? new Date(info.next_payment_date) : new Date(Date.now() + 31 * 86_400_000);
      await activateSubscription(userId, nextPayment);
      break;
    }
    case "paused":
      await markPastDue(userId);
      break;
    case "cancelled":
      await markCanceled(userId);
      break;
    default:
      console.warn(`[billing] preapproval ${preapprovalId} con status desconocido: ${info.status}`);
  }
}
