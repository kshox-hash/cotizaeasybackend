import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth_middleware";
import { clientsController } from "./clients.controller";

const router = Router();

router.get   ("/clients",           authMiddleware, clientsController.list);
router.post  ("/clients",           authMiddleware, clientsController.create);
router.put   ("/clients/:clientId", authMiddleware, clientsController.update);
router.delete("/clients/:clientId", authMiddleware, clientsController.remove);

export default router;
