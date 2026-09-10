import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../../middlewares/auth_middleware";
import { quoteSendLimiter } from "../../middlewares/rate_limiters";
import { quoteServicesController } from "./quote-catalog/quote-catalog.controller";
import { quoteHistoryController } from "./quote-history/quote-history.controller";
import { quoteSendController } from "./quote-send.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se aceptan imágenes (JPEG, PNG, WEBP, GIF)."));
    }
  },
});

// ── Send ──────────────────────────────────────────────────────────────────────
router.post("/quotes/send",        authMiddleware, quoteSendLimiter, quoteSendController.send);
router.post("/quotes/preview",     authMiddleware, quoteSendController.preview);
router.post("/quotes/upload-logo", authMiddleware, upload.single("photo"), quoteSendController.uploadLogo);
router.delete("/quotes/logo",      authMiddleware, quoteSendController.removeLogo);

// ── Quote catalog (ítems guardados para cotizaciones manuales) ────────────────
router.get   ("/quote-services",             authMiddleware, quoteServicesController.list);
router.get   ("/quote-services/all",         authMiddleware, quoteServicesController.listAll);
router.post  ("/quote-services",             authMiddleware, quoteServicesController.create);
router.put   ("/quote-services/:serviceId",  authMiddleware, quoteServicesController.update);
router.delete("/quote-services/:serviceId",  authMiddleware, quoteServicesController.remove);

// ── Quote history ─────────────────────────────────────────────────────────────
router.get   ("/quote-history",              authMiddleware, quoteHistoryController.list);
router.delete("/quote-history/:quoteId",     authMiddleware, quoteHistoryController.remove);
router.patch ("/quote-history/:quoteId/answer", authMiddleware, quoteHistoryController.answer);
router.post  ("/quote-history/:quoteId/resend", authMiddleware, quoteSendLimiter, quoteHistoryController.resend);

export default router;
