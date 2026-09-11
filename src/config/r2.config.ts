import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

// .trim() en las 4 — un espacio/salto de línea/punto de más al pegar la variable
// en el panel de Render ya rompió el endpoint una vez (cuenta.. en vez de
// cuenta.r2...) de forma invisible en la UI. Mejor sanitizar acá que confiar
// en que el copy-paste siempre venga limpio.
const R2_ACCOUNT_ID = (process.env.R2_ACCOUNT_ID || "").trim().replace(/\.+$/, "");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: (process.env.R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || "").trim(),
  },
  requestHandler: new NodeHttpHandler({ connectionTimeout: 5_000, requestTimeout: 20_000 }),
});

export const R2_BUCKET = (process.env.R2_BUCKET_NAME || "").trim();
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").trim().replace(/\/$/, "");

export default r2;
