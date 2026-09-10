import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth_middleware";
import { companyProfileController } from "./company_profile.controller";

const router = Router();

router.get("/company-profile/me", authMiddleware, companyProfileController.getMe);
router.post("/company-profile/me", authMiddleware, companyProfileController.upsertMe);
router.post("/company-profile/me/quote-config", authMiddleware, companyProfileController.updateQuoteConfig);

export default router;
