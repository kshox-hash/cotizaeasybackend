import { Request, Response, NextFunction } from "express";
import passport from "passport";
import {
  loginUser, registerUser, getUserById, updateUserName, changeUserPassword,
  createEmailVerificationToken, verifyEmailWithToken, resendVerificationByEmail,
  createPasswordResetToken, resetPasswordWithToken,
} from "./login.service";
import { sendVerificationEmail, sendPasswordResetEmail } from "./auth-email.service";
import { CORS_ORIGINS, WEB_CALLBACK_URL } from "../config/env";
import { getSubscriptionState } from "../modules/billing/billing.service";
import { googleAuthEnabled } from "./strategies/google.strategy";

const FRONTEND_URL = CORS_ORIGINS[0] || "http://localhost:4000";

const KNOWN_AUTH_MSGS = new Set([
  "Usuario no existe",
  "Credenciales inválidas",
  "Ya existe una cuenta con ese correo",
  "Contraseña actual incorrecta",
  "Debes confirmar tu correo antes de iniciar sesión",
]);

export async function loginController(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        message: "Correo y contraseña son obligatorios",
      });
    }

    const result = await loginUser(email, password);

    return res.status(200).json({
      ok: true,
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    console.error("LOGIN ERROR:", error.message);
    const msg = KNOWN_AUTH_MSGS.has(error?.message) ? error.message : "Error de autenticación.";
    return res.status(401).json({ ok: false, message: msg });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerController(req: Request, res: Response) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "Correo y contraseña son obligatorios" });
    }
    if (!EMAIL_RE.test(String(email))) {
      return res.status(400).json({ ok: false, message: "Correo inválido" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 6 caracteres" });
    }

    const cleanName = name !== undefined ? String(name).trim().slice(0, 100) : undefined;
    const result = await registerUser(String(email).trim(), String(password), cleanName || undefined);

    // Fire-and-forget: la cuenta ya quedó creada y logueada, no bloqueamos el registro
    // esperando al SMTP. Si falla, el usuario puede pedir el reenvío desde /auth/resend-verification.
    const verifyUrl = `${FRONTEND_URL}/verificar-email?token=${result.verifyToken}`;
    sendVerificationEmail({ to: result.user.email, verifyUrl }).catch((err) =>
      console.error("[register] sendVerificationEmail falló:", err)
    );

    return res.status(201).json({
      ok: true,
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    console.error("REGISTER ERROR:", error.message);
    const msg = KNOWN_AUTH_MSGS.has(error?.message) ? error.message : "Error al crear la cuenta.";
    const status = error?.message === "Ya existe una cuenta con ese correo" ? 409 : 500;
    return res.status(status).json({ ok: false, message: msg });
  }
}

export async function meController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

    const user = await getUserById(userId);
    const subscription = await getSubscriptionState(userId);
    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name || "", emailVerified: user.email_verified, avatarUrl: user.avatar_url || "" },
      subscription,
    });
  } catch (error: any) {
    console.error("ME ERROR:", error.message);
    const msg = KNOWN_AUTH_MSGS.has(error?.message) ? error.message : "No se pudo obtener la cuenta.";
    return res.status(500).json({ ok: false, message: msg });
  }
}

export async function updateMeController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

    const { name, currentPassword, newPassword } = req.body;

    if (name === undefined && newPassword === undefined) {
      return res.status(400).json({ ok: false, message: "Nada para actualizar" });
    }

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ ok: false, message: "El nombre no puede estar vacío" });
    }

    if (newPassword !== undefined) {
      if (!currentPassword) {
        return res.status(400).json({ ok: false, message: "Debes ingresar tu contraseña actual" });
      }
      if (String(newPassword).length < 6) {
        return res.status(400).json({ ok: false, message: "La nueva contraseña debe tener al menos 6 caracteres" });
      }
      await changeUserPassword(userId, String(currentPassword), String(newPassword));
    }

    if (name !== undefined) {
      await updateUserName(userId, String(name).trim());
    }

    const user = await getUserById(userId);
    return res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name || "", emailVerified: user.email_verified } });
  } catch (error: any) {
    console.error("UPDATE ME ERROR:", error.message);
    const msg = KNOWN_AUTH_MSGS.has(error?.message) ? error.message : "No se pudo actualizar la cuenta.";
    // 400, no 401: es un dato de formulario inválido, no una sesión expirada — el interceptor
    // global del frontend trata cualquier 401 como "token vencido" y cierra la sesión.
    const status = error?.message === "Contraseña actual incorrecta" ? 400 : 500;
    return res.status(status).json({ ok: false, message: msg });
  }
}

export async function verifyEmailController(req: Request, res: Response) {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, message: "Falta el token." });

    const user = await verifyEmailWithToken(token);
    if (!user) return res.status(400).json({ ok: false, message: "El link no es válido o ya expiró." });

    return res.json({ ok: true });
  } catch (error: any) {
    console.error("VERIFY EMAIL ERROR:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo verificar el correo." });
  }
}

export async function resendVerificationController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

    const user = await getUserById(userId);
    if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });

    const verifyToken = await createEmailVerificationToken(userId);
    const verifyUrl = `${FRONTEND_URL}/verificar-email?token=${verifyToken}`;
    await sendVerificationEmail({ to: user.email, verifyUrl });

    return res.json({ ok: true });
  } catch (error: any) {
    console.error("RESEND VERIFICATION ERROR:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo reenviar el correo de verificación." });
  }
}

// Sin sesión: la necesita alguien a quien el login le rechaza por correo no verificado
// y no tiene forma de autenticarse todavía para usar /auth/resend-verification.
export async function resendVerificationPublicController(req: Request, res: Response) {
  try {
    const email = String(req.body?.email || "").trim();
    if (!email) return res.status(400).json({ ok: false, message: "El correo es obligatorio." });

    const result = await resendVerificationByEmail(email);
    if (result) {
      const verifyUrl = `${FRONTEND_URL}/verificar-email?token=${result.verifyToken}`;
      sendVerificationEmail({ to: result.email, verifyUrl }).catch((err) =>
        console.error("[resendVerificationPublic] sendVerificationEmail falló:", err)
      );
    }
    // Misma respuesta exista o no la cuenta, o ya esté verificada — no revela nada.
    return res.json({ ok: true, message: "Si el correo está registrado y sin confirmar, te enviamos un nuevo link." });
  } catch (error: any) {
    console.error("RESEND VERIFICATION PUBLIC ERROR:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo procesar la solicitud." });
  }
}

export async function forgotPasswordController(req: Request, res: Response) {
  try {
    const email = String(req.body?.email || "").trim();
    if (!email) return res.status(400).json({ ok: false, message: "El correo es obligatorio." });

    const result = await createPasswordResetToken(email);
    // Misma respuesta exista o no la cuenta — evita que alguien use este endpoint
    // para averiguar qué correos están registrados.
    if (result) {
      const resetUrl = `${FRONTEND_URL}/restablecer?token=${result.token}`;
      sendPasswordResetEmail({ to: email, name: result.name, resetUrl }).catch((err) =>
        console.error("[forgotPassword] sendPasswordResetEmail falló:", err)
      );
    }
    return res.json({ ok: true, message: "Si el correo está registrado, te enviamos un link para restablecer tu contraseña." });
  } catch (error: any) {
    console.error("FORGOT PASSWORD ERROR:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo procesar la solicitud." });
  }
}

// Login con Google — paso 1: redirige a Google. 501 si no hay credenciales configuradas
// en vez de romper (passport.authenticate lanzaría con una estrategia inexistente).
export function googleStartController(req: Request, res: Response, next: NextFunction) {
  if (!googleAuthEnabled) {
    return res.status(501).json({ ok: false, message: "Login con Google no está configurado." });
  }
  passport.authenticate("google", { scope: ["profile", "email"], session: false })(req, res, next);
}

// Login con Google — paso 2: Google ya redirigió acá con el usuario autenticado en
// req.user (lo puso la estrategia). Se manda todo por query string al frontend, que
// lo toma y arma la sesión igual que con /auth/login.
export async function googleCallbackController(req: Request, res: Response) {
  const authUser = req.user as { token: string; user: { id: string; email: string; name: string; avatarUrl?: string } } | undefined;
  if (!authUser?.token || !authUser?.user) {
    return res.redirect(`${FRONTEND_URL}/login?error=google`);
  }
  const params = new URLSearchParams({
    token: authUser.token,
    userId: authUser.user.id,
    email: authUser.user.email,
    name: authUser.user.name ?? "",
    avatarUrl: authUser.user.avatarUrl ?? "",
  });
  return res.redirect(`${WEB_CALLBACK_URL}?${params.toString()}`);
}

export async function resetPasswordController(req: Request, res: Response) {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!token) return res.status(400).json({ ok: false, message: "Falta el token." });
    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, message: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    const success = await resetPasswordWithToken(token, newPassword);
    if (!success) return res.status(400).json({ ok: false, message: "El link no es válido o ya expiró." });

    return res.json({ ok: true });
  } catch (error: any) {
    console.error("RESET PASSWORD ERROR:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo restablecer la contraseña." });
  }
}
