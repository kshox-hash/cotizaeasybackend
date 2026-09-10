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
