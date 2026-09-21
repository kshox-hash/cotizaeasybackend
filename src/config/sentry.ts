// Se importa primero que nada en server.ts (antes de express y el resto) porque
// Sentry instrumenta módulos de Node al cargarse — importarlo tarde deja huecos
// en lo que alcanza a capturar automáticamente.
import * as Sentry from "@sentry/node";
import { SENTRY_DSN } from "./env";

export const sentryEnabled = Boolean(SENTRY_DSN);

if (sentryEnabled) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
    // Cada controller ya loguea sus propios errores con console.error() en vez de
    // pasarlos por next(err) — son la mayoría de los errores reales de la app.
    // Sin esto, solo lo que llega al errorMiddleware (una minoría) se reportaría.
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
  });
}

export { Sentry };
