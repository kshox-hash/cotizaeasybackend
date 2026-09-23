import fs from "fs";
import https from "https";
import path from "path";
import sharp from "sharp";

import { sanitizeFileName } from "../../utils/token";
import { QuotePdfInput, QuoteTemplateType } from "./quote.types";
import { generateStyle1 } from "./pdf-styles/style1";
import { generateStyle2 } from "./pdf-styles/style2";
import { generateStyle3 } from "./pdf-styles/style3";
import { generateStyle4 } from "./pdf-styles/style4";
import { generateStyle5 } from "./pdf-styles/style5";
import { generateStyle6 } from "./pdf-styles/style6";
import { generateStyle7 } from "./pdf-styles/style7";
import { generateStyle8 } from "./pdf-styles/style8";
import { generateBlankTemplate } from "./pdf-styles/blank";

export type { QuotePdfInput, QuoteTemplateType };

export const GENERATED_PDFS_DIR = path.join(__dirname, "..", "generated-pdfs");

if (!fs.existsSync(GENERATED_PDFS_DIR)) {
  fs.mkdirSync(GENERATED_PDFS_DIR, { recursive: true });
}

// Red de seguridad: cada PDF se borra al terminar su propia request (ver
// finally/stream.on("close") en los callers), pero si el proceso se cae a
// mitad de camino queda huérfano en disco para siempre. Este barrido
// (llamado desde server.ts al arrancar y cada 1h) borra lo que lleve más
// de 1h ahí — ningún PDF real dura tanto en esta carpeta en uso normal.
export function sweepOrphanedPdfs(maxAgeMs = 60 * 60 * 1000): void {
  fs.readdir(GENERATED_PDFS_DIR, (err, files) => {
    if (err) return console.error("[quote.service] sweepOrphanedPdfs readdir:", err);
    const cutoff = Date.now() - maxAgeMs;
    for (const file of files) {
      const filePath = path.join(GENERATED_PDFS_DIR, file);
      fs.stat(filePath, (statErr, stat) => {
        if (statErr || !stat.isFile() || stat.mtimeMs >= cutoff) return;
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) console.error("[quote.service] sweepOrphanedPdfs unlink:", filePath, unlinkErr);
        });
      });
    }
  });
}

const R2_PUBLIC_HOST = (() => {
  try {
    return process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).hostname : null;
  } catch {
    return null;
  }
})();

const ALLOWED_IMAGE_HOSTS = ["res.cloudinary.com", ...(R2_PUBLIC_HOST ? [R2_PUBLIC_HOST] : [])];

export function downloadImageBuffer(url: string): Promise<Buffer> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return Promise.reject(new Error("URL de imagen inválida"));
  }

  if (
    parsedUrl.protocol !== "https:" ||
    !ALLOWED_IMAGE_HOSTS.includes(parsedUrl.hostname)
  ) {
    return Promise.reject(new Error("Host de imagen no permitido"));
  }

  const finalUrl =
    url.includes("cloudinary.com") && url.includes("/upload/")
      ? url.replace("/upload/", "/upload/f_jpg,q_80/")
      : url;

  return new Promise((resolve, reject) => {
    const req = https.get(finalUrl, (res) => {
      if ((res.statusCode ?? 0) >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(6000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// Cache del logo ya convertido a PNG, por URL. Cada subida a R2 genera una key con
// UUID nuevo (ver r2-upload.ts) — una URL nunca cambia de contenido, así que esto
// nunca sirve un logo obsoleto. Sin esto, cada vista previa/descarga (y cada
// destinatario en un envío a varios) volvía a bajar la imagen de R2 y reconvertirla
// con sharp desde cero, aunque el logo casi nunca cambia entre una llamada y otra.
const COVER_BUFFER_CACHE_MAX = 200;
const coverBufferCache = new Map<string, Buffer>();

async function getCoverBuffer(url: string): Promise<Buffer | null> {
  const cached = coverBufferCache.get(url);
  if (cached) {
    coverBufferCache.delete(url); // re-set abajo la mueve al final (LRU: más reciente al final)
    coverBufferCache.set(url, cached);
    return cached;
  }
  const rawCover = await downloadImageBuffer(url).catch(() => null);
  if (!rawCover) return null;
  // PDFKit solo soporta JPEG/PNG — las imágenes subidas a R2 se guardan en WEBP, así que hay que convertir.
  const converted = await sharp(rawCover).png().toBuffer().catch(() => null);
  if (!converted) return null;
  coverBufferCache.set(url, converted);
  if (coverBufferCache.size > COVER_BUFFER_CACHE_MAX) {
    const oldestKey = coverBufferCache.keys().next().value;
    if (oldestKey !== undefined) coverBufferCache.delete(oldestKey);
  }
  return converted;
}

export async function generateQuotePdf(
  input: QuotePdfInput
): Promise<{ fileName: string; filePath: string }> {
  let coverBuffer: Buffer | null = null;
  if (input.brandCoverImageUrl?.trim()) {
    coverBuffer = await getCoverBuffer(input.brandCoverImageUrl.trim());
  }

  const timestamp = Date.now();
  const safeToken = sanitizeFileName(input.token);
  const fileName  = `cotizacion_${safeToken}_${timestamp}.pdf`;
  const filePath  = path.join(GENERATED_PDFS_DIR, fileName);

  switch (input.quoteStyle || "1") {
    case "2": return generateStyle2(input, coverBuffer, fileName, filePath, timestamp);
    case "3": return generateStyle3(input, coverBuffer, fileName, filePath, timestamp);
    case "4": return generateStyle4(input, coverBuffer, fileName, filePath, timestamp);
    case "5": return generateStyle5(input, coverBuffer, fileName, filePath, timestamp);
    case "6": return generateStyle6(input, coverBuffer, fileName, filePath, timestamp);
    case "7": return generateStyle7(input, coverBuffer, fileName, filePath, timestamp);
    case "8": return generateStyle8(input, coverBuffer, fileName, filePath, timestamp);
    case "9": return generateBlankTemplate(input, coverBuffer, fileName, filePath, timestamp);
    default:  return generateStyle1(input, coverBuffer, fileName, filePath, timestamp);
  }
}
