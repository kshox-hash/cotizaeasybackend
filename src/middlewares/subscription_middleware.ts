import { Request, Response, NextFunction } from "express";
import { getSubscriptionState } from "../modules/billing/billing.service";

/**
 * Bloquea el acceso a la API una vez vencido el trial de 2 días si no hay una
 * suscripción activa. Debe montarse DESPUÉS de authMiddleware (necesita req.user).
 * El bloqueo real vive acá, no solo en el frontend — así no se puede saltar
 * pegándole directo a la API.
 */
export async function subscriptionMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

    const state = await getSubscriptionState(userId);
    if (!state) return res.status(401).json({ ok: false, message: "No autorizado" });

    if (state.isBlocked) {
      return res.status(402).json({
        ok: false,
        message: "Tu período de prueba terminó. Suscríbete para seguir usando la app.",
        code: "SUBSCRIPTION_REQUIRED",
      });
    }

    return next();
  } catch (error: any) {
    console.error("SUBSCRIPTION MIDDLEWARE ERROR:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo verificar la suscripción." });
  }
}
