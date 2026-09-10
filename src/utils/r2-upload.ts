import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import crypto from "crypto";
import r2, { R2_BUCKET, R2_PUBLIC_URL } from "../config/r2.config";
import { withRetry } from "../core/retry";

type ResizeOptions = {
  width: number;
  height: number;
  fit?: "cover" | "inside";
};

async function resize(buffer: Buffer, opts: ResizeOptions): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(opts.width, opts.height, {
      fit: opts.fit ?? "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 70 })
    .toBuffer();
}

export async function uploadImageToR2(
  buffer: Buffer,
  folder: string,
  opts: ResizeOptions
): Promise<{ url: string; key: string }> {
  const resized = await resize(buffer, opts);
  const key = `${folder}/${crypto.randomUUID()}.webp`;

  // La key ya tiene un UUID nuevo por intento, así que reintentar un PUT nunca
  // duplica ni corrompe nada — es idempotente por construcción.
  await withRetry(() =>
    r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: resized,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      })
    )
  );

  return { url: `${R2_PUBLIC_URL}/${key}`, key };
}

export async function deleteFromR2(url: string): Promise<void> {
  const key = url.replace(`${R2_PUBLIC_URL}/`, "");
  if (!key || key === url) return;
  try {
    await withRetry(() => r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })));
  } catch (err) {
    // Borrar un archivo huérfano en R2 no es crítico para la operación que lo dispara
    // (ej. reemplazar un logo) — se registra para poder limpiar manualmente, pero no se relanza.
    console.error("[r2-upload] deleteFromR2 falló tras reintentos:", key, err);
  }
}

export async function uploadImageWithThumbnail(
  buffer: Buffer,
  folder: string,
  fullOpts: ResizeOptions,
  thumbOpts: ResizeOptions
): Promise<{ url: string; thumbnailUrl: string }> {
  const [full, thumb] = await Promise.all([
    uploadImageToR2(buffer, folder, fullOpts),
    uploadImageToR2(buffer, `${folder}/thumb`, thumbOpts),
  ]);
  return { url: full.url, thumbnailUrl: thumb.url };
}
