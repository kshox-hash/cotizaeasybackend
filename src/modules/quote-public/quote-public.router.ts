import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { quotePublicController } from "./quote-public.controller";

const router = express.Router();

const tokenRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  message: { ok: false, message: "Demasiadas solicitudes. Intenta más tarde." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/cotizacion/:token", tokenRateLimit, quotePublicController.view);
router.post("/api/quotes/:token/accept", tokenRateLimit, quotePublicController.accept);
router.post("/api/quotes/:token/reject", tokenRateLimit, quotePublicController.reject);

export default router;
