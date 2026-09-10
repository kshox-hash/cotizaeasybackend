export function sanitizeFileName(value: string): string {
  return String(value || "")
    .replace(/[^\w\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}