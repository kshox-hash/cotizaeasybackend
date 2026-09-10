import { Request, Response } from "express";
import { getUserById } from "../../login/login.service";
import { getSubscriptionState, createCheckout, cancelSubscription } from "./billing.service";

export async function billingStatusController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

    const state = await getSubscriptionState(userId);
    if (!state) return res.status(404).json({ ok: false, message: "Usuario no existe" });

    return res.json({ ok: true, subscription: state });
  } catch (error: any) {
    console.error("BILLING STATUS ERROR:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo obtener el estado de la suscripción." });
  }
}

export async function billingCheckoutController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

    const user = await getUserById(userId);
    const { checkoutUrl } = await createCheckout(userId, user.email);

    return res.json({ ok: true, checkoutUrl });
  } catch (error: any) {
    console.error("BILLING CHECKOUT ERROR:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo iniciar el pago. Intenta de nuevo." });
  }
}

export async function billingCancelController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

    await cancelSubscription(userId);
    return res.json({ ok: true });
  } catch (error: any) {
    console.error("BILLING CANCEL ERROR:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo cancelar la suscripción." });
  }
}
