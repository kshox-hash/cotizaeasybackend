import crypto from "crypto";
import { MercadoPagoConfig, Invoice } from "mercadopago";
import { syncPreapproval } from "./billing.service";

const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET ?? "";

/**
 * Verifica la firma HMAC-SHA256 que MercadoPago envía en x-signature.
 * Lanza un error si la firma es inválida o ausente.
 *
 * Formato del header x-signature: "ts=1704067200,v1=abc123..."
 * Manifest: "id:<dataId>;request-id:<xRequestId>;ts:<ts>;"
 */
export function verifyMpSignature(
  xSignature: string | undefined,
  xRequestId: string | undefined,
  dataId: string | undefined
): void {
  if (!WEBHOOK_SECRET) {
    throw new Error("MP_WEBHOOK_SECRET no está configurado");
  }

  if (!xSignature) {
    throw new Error("Header x-signature ausente");
  }

  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const idx = part.indexOf("=");
      return [part.slice(0, idx), part.slice(idx + 1)] as [string, string];
    })
  );

  const ts = parts["ts"];
  const v1 = parts["v1"];

  if (!ts || !v1) {
    throw new Error("Header x-signature malformado");
  }

  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
    throw new Error("Timestamp de la firma fuera de ventana permitida");
  }

  const segments: string[] = [];
  if (dataId) segments.push(`id:${dataId}`);
  if (xRequestId) segments.push(`request-id:${xRequestId}`);
  segments.push(`ts:${ts}`);

  const manifest = segments.join(";") + ";";

  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");

  if (
    expected.length !== v1.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
  ) {
    throw new Error("Firma HMAC inválida");
  }
}

/**
 * Procesa un evento de webhook ya autenticado. Para "subscription_preapproval"
 * el dataId ES el preapproval id. Para "subscription_authorized_payment" el
 * dataId es un id de factura/cobro — hay que resolverlo a su preapproval_id
 * antes de sincronizar (nunca confiamos en el payload, solo en lo que la API
 * de MercadoPago devuelve al consultar por id).
 */
export async function handleWebhookEvent(topic: string, dataId: string): Promise<void> {
  if (topic === "subscription_preapproval") {
    await syncPreapproval(dataId);
    return;
  }

  if (topic === "subscription_authorized_payment") {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) throw new Error("MP_ACCESS_TOKEN no está configurado");
    const invoice = new Invoice(new MercadoPagoConfig({ accessToken: token, options: { timeout: 10_000 } }));
    const info = await invoice.get({ id: dataId });
    if (info.preapproval_id) {
      await syncPreapproval(info.preapproval_id);
    }
    return;
  }

  // Otros topics (payment, merchant_order, etc.) no aplican a billing — se ignoran.
}
