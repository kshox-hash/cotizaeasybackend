import "./config/env"; // valida variables de entorno al arrancar

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import passport from "passport";

import { PORT, CORS_ORIGINS, BASE_URL } from "./config/env";
import { GENERATED_PDFS_DIR } from "./modules/quotes/quote.service";

import companyProfileRoutes from "./modules/profiles/company-profile.router";
import { companyProfileRepository } from "./modules/profiles/company_profile_repository";
import loginRoutes from "./login/login.router";
import meRoutes from "./login/me.router";
import { errorMiddleware } from "./middlewares/error_middleware";
import { authMiddleware } from "./middlewares/auth_middleware";
import { subscriptionMiddleware } from "./middlewares/subscription_middleware";
import quotesRouter from "./modules/quotes/quotes.router";
import quotePublicRouter from "./modules/quote-public/quote-public.router";
import clientsRouter from "./modules/clients/clients.router";
import billingRouter from "./modules/billing/billing.router";
import billingWebhookRouter from "./modules/billing/billing-webhook.router";
import { initBillingColumns } from "./modules/billing/billing.repository";
import {
  initQuoteHistoryTable,
  initQuoteHistoryStatusColumns,
  initQuoteHistoryPdfConfigColumns,
} from "./modules/quotes/quote-history/quote-history.repository";
import { initQuoteCatalogItemsTable } from "./modules/quotes/quote-catalog/quote-catalog.repository";
import { initClientsTable } from "./modules/clients/clients.repository";
import DB from "./db/db_configuration";

// ─── Proceso ────────────────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
  process.exit(1);
});

// ─── App ─────────────────────────────────────────────────────────────────────
const app = express();

app.set("trust proxy", 1);

const r2PublicHost = (() => {
  try {
    return process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).origin : null;
  } catch {
    return null;
  }
})();

// Nonce por request: lo usa la vista pública de cotización (quote-view.html.ts) para
// poder ejecutar su <script> inline (botones Aceptar/Rechazar) bajo la CSP de abajo.
// Sin esto, script-src 'self' (default de helmet) bloquea silenciosamente el script
// en cualquier navegador real — los botones quedan inertes sin ningún error visible al usuario.
app.use((req, res, next) => {
  res.locals["cspNonce"] = crypto.randomBytes(16).toString("base64");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "https://res.cloudinary.com", ...(r2PublicHost ? [r2PublicHost] : [])],
        "script-src": ["'self'", (_req, res) => `'nonce-${(res as express.Response).locals["cspNonce"]}'`],
      },
    },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      // BASE_URL (el propio origen del backend) se permite además de CORS_ORIGIN: la vista
      // pública de cotización (/cotizacion/:token) la sirve este mismo servidor, y el fetch()
      // de sus botones Aceptar/Rechazar manda el header Origin aunque sea same-origin — sin
      // esto, el navegador real recibe un 500 y los botones nunca funcionan (bug real, no
      // detectado antes porque las pruebas previas usaban curl sin ese header).
      if (CORS_ORIGINS.includes(origin) || origin === BASE_URL) return callback(null, true);
      callback(new Error(`Origin no permitido: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));
// session:false en todo el login con Google — no necesita sesión de passport en cookies,
// solo lo usa para popular req.user durante el callback (ver login.router.ts).
app.use(passport.initialize());

// ─── Rate limiting ────────────────────────────────────────────────────────────
const pdfDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Demasiadas descargas. Intenta en 15 minutos.",
});

// Límite general de defensa en profundidad para /api (uso normal de un usuario
// autenticado queda muy por debajo de esto; solo frena loops/abuso/bugs de scripts).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta más tarde." },
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    await DB.getPool().query("SELECT 1");
    res.json({ ok: true, db: "up", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, db: "down", timestamp: new Date().toISOString() });
  }
});

// ─── Rutas ────────────────────────────────────────────────────────────────────
app.use("/generated-pdfs", pdfDownloadLimiter, (_req, res, next) => {
  res.setHeader("Content-Disposition", "attachment");
  next();
}, express.static(GENERATED_PDFS_DIR));

app.use(companyProfileRoutes);
// authLimiter se aplica por-ruta dentro de login.router.ts (solo /login y /register) —
// montarlo aquí a nivel de prefijo "/auth" lo aplicaría también a /auth/me.
app.use("/auth", loginRoutes);
app.use("/auth", meRoutes);
app.use(quotePublicRouter); // rutas públicas: /cotizacion/:token, /api/quotes/:token/accept|reject
app.use("/api", apiLimiter, billingRouter); // sin subscriptionMiddleware: acá es donde se paga
app.use(billingWebhookRouter); // sin auth ni /api: lo llama MercadoPago, se valida con firma HMAC
// subscriptionMiddleware bloquea con 402 si el trial venció y no hay suscripción activa —
// va después de authMiddleware porque necesita req.user ya resuelto. El authMiddleware de acá
// es redundante con el que ya tiene cada ruta interna (no hace daño, jwt.verify es barato) y
// evita tener que tocar rutas nuevas dentro de cada router uno por uno.
app.use("/api", apiLimiter, authMiddleware, subscriptionMiddleware, quotesRouter);
app.use("/api", apiLimiter, authMiddleware, subscriptionMiddleware, clientsRouter);
app.use(errorMiddleware);

// ─── Init de esquema (idempotente) ────────────────────────────────────────────
async function initUsersTable(): Promise<void> {
  await DB.getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email      TEXT UNIQUE NOT NULL,
      password   TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `);
}

// ─── Arranque ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, async () => {
  console.log(`[server] Escuchando en puerto ${PORT}`);
  // Respaldo a nivel de servidor: si un handler se cuelga (ej. R2/SMTP no responde
  // y por algún motivo escapa a los timeouts de esos clientes), esto evita que la
  // conexión quede abierta indefinidamente. keepAliveTimeout > timeout típico de
  // un load balancer (60s); headersTimeout siempre debe ser mayor que keepAliveTimeout.
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  await initUsersTable().catch((e) => console.error("[init] users:", e));
  // billing depende de que la tabla users ya exista (agrega columnas con ALTER).
  await initBillingColumns().catch((e) => console.error("[init] billing:", e));
  // quote_history debe existir antes de intentar sus ALTER TABLE (columnas de estado/pdf-config).
  await initQuoteHistoryTable().catch((e) => console.error("[init] quote_history:", e));
  await Promise.all([
    companyProfileRepository.initBusinessProfilesTable().catch((e) => console.error("[init] business_profiles:", e)),
    initQuoteHistoryStatusColumns().catch((e) => console.error("[init] quote_history_status:", e)),
    initQuoteHistoryPdfConfigColumns().catch((e) => console.error("[init] quote_history_pdf_config:", e)),
    initQuoteCatalogItemsTable().catch((e) => console.error("[init] quote_catalog_items:", e)),
    initClientsTable().catch((e) => console.error("[init] clients:", e)),
  ]);
  console.log("[server] Esquema inicializado.");
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`[server] ${signal} recibido — cerrando...`);
  server.close(async () => {
    try {
      await DB.getPool().end();
      console.log("[server] Pool de DB cerrado. Proceso terminado.");
    } catch (err) {
      console.error("[server] Error cerrando pool:", err);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
