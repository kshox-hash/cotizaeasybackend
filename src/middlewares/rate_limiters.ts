import rateLimit from "express-rate-limit";

// Protección de fuerza bruta — solo para intentos reales de login/registro,
// no para rutas autenticadas de uso normal (ver eso en login/me.router.ts).
// En test/CI el límite real (20/15min) se agota enseguida corriendo la suite de e2e
// (cada test registra una cuenta) — se relaja solo cuando NODE_ENV=test, nunca en prod.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiados intentos. Intenta en 15 minutos." },
});

// Envío real de emails (cotizaciones) — límite por usuario, no por IP, para que no se
// esquive cambiando de red. Va montado después de authMiddleware (necesita req.user).
// Combinado con el tope de 5 destinatarios por request, deja un techo de ~100
// emails/hora por cuenta — cubre uso real y corta cualquier intento de blast.
export const quoteSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || req.ip || "unknown",
  message: { ok: false, message: "Demasiados envíos de correo. Intenta más tarde." },
});
