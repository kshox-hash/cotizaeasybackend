import { Router } from "express";
import { billingWebhookController } from "./billing-webhook.controller";

const router = Router();

// Sin authMiddleware: lo llama MercadoPago, no un usuario logueado. La autenticidad
// se valida con la firma HMAC (verifyMpSignature) dentro del controller.
router.post("/billing/webhook", billingWebhookController);

export default router;
