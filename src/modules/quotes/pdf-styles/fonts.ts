import path from "path";
import PDFDocument from "pdfkit";

// PT Sans (SIL Open Font License 1.1) — reemplaza a Helvetica en las 8
// plantillas. Antes de esto, cada cotización salía con la fuente por
// defecto del sistema, que es lo primero que delata un PDF genérico hecho
// con una librería en vez de un documento con identidad propia.
// Archivos en backend/assets/fonts/ (fuera de src/, tsc no los toca).
export const FONT_REGULAR     = "PTSans";
export const FONT_BOLD        = "PTSans-Bold";
export const FONT_BOLD_ITALIC = "PTSans-BoldItalic";

const FONTS_DIR = path.join(__dirname, "..", "..", "..", "..", "assets", "fonts");

export function registerQuoteFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(FONT_REGULAR, path.join(FONTS_DIR, "PTSans-Regular.ttf"));
  doc.registerFont(FONT_BOLD, path.join(FONTS_DIR, "PTSans-Bold.ttf"));
  doc.registerFont(FONT_BOLD_ITALIC, path.join(FONTS_DIR, "PTSans-BoldItalic.ttf"));
}
