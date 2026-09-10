import { Router } from "express";
import passport from "passport";
import {
  loginController, registerController, verifyEmailController,
  forgotPasswordController, resetPasswordController, resendVerificationPublicController,
  googleStartController, googleCallbackController,
} from "./login.controller";
import { authLimiter } from "../middlewares/rate_limiters";
import { CORS_ORIGINS } from "../config/env";
// Efecto de import: registra la estrategia de Google en passport (si hay credenciales).
import "./strategies/google.strategy";

const router = Router();
const FRONTEND_URL = CORS_ORIGINS[0] || "http://localhost:4000";

router.post("/login", authLimiter, loginController);
router.post("/register", authLimiter, registerController);
router.post("/verify-email", authLimiter, verifyEmailController);
router.post("/resend-verification-public", authLimiter, resendVerificationPublicController);
router.post("/forgot-password", authLimiter, forgotPasswordController);
router.post("/reset-password", authLimiter, resetPasswordController);

router.get("/google", authLimiter, googleStartController);
router.get(
  "/google/callback",
  authLimiter,
  passport.authenticate("google", { session: false, failureRedirect: `${FRONTEND_URL}/login?error=google` }),
  googleCallbackController
);

export default router;
