import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth_middleware";
import { billingStatusController, billingCheckoutController, billingCancelController } from "./billing.controller";

const router = Router();

router.get("/billing/status", authMiddleware, billingStatusController);
router.post("/billing/checkout", authMiddleware, billingCheckoutController);
router.post("/billing/cancel", authMiddleware, billingCancelController);

export default router;
