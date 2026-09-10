import { Router } from "express";
import { meController, updateMeController, resendVerificationController } from "./login.controller";
import { authMiddleware } from "../middlewares/auth_middleware";
import { authLimiter } from "../middlewares/rate_limiters";

const router = Router();

// Sin authLimiter: son rutas autenticadas de uso normal (ver/editar cuenta),
// no intentos de login — el rate-limit de fuerza bruta no aplica acá.
router.get("/me", authMiddleware, meController);
router.patch("/me", authMiddleware, updateMeController);
// Esta sí lleva authLimiter: dispara un envío de correo, no queremos que se pueda golpear en loop.
router.post("/resend-verification", authMiddleware, authLimiter, resendVerificationController);

export default router;
