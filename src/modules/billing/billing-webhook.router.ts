import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { billingWebhookController } from "./billing-webhook.controller";

const router = Router();

// Defensa en profundidad — el rechazo por firma HMAC inválida ya es barato, pero
// esto evita que alguien sin firma válida haga que el proceso parsee body/headers
// en bucle sin costo para el atacante. El tráfico legítimo de MercadoPago (una
// cuenta chica) está muy por debajo de este techo.
const webhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  standardHeaders: true,
  legacyHeaders: false,
});

// Sin authMiddleware: lo llama MercadoPago, no un usuario logueado. La autenticidad
// se valida con la firma HMAC (verifyMpSignature) dentro del controller.
router.post("/billing/webhook", webhookRateLimit, billingWebhookController);

export default router;
