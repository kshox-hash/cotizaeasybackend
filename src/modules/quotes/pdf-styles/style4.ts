import PDFDocument from "pdfkit";
import fs from "fs";
import { formatCurrency } from "../../../utils/format";
import { QuotePdfInput } from "../quote.types";

// Estilo 4 — Moderno colorido: header bold, método de pago, consideraciones
export function generateStyle4(
  input: QuotePdfInput,
  cover: Buffer | null,
  fileName: string,
  filePath: string,
  timestamp: number,
): Promise<{ fileName: string; filePath: string }> {
  return new Promise((resolve, reject) => {
    try {
      const doc    = new PDFDocument({ margin: 0, size: "A4" });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const PW = doc.page.width;
      const PH = doc.page.height;
      const M  = 40;
      const CW = PW - M * 2;

      const brand     = input.brand?.trim() || "Mi negocio";
      const qNumber   = `F-${String(timestamp).slice(-6)}`;
      const issueDate = new Date().toLocaleDateString("es-CL");
      const cust      = input.customer ?? { name: "", email: "", phone: "", notes: "" };

      const rawAccent = input.brandAccentColor?.trim() ?? "";
      const accent    = /^#[0-9A-Fa-f]{6}$/.test(rawAccent) ? rawAccent : "#1A1A1A";

      const _lum = (hex: string) => { const r = parseInt(hex.slice(1,3),16); const g = parseInt(hex.slice(3,5),16); const b = parseInt(hex.slice(5,7),16); return (0.299*r+0.587*g+0.114*b)/255; };
      const hdrTxt = _lum(accent) > 0.55 ? "#1A1A1A" : "#FFFFFF";

      const ink    = "#111827";
      const inkSub = "#4B5563";
      const inkDim = "#9CA3AF";
      const border = "#E5E7EB";
      const rowAlt = "#F3F4F6";
      const white  = "#FFFFFF";

      // ── Full-bleed header ─────────────────────────────────────────────────────
      const HDR_H = 72;
      doc.rect(0, 0, PW, HDR_H).fill(accent);

      // Logo in header (top-left, small)
      let logoRight = M;
      if (cover) {
        try {
          const LW = 56, LH = 44;
          doc.save();
          doc.rect(M, (HDR_H - LH) / 2, LW, LH).clip();
          doc.image(cover, M, (HDR_H - LH) / 2, { fit: [LW, LH] });
          doc.restore();
          logoRight = M + LW + 14;
        } catch { /* skip */ }
      }

      // "COTIZACIÓN" large title (centered)
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(26)
         .text("COTIZACIÓN", 0, (HDR_H - 32) / 2, { width: PW, align: "center" });

      // Date + Folio (top-right of header)
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(8)
         .text(`N° ${qNumber}`, PW - M - 120, 18, { width: 120, align: "right" });
      doc.fillColor(hdrTxt).font("Helvetica").fontSize(8)
         .text(issueDate, PW - M - 120, 32, { width: 120, align: "right" });

      let y = HDR_H + 16;

      // ── Company name + client section ─────────────────────────────────────────
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(13)
         .text(brand, M, y);
      y += 18;

      if (input.brandAddress || input.brandPhone) {
        const inf = [input.brandAddress, input.brandPhone].filter(Boolean).join("  ·  ");
        doc.fillColor(inkSub).font("Helvetica").fontSize(8.5)
           .text(inf, M, y);
        y += 14;
      }
      if (input.brandRut) {
        doc.fillColor(inkDim).font("Helvetica").fontSize(8)
           .text(`RUT: ${input.brandRut}`, M, y);
        y += 12;
      }
      y += 8;

      // Client fields as labeled lines
      doc.rect(M, y, CW, 1).fill(border);
      y += 10;

      const fieldH = 22;
      const field1W = Math.floor(CW * 0.55);
      const field2X = M + field1W + 14;
      const field2W = CW - field1W - 14;

      // NOMBRE
      doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
         .text("NOMBRE DEL CLIENTE", M, y, { lineBreak: false });
      doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
         .text("EMAIL", field2X, y, { lineBreak: false });
      y += 10;
      doc.rect(M, y, field1W, fieldH).fill(rowAlt);
      doc.rect(field2X, y, field2W, fieldH).fill(rowAlt);
      doc.fillColor(ink).font("Helvetica").fontSize(9.5)
         .text(cust.name || "—", M + 8, y + 6, { width: field1W - 14, lineBreak: false });
      doc.fillColor(ink).font("Helvetica").fontSize(9.5)
         .text(cust.email || "—", field2X + 8, y + 6, { width: field2W - 14, lineBreak: false });
      doc.strokeColor(border).lineWidth(0.4)
         .rect(M, y, field1W, fieldH).stroke()
         .rect(field2X, y, field2W, fieldH).stroke();
      y += fieldH + 14;

      // ── Items table ───────────────────────────────────────────────────────────
      const qW = 44, dW = 231, pW = 100, mW = CW - qW - dW - pW;
      const qX = M, dX = M + qW, pX = dX + dW, mX = pX + pW;
      const cP = 7;
      const TH = 24;

      const drawHead = (sy: number) => {
        doc.rect(M, sy, CW, TH).fill(accent);
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(8)
           .text("CANT.",        qX + 2,  sy + 8, { width: qW - 4,      align: "center" })
           .text("DESCRIPCIÓN",  dX + cP, sy + 8, { width: dW - cP * 2 })
           .text("PRECIO UNIT.", pX + cP, sy + 8, { width: pW - cP * 2, align: "right" })
           .text("MONTO",        mX + cP, sy + 8, { width: mW - cP * 2, align: "right" });
        return sy + TH;
      };

      const ensureSpace = (cy: number, need: number, withH = false) => {
        if (cy + need <= PH - 52) return cy;
        doc.addPage();
        doc.rect(0, 0, PW, 36).fill(accent);
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(11)
           .text(brand, M, 11, { width: CW * 0.5 });
        doc.fillColor(hdrTxt).font("Helvetica").fontSize(8)
           .text(`${qNumber}  ·  ${issueDate}`, M, 11, { width: CW, align: "right" });
        let ny = 48;
        if (withH) ny = drawHead(ny);
        return ny;
      };

      const tableTop = y;
      y = drawHead(y);

      const lines = Array.isArray(input.lines) ? input.lines : [];
      lines.forEach((line, idx) => {
        const hasDesc = !!line.description?.trim();
        const itemW   = dW - cP * 2;
        doc.font("Helvetica-Bold").fontSize(9);
        const nameH = doc.heightOfString(line.name || "—", { width: itemW });
        let descH = 0;
        if (hasDesc) {
          doc.font("Helvetica").fontSize(7.5);
          descH = doc.heightOfString(line.description, { width: itemW });
        }
        const rowH = Math.max(26, Math.ceil(nameH + (hasDesc ? descH + 3 : 0) + cP * 2));
        const fill  = idx % 2 === 0 ? white : rowAlt;

        y = ensureSpace(y, rowH + 60, true);
        doc.rect(M, y, CW, rowH).fill(fill);

        [qX + qW, dX + dW, pX + pW].forEach(x => {
          doc.strokeColor(border).lineWidth(0.25).moveTo(x, y).lineTo(x, y + rowH).stroke();
        });
        doc.strokeColor(border).lineWidth(0.35).moveTo(M, y + rowH).lineTo(M + CW, y + rowH).stroke();

        const ty = y + cP;
        doc.fillColor(inkSub).font("Helvetica").fontSize(9)
           .text(String(line.quantity), qX + 2, ty, { width: qW - 4, align: "center" });
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(9)
           .text(line.name, dX + cP, ty, { width: itemW });
        if (hasDesc) {
          doc.fillColor(inkDim).font("Helvetica").fontSize(7.5)
             .text(line.description, dX + cP, ty + nameH + 2, { width: itemW });
        }
        doc.fillColor(inkSub).font("Helvetica").fontSize(9)
           .text(formatCurrency(line.unitPrice, input.currency), pX + cP, ty, { width: pW - cP * 2, align: "right" })
           .text(formatCurrency(line.subtotal, input.currency),  mX + cP, ty, { width: mW - cP * 2, align: "right" });

        y += rowH;
      });

      if (lines.length === 0) {
        doc.rect(M, y, CW, 32).fill(white);
        doc.fillColor(inkDim).font("Helvetica").fontSize(9).text("Sin ítems.", dX + cP, y + 10);
        y += 32;
      }

      doc.strokeColor(border).lineWidth(0.5)
         .moveTo(M, tableTop).lineTo(M, y).stroke()
         .moveTo(M + CW, tableTop).lineTo(M + CW, y).stroke();
      y += 14;

      // ── Notes / Description text area ─────────────────────────────────────────
      const noteText = cust.notes?.trim() || input.extraFields?.paymentConditions || "";
      if (noteText) {
        y = ensureSpace(y, 50);
        doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
           .text("NOTAS / DESCRIPCIÓN", M, y);
        y += 11;
        doc.font("Helvetica").fontSize(9);
        const nh = doc.heightOfString(noteText, { width: CW - 20 });
        const nb = Math.max(36, Math.ceil(nh) + 16);
        doc.rect(M, y, CW, nb).fill(rowAlt);
        doc.strokeColor(border).lineWidth(0.4).rect(M, y, CW, nb).stroke();
        doc.fillColor(inkSub).text(noteText, M + 10, y + 8, { width: CW - 20 });
        y += nb + 14;
      }

      // ── Totals — boxes side by side ────────────────────────────────────────
      y = ensureSpace(y, 60);
      const subtotal = input.total - (input.taxAmount || 0);
      const boxData = [
        { label: "SUBTOTAL",  value: formatCurrency(subtotal, input.currency), accent: false },
        { label: "DESCUENTO", value: "—",                            accent: false },
        ...(input.taxAmount
          ? [{ label: `${input.taxLabel || "IVA"}${input.taxRate ? ` (${input.taxRate}%)` : ""}`, value: formatCurrency(input.taxAmount, input.currency), accent: false }]
          : []),
        { label: "TOTAL",     value: formatCurrency(input.total, input.currency), accent: true  },
      ];
      const BOX_W = Math.floor(CW / boxData.length) - 6;
      const BOX_H = 44;
      boxData.forEach((b, i) => {
        const bx = M + i * (BOX_W + 9);
        doc.rect(bx, y, BOX_W, BOX_H).fill(b.accent ? accent : rowAlt);
        doc.strokeColor(border).lineWidth(0.5).rect(bx, y, BOX_W, BOX_H).stroke();
        const clr = b.accent ? hdrTxt : ink;
        doc.fillColor(b.accent ? hdrTxt : inkDim).font("Helvetica-Bold").fontSize(7.5)
           .text(b.label, bx + 8, y + 8, { width: BOX_W - 14, align: "center" });
        doc.fillColor(clr).font("Helvetica-Bold").fontSize(13)
           .text(b.value, bx + 4, y + 22, { width: BOX_W - 8, align: "center" });
      });
      y += BOX_H + 18;

      // ── Método de pago — checkboxes ───────────────────────────────────────────
      y = ensureSpace(y, 52);
      doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
         .text("MÉTODO DE PAGO", M, y);
      y += 12;

      const methods = ["Efectivo", "Transferencia bancaria", "Otro"];
      const mBoxW = Math.floor(CW / methods.length) - 6;
      methods.forEach((method, i) => {
        const mx = M + i * (mBoxW + 9);
        doc.rect(mx, y, mBoxW, 28).fill(rowAlt);
        doc.strokeColor(border).lineWidth(0.5).rect(mx, y, mBoxW, 28).stroke();
        // Checkbox square
        doc.strokeColor(inkDim).lineWidth(0.8)
           .rect(mx + 8, y + 8, 11, 11).stroke();
        doc.fillColor(inkSub).font("Helvetica").fontSize(8.5)
           .text(method, mx + 24, y + 10, { width: mBoxW - 28, lineBreak: false });
      });
      y += 28 + 16;

      // ── Consideraciones ───────────────────────────────────────────────────────
      const consText = input.extraFields?.exclusions || input.extraFields?.cancellationPolicy || "";
      if (consText || true) {
        y = ensureSpace(y, 60);
        doc.rect(M, y, CW, 18).fill(accent);
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(8)
           .text("CONSIDERACIONES", M + 8, y + 5, { width: CW - 14 });
        y += 18;
        const consContent = consText || "Sin consideraciones adicionales.";
        doc.font("Helvetica").fontSize(8.5);
        const ch = doc.heightOfString(consContent, { width: CW - 20 });
        const cb = Math.max(36, Math.ceil(ch) + 16);
        doc.rect(M, y, CW, cb).fill(rowAlt);
        doc.strokeColor(border).lineWidth(0.5).rect(M, y, CW, cb).stroke();
        doc.fillColor(inkSub).text(consContent, M + 10, y + 8, { width: CW - 20 });
        y += cb + 20;
      }

      // ── Footer ────────────────────────────────────────────────────────────────
      y = ensureSpace(y, 30);
      doc.strokeColor(border).lineWidth(0.5).moveTo(M, y).lineTo(M + CW, y).stroke();
      y += 10;
      doc.fillColor(inkDim).font("Helvetica").fontSize(7.5)
         .text(`${brand}  ·  ${qNumber}  ·  ${issueDate}  ·  Documento generado automáticamente`, M, y, { width: CW, align: "center" });

      doc.end();
      stream.on("finish", () => resolve({ fileName, filePath }));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}
