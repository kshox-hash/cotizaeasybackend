import PDFDocument from "pdfkit";
import fs from "fs";
import { formatCurrency } from "../../../utils/format";
import { QuotePdfInput } from "../quote.types";

// Estilo 3 — Franja de color, COTIZACIÓN centrado, secciones destinación/autorización
export function generateStyle3(
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
      const qNumber   = `P-${String(timestamp).slice(-6)}`;
      const issueDate = new Date().toLocaleDateString("es-CL");
      const cust      = input.customer ?? { name: "", email: "", phone: "", notes: "" };

      const rawAccent = input.brandAccentColor?.trim() ?? "";
      const accent    = /^#[0-9A-Fa-f]{6}$/.test(rawAccent) ? rawAccent : "#1A1A1A";

      const _lum = (hex: string) => { const r = parseInt(hex.slice(1,3),16); const g = parseInt(hex.slice(3,5),16); const b = parseInt(hex.slice(5,7),16); return (0.299*r+0.587*g+0.114*b)/255; };
      const hdrTxt = _lum(accent) > 0.55 ? "#1A1A1A" : "#FFFFFF";

      const ink    = "#1A1A1A";
      const inkSub = "#4B5563";
      const inkDim = "#9CA3AF";
      const border = "#D1D5DB";
      const rowAlt = "#F9FAFB";
      const white  = "#FFFFFF";

      // ── Full-bleed accent header band ────────────────────────────────────────
      const HDR_H = 76;
      doc.rect(0, 0, PW, HDR_H).fill(accent);

      // Logo in header (top-right of header)
      if (cover) {
        try {
          const LW = 60, LH = 48;
          const lx = PW - M - LW;
          const ly = (HDR_H - LH) / 2;
          doc.save();
          doc.rect(lx, ly, LW, LH).clip();
          doc.image(cover, lx, ly, { fit: [LW, LH] });
          doc.restore();
        } catch { /* skip */ }
      }

      // Company name + contact in header (left)
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(16)
         .text(brand, M, 16, { width: CW * 0.65, lineBreak: false });
      let hy = 38;
      const hdInfo = [input.brandAddress, input.brandPhone ? `Tel: ${input.brandPhone}` : null, input.brandRut ? `RUT: ${input.brandRut}` : null].filter(Boolean) as string[];
      if (hdInfo.length > 0) {
        doc.fillColor(hdrTxt).font("Helvetica").fontSize(8)
           .text(hdInfo.join("  ·  "), M, hy, { width: CW * 0.65 });
        hy += 14;
      }

      // N° + Date in header (right)
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(8.5)
         .text(`N° ${qNumber}`, PW - M - 130, 16, { width: 130, align: "right" });
      doc.fillColor(hdrTxt).font("Helvetica").fontSize(8)
         .text(issueDate, PW - M - 130, 30, { width: 130, align: "right" });

      let y = HDR_H;

      // ── COTIZACIÓN title ──────────────────────────────────────────────────────
      y += 12;
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(24)
         .text("COTIZACIÓN", M, y, { width: CW, align: "center" });
      y += 30;

      // Thin accent underline
      doc.rect(M + CW / 2 - 60, y, 120, 2).fill(accent);
      y += 14;

      // ── Two info panels ───────────────────────────────────────────────────────
      const PANEL_W = Math.floor(CW / 2) - 6;
      const PANEL2X = M + PANEL_W + 12;

      // Panel headers
      doc.rect(M, y, PANEL_W, 20).fill(accent);
      doc.rect(PANEL2X, y, PANEL_W, 20).fill(accent);
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(8)
         .text("INFORMACIÓN DEL CLIENTE", M + 8, y + 7, { width: PANEL_W - 10 })
         .text("DATOS DEL PROVEEDOR", PANEL2X + 8, y + 7, { width: PANEL_W - 10 });
      y += 20;

      const clientData = [
        ["Para:", cust.name || "—"],
        ["Email:", cust.email || "—"],
        cust.phone ? ["Teléfono:", cust.phone] : null,
      ].filter(Boolean) as [string, string][];

      const vendorData = [
        ["Vendedor:", brand],
        ["Validez:", "30 días desde emisión"],
        ["Emisión:", issueDate],
      ];

      const PANEL_ROW_H = 18;
      const maxPRows = Math.max(clientData.length, vendorData.length);
      const panelH = maxPRows * PANEL_ROW_H;

      clientData.forEach(([lbl, val], i) => {
        doc.rect(M, y + i * PANEL_ROW_H, PANEL_W, PANEL_ROW_H).fill(i % 2 === 0 ? white : rowAlt);
        doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
           .text(lbl, M + 8, y + i * PANEL_ROW_H + 5, { width: 60, lineBreak: false });
        doc.fillColor(ink).font("Helvetica").fontSize(8)
           .text(val, M + 70, y + i * PANEL_ROW_H + 5, { width: PANEL_W - 75, lineBreak: false });
      });
      vendorData.forEach(([lbl, val], i) => {
        doc.rect(PANEL2X, y + i * PANEL_ROW_H, PANEL_W, PANEL_ROW_H).fill(i % 2 === 0 ? white : rowAlt);
        doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
           .text(lbl, PANEL2X + 8, y + i * PANEL_ROW_H + 5, { width: 60, lineBreak: false });
        doc.fillColor(ink).font("Helvetica").fontSize(8)
           .text(val, PANEL2X + 70, y + i * PANEL_ROW_H + 5, { width: PANEL_W - 75, lineBreak: false });
      });

      doc.strokeColor(border).lineWidth(0.5)
         .rect(M, y, PANEL_W, panelH).stroke()
         .rect(PANEL2X, y, PANEL_W, panelH).stroke();
      y += panelH + 18;

      // ── Items table ───────────────────────────────────────────────────────────
      const qW = 44, dW = 231, pW = 100, mW = CW - qW - dW - pW;
      const qX = M, dX = M + qW, pX = dX + dW, mX = pX + pW;
      const cP = 7;
      const TH = 22;

      const drawHead = (sy: number) => {
        doc.rect(M, sy, CW, TH).fill(accent);
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(7.5)
           .text("CANT.",         qX + 2,   sy + 7, { width: qW - 4,      align: "center" })
           .text("DESCRIPCIÓN",   dX + cP,  sy + 7, { width: dW - cP * 2 })
           .text("PRECIO UNIT.",  pX + cP,  sy + 7, { width: pW - cP * 2, align: "right" })
           .text("MONTO",         mX + cP,  sy + 7, { width: mW - cP * 2, align: "right" });
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
        let ny = 50;
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
        doc.fillColor(inkDim).font("Helvetica").fontSize(9)
           .text("Sin ítems.", dX + cP, y + 10);
        y += 32;
      }

      doc.strokeColor(border).lineWidth(0.5)
         .moveTo(M, tableTop).lineTo(M, y).stroke()
         .moveTo(M + CW, tableTop).lineTo(M + CW, y).stroke();
      y += 10;

      // ── Totals ────────────────────────────────────────────────────────────────
      y = ensureSpace(y, 70);
      const TW = 270, TX = M + CW - TW, TLW = 160, TVW = TW - TLW, TRH = 20;

      const subtotal = input.total - (input.taxAmount || 0);
      ([[`SUBTOTAL`, formatCurrency(subtotal, input.currency), false],
       [`DESCUENTO`, "—", false],
       ...(input.taxAmount ? [[`${input.taxLabel || "IVA"}${input.taxRate ? ` (${input.taxRate}%)` : ""}`, formatCurrency(input.taxAmount, input.currency), false]] : []),
       [`TOTAL`, formatCurrency(input.total, input.currency), true]] as [string, string, boolean][]).forEach(([lbl, val, bold]) => {
        const isBold = bold as boolean;
        doc.rect(TX, y, TLW, TRH).fill(isBold ? accent : rowAlt);
        doc.rect(TX + TLW, y, TVW, TRH).fill(isBold ? accent : white);
        doc.strokeColor(border).lineWidth(0.4).rect(TX, y, TW, TRH).stroke();
        doc.strokeColor(border).lineWidth(0.3)
           .moveTo(TX + TLW, y).lineTo(TX + TLW, y + TRH).stroke();
        const clr = isBold ? hdrTxt : ink;
        doc.fillColor(clr).font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(isBold ? 10 : 8.5)
           .text(lbl as string, TX + 8, y + (TRH - (isBold ? 12 : 10)) / 2, { width: TLW - 10 })
           .text(val as string, TX + TLW + 5, y + (TRH - (isBold ? 12 : 10)) / 2, { width: TVW - 8, align: "right" });
        y += TRH;
      });
      y += 18;

      // ── DESTINACIÓN + AUTORIZACIÓN side-by-side ───────────────────────────────
      y = ensureSpace(y, 80);
      const DEST_W = Math.floor(CW / 2) - 6;
      const AUTH_X = M + DEST_W + 12;

      doc.rect(M, y, DEST_W, 18).fill(accent);
      doc.rect(AUTH_X, y, DEST_W, 18).fill(accent);
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(8)
         .text("DESTINACIÓN", M + 8, y + 5, { width: DEST_W - 10 })
         .text("AUTORIZACIÓN", AUTH_X + 8, y + 5, { width: DEST_W - 10 });
      y += 18;

      const BOX_H = 52;
      doc.rect(M, y, DEST_W, BOX_H).fill(rowAlt);
      doc.rect(AUTH_X, y, DEST_W, BOX_H).fill(rowAlt);
      doc.strokeColor(border).lineWidth(0.5)
         .rect(M, y, DEST_W, BOX_H).stroke()
         .rect(AUTH_X, y, DEST_W, BOX_H).stroke();

      // Destination: client name
      doc.fillColor(inkSub).font("Helvetica").fontSize(8.5)
         .text(cust.name || "—", M + 8, y + 8, { width: DEST_W - 14 });

      // Authorization: signature line
      doc.strokeColor(border).lineWidth(0.6)
         .moveTo(AUTH_X + 14, y + BOX_H - 14).lineTo(AUTH_X + DEST_W - 14, y + BOX_H - 14).stroke();
      doc.fillColor(inkDim).font("Helvetica").fontSize(7)
         .text("Firma", AUTH_X + 14, y + BOX_H - 9, { width: DEST_W - 28, align: "center" });
      y += BOX_H + 16;

      // ── FORMA DE PAGO ─────────────────────────────────────────────────────────
      y = ensureSpace(y, 50);
      doc.rect(M, y, CW, 18).fill(accent);
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(8)
         .text("FORMA DE PAGO", M + 8, y + 5, { width: CW - 10 });
      y += 18;

      const payText = input.extraFields?.paymentConditions || cust.notes || "—";
      doc.font("Helvetica").fontSize(9);
      const payH = doc.heightOfString(payText, { width: CW - 20 });
      const payBlock = Math.max(32, Math.ceil(payH) + 16);
      doc.rect(M, y, CW, payBlock).fill(rowAlt);
      doc.strokeColor(border).lineWidth(0.5).rect(M, y, CW, payBlock).stroke();
      doc.fillColor(inkSub).text(payText, M + 10, y + 8, { width: CW - 20 });
      y += payBlock + 20;

      // ── Footer ────────────────────────────────────────────────────────────────
      y = ensureSpace(y, 32);
      doc.rect(0, y, PW, 26).fill(accent);
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(8.5)
         .text("Cotización válida por 30 días desde la fecha de emisión.", 0, y + 8, { width: PW, align: "center" });
      y += 30;

      doc.fillColor(inkDim).font("Helvetica").fontSize(7)
         .text(`${brand}  ·  ${qNumber}  ·  ${issueDate}`, M, y, { width: CW, align: "center" });

      doc.end();
      stream.on("finish", () => resolve({ fileName, filePath }));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}
