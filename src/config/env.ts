// quiet: evita que dotenv imprima "tips" promocionales (de terceros) en cada arranque.
require("dotenv").config({ quiet: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[startup] Variable de entorno requerida no definida: ${name}`);
  return value;
}

export const PORT            = Number(process.env.PORT) || 4001;
export const BASE_URL        = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
export const JWT_SECRET      = requireEnv("JWT_SECRET");

// CORS: lista de orígenes permitidos separados por coma
if (!process.env.CORS_ORIGIN && process.env.NODE_ENV === "production") {
  throw new Error("[startup] CORS_ORIGIN es requerido en producción");
}
export const CORS_ORIGINS: string[] = (process.env.CORS_ORIGIN ?? "http://localhost:4000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Variables de base de datos — validadas aquí para fallar rápido al arrancar
export const PGHOST     = requireEnv("PGHOST");
export const PGUSER     = requireEnv("PGUSER");
export const PGPASSWORD = requireEnv("PGPASSWORD");
export const PGDATABASE = requireEnv("PGDATABASE");
export const PGPORT     = Number(process.env.PGPORT) || 5432;
export const PGSSL      = process.env.PGSSL !== "false";

// Login con Google — opcional: si no están seteadas, la estrategia simplemente no se
// registra y /auth/google responde 501 en vez de romper el arranque del servidor.
export const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
export const GOOGLE_CALLBACK_URL  = process.env.GOOGLE_CALLBACK_URL || `${BASE_URL}/auth/google/callback`;
// A dónde redirigir de vuelta en el frontend después del login con Google.
export const WEB_CALLBACK_URL     = process.env.WEB_CALLBACK_URL || `${CORS_ORIGINS[0] || "http://localhost:4000"}/auth/callback`;
