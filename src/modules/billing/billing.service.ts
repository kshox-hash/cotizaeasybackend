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
