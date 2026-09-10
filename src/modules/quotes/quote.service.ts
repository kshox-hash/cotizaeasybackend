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

export type { QuotePdfInput, QuoteTemplateType };

export const GENERATED_PDFS_DIR = path.join(__dirname, "..", "generated-pdfs");

if (!fs.existsSync(GENERATED_PDFS_DIR)) {
  fs.mkdirSync(GENERATED_PDFS_DIR, { recursive: true });
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

export async function generateQuotePdf(
  input: QuotePdfInput
): Promise<{ fileName: string; filePath: string }> {
  let coverBuffer: Buffer | null = null;
  if (input.brandCoverImageUrl?.trim()) {
    const rawCover = await downloadImageBuffer(input.brandCoverImageUrl).catch(() => null);
    // PDFKit solo soporta JPEG/PNG — las imágenes subidas a R2 se guardan en WEBP, así que hay que convertir.
    coverBuffer = rawCover ? await sharp(rawCover).png().toBuffer().catch(() => null) : null;
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
    default:  return generateStyle1(input, coverBuffer, fileName, filePath, timestamp);
  }
}
