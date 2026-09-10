import { Request, Response } from "express";
import { verifyMpSignature, handleWebhookEvent } from "./billing-webhook.service";

export async function billingWebhookController(req: Request, res: Response): Promise<Response> {
  const topic = String(req.query["topic"] ?? req.query["type"] ?? req.body?.type ?? "").trim();

  if (topic !== "subscription_preapproval" && topic !== "subscription_authorized_payment") {
    return res.status(200).json({ ok: true, ignored: true, topic });
  }

  const dataId = String(req.body?.data?.id ?? req.query["data.id"] ?? req.query["id"] ?? "").trim();

  if (!dataId) {
    return res.status(200).json({ ok: true, ignored: true, reason: "sin dataId" });
  }

  const xSignature = req.headers["x-signature"] as string | undefined;
  const xRequestId = req.headers["x-request-id"] as string | undefined;

  try {
    verifyMpSignature(xSignature, xRequestId, dataId);
  } catch (sigError) {
    console.error("[billing webhook] Firma inválida:", (sigError as Error).message);
    return res.status(401).json({ ok: false, message: "Firma inválida" });
  }

  try {
    await handleWebhookEvent(topic, dataId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[billing webhook] Error procesando evento:", error);
    // MP requiere 200 siempre — un 500 provoca reintentos y baja el score de integración.
    return res.status(200).json({ ok: false, message: "Error interno, reintento no necesario" });
  }
}
