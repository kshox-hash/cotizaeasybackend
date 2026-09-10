import PDFDocument from "pdfkit";
import fs from "fs";
import { formatCurrency } from "../../../utils/format";
import { QuotePdfInput } from "../quote.types";

// Estilo 2 — Monograma / Logo block, detalle de cuotas, firma
export function generateStyle2(
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
      const qNumber   = `Q-${String(timestamp).slice(-6)}`;
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
      const rowAlt = "#F4F6F8";
      const white  = "#FFFFFF";

      // ── Monogram / Logo (top-left) ───────────────────────────────────────────
      const MONO_W = 88;
      const MONO_H = 88;
      let yL = M;

      if (cover) {
        try {
          doc.save();
          doc.rect(M, yL, MONO_W, MONO_H).clip();
          doc.image(cover, M, yL, { fit: [MONO_W, MONO_H] });
          doc.restore();
        } catch { /* fallback to monogram */ }
      } else {
        doc.rect(M, yL, MONO_W, MONO_H).fill(accent);
        const initial = (brand[0] || "M").toUpperCase();
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(42)
           .text(initial, M, yL + 20, { width: MONO_W, align: "center" });
      }
      yL += MONO_H + 10;

      // Company info below monogram
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(11)
         .text(brand, M, yL, { width: 180 });
      yL += 16;
      if (input.brandRut) {
        doc.fillColor(inkSub).font("Helvetica").fontSize(8)
           .text(`RUT: ${input.brandRut}`, M, yL, { width: 180 });
        yL += 12;
      }
      if (input.brandAddress) {
        doc.fillColor(inkSub).font("Helvetica").fontSize(8)
           .text(input.brandAddress, M, yL, { width: 180 });
        yL += 12;
      }
      if (input.brandPhone) {
        doc.fillColor(inkSub).font("Helvetica").fontSize(8)
           .text(`Tel: ${input.brandPhone}`, M, yL, { width: 180 });
        yL += 12;
      }

      // ── Right column: Title + quote info ────────────────────────────────────
      const RIGHT_X = M + 210;
      const RIGHT_W = CW - 210;
      let yR = M;

      doc.fillColor(ink).font("Helvetica-Bold").fontSize(22)
         .text("Cotización en PDF", RIGHT_X, yR, { width: RIGHT_W, align: "right" });
      yR += 32;

      const INFO_ROWS: [string, string][] = [
        ["FECHA DE EMISIÓN",  issueDate],
        ["N° DOCUMENTO",      qNumber],
        ["VÁLIDO POR",        "30 días"],
      ];
      const IR_H   = 20;
      const LBL_W  = 120;
      const VAL_W  = RIGHT_W - LBL_W;

      INFO_ROWS.forEach(([lbl, val], i) => {
        const ry = yR + i * IR_H;
        doc.rect(RIGHT_X, ry, LBL_W, IR_H).fill("#EEF0F4");
        doc.rect(RIGHT_X + LBL_W, ry, VAL_W, IR_H).fill(white);
        doc.strokeColor(border).lineWidth(0.4).rect(RIGHT_X, ry, RIGHT_W, IR_H).stroke();
        doc.strokeColor(border).lineWidth(0.3)
           .moveTo(RIGHT_X + LBL_W, ry).lineTo(RIGHT_X + LBL_W, ry + IR_H).stroke();
        doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7)
           .text(lbl, RIGHT_X + 6, ry + 7, { width: LBL_W - 8 });
        doc.fillColor(ink).font("Helvetica").fontSize(8)
           .text(val, RIGHT_X + LBL_W + 6, ry + 7, { width: VAL_W - 8, align: "right" });
      });
      yR += INFO_ROWS.length * IR_H;

      let y = Math.max(yL, yR) + 20;

      // ── Section divider ──────────────────────────────────────────────────────
      doc.rect(M, y, CW, 2).fill(accent);
      y += 14;

      // ── Company + Client two-column section ──────────────────────────────────
      const COL_W = Math.floor(CW / 2) - 8;
      const COL2X = M + COL_W + 16;

      doc.rect(M, y, COL_W, 18).fill(accent);
      doc.rect(COL2X, y, COL_W, 18).fill(accent);
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(7.5)
         .text("EMPRESA EMISORA", M + 8, y + 6, { width: COL_W - 10 })
         .text("CLIENTE / DESTINATARIO", COL2X + 8, y + 6, { width: COL_W - 10 });
      y += 18;

      // Content rows
      const companyLines = [brand, input.brandAddress || "", input.brandRut ? `RUT: ${input.brandRut}` : "", input.brandPhone ? `Tel: ${input.brandPhone}` : ""].filter(Boolean);
      const clientLines  = [cust.name || "—", cust.email || "", cust.phone ? `Tel: ${cust.phone}` : ""].filter(Boolean);
      const maxRows = Math.max(companyLines.length, clientLines.length);

      companyLines.forEach((line, i) => {
        const ry = y + i * 16;
        doc.rect(M, ry, COL_W, 16).fill(i % 2 === 0 ? white : rowAlt);
        doc.fillColor(ink).font("Helvetica").fontSize(8.5)
           .text(line, M + 8, ry + 4, { width: COL_W - 14, lineBreak: false });
      });
      clientLines.forEach((line, i) => {
        const ry = y + i * 16;
        doc.rect(COL2X, ry, COL_W, 16).fill(i % 2 === 0 ? white : rowAlt);
        doc.fillColor(ink).font("Helvetica").fontSize(8.5)
           .text(line, COL2X + 8, ry + 4, { width: COL_W - 14, lineBreak: false });
      });
      doc.strokeColor(border).lineWidth(0.5)
         .rect(M, y, COL_W, maxRows * 16).stroke()
         .rect(COL2X, y, COL_W, maxRows * 16).stroke();
      y += maxRows * 16 + 18;

      // ── Items table ──────────────────────────────────────────────────────────
      // Columns: CANT(40) | DESCRIPCIÓN(215) | PRECIO(90) | DTO(45) | MONTO(125)
      const cntW = 40, dscW = 215, prcW = 90, dtoW = 45, amtW = CW - cntW - dscW - prcW - dtoW;
      const cntX = M;
      const dscX2 = cntX + cntW;
      const prcX2 = dscX2 + dscW;
      const dtoX  = prcX2 + prcW;
      const amtX  = dtoX + dtoW;
      const cPad  = 7;
      const TH    = 24;

      const drawHead = (sy: number) => {
        doc.rect(M, sy, CW, TH).fill(accent);
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(7.5)
           .text("CANT",        cntX + 2,       sy + 8, { width: cntW - 4,        align: "center" })
           .text("DESCRIPCIÓN", dscX2 + cPad,   sy + 8, { width: dscW - cPad * 2 })
           .text("PRECIO UNIT", prcX2 + cPad,   sy + 8, { width: prcW - cPad * 2, align: "right" })
           .text("DTO",         dtoX + 2,        sy + 8, { width: dtoW - 4,        align: "center" })
           .text("MONTO",       amtX + cPad,     sy + 8, { width: amtW - cPad * 2, align: "right" });
        return sy + TH;
      };

      const ensureSpace = (cy: number, need: number, withH = false) => {
        if (cy + need <= PH - 52) return cy;
        doc.addPage();
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(12)
           .text(brand, M, M, { width: CW * 0.5 });
        doc.fillColor(inkDim).font("Helvetica").fontSize(8)
           .text(`${qNumber}  ·  ${issueDate}`, M, M, { width: CW, align: "right" });
        doc.strokeColor(border).lineWidth(0.5).moveTo(M, M + 26).lineTo(M + CW, M + 26).stroke();
        let ny = M + 40;
        if (withH) ny = drawHead(ny);
        return ny;
      };

      const tableTop = y;
      y = drawHead(y);

      const lines = Array.isArray(input.lines) ? input.lines : [];
      lines.forEach((line, idx) => {
        const hasDesc  = !!line.description?.trim();
        const itemW    = dscW - cPad * 2;
        doc.font("Helvetica-Bold").fontSize(9);
        const nameH = doc.heightOfString(line.name || "—", { width: itemW });
        let descH = 0;
        if (hasDesc) {
          doc.font("Helvetica").fontSize(7.5);
          descH = doc.heightOfString(line.description, { width: itemW });
        }
        const rowH = Math.max(26, Math.ceil(nameH + (hasDesc ? descH + 3 : 0) + cPad * 2));
        const fill  = idx % 2 === 0 ? white : rowAlt;

        y = ensureSpace(y, rowH + 60, true);
        doc.rect(M, y, CW, rowH).fill(fill);

        const dividers = [cntX + cntW, dscX2 + dscW, prcX2 + prcW, dtoX + dtoW];
        dividers.forEach(x => {
          doc.strokeColor(border).lineWidth(0.25).moveTo(x, y).lineTo(x, y + rowH).stroke();
        });
        doc.strokeColor(border).lineWidth(0.35).moveTo(M, y + rowH).lineTo(M + CW, y + rowH).stroke();

        const ty = y + cPad;
        doc.fillColor(inkSub).font("Helvetica").fontSize(8.5)
           .text(String(line.quantity), cntX + 2, ty, { width: cntW - 4, align: "center" });
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(9)
           .text(line.name, dscX2 + cPad, ty, { width: itemW });
        if (hasDesc) {
          doc.fillColor(inkDim).font("Helvetica").fontSize(7.5)
             .text(line.description, dscX2 + cPad, ty + nameH + 2, { width: itemW });
        }
        doc.fillColor(inkSub).font("Helvetica").fontSize(8.5)
           .text(formatCurrency(line.unitPrice, input.currency), prcX2 + cPad, ty, { width: prcW - cPad * 2, align: "right" })
           .text("0%", dtoX + 2, ty, { width: dtoW - 4, align: "center" })
           .text(formatCurrency(line.subtotal, input.currency), amtX + cPad, ty, { width: amtW - cPad * 2, align: "right" });

        y += rowH;
      });

      if (lines.length === 0) {
        doc.rect(M, y, CW, 34).fill(white);
        doc.fillColor(inkDim).font("Helvetica").fontSize(9)
           .text("Sin ítems.", dscX2 + cPad, y + 11);
        y += 34;
      }

      doc.strokeColor(border).lineWidth(0.5)
         .moveTo(M, tableTop).lineTo(M, y).stroke()
         .moveTo(M + CW, tableTop).lineTo(M + CW, y).stroke();
      y += 12;

      // ── Totals (right-aligned, 6 rows) ───────────────────────────────────────
      y = ensureSpace(y, 140);
      const TOT_W   = 300;
      const TOT_X   = M + CW - TOT_W;
      const TOT_LW  = 180;
      const TOT_VW  = TOT_W - TOT_LW;
      const ROW_H   = 20;

      const subtotal = input.total - (input.taxAmount || 0);
      const totRows: [string, string, boolean][] = [
        ["SUBTOTAL",             formatCurrency(subtotal, input.currency), false],
        ["DESCUENTO (0%)",       "—",                            false],
        ...(input.taxAmount
          ? ([[`${input.taxLabel || "IVA"}${input.taxRate ? ` (${input.taxRate}%)` : ""}`, formatCurrency(input.taxAmount, input.currency), false]] as [string, string, boolean][])
          : []),
        ["COBROS DE ENVÍO",      "—",                            false],
        ["TOTAL",                formatCurrency(input.total, input.currency), true ],
        ["SALDO ADEUDADO",       formatCurrency(input.total, input.currency), false],
      ];

      totRows.forEach(([lbl, val, isBold]) => {
        const bg = isBold ? accent : rowAlt;
        doc.rect(TOT_X, y, TOT_LW, ROW_H).fill(bg);
        doc.rect(TOT_X + TOT_LW, y, TOT_VW, ROW_H).fill(isBold ? accent : white);
        doc.strokeColor(border).lineWidth(0.4).rect(TOT_X, y, TOT_W, ROW_H).stroke();
        doc.strokeColor(border).lineWidth(0.3)
           .moveTo(TOT_X + TOT_LW, y).lineTo(TOT_X + TOT_LW, y + ROW_H).stroke();

        const fnt = isBold ? "Helvetica-Bold" : "Helvetica";
        const clr = isBold ? hdrTxt : ink;
        doc.fillColor(clr).font(fnt).fontSize(isBold ? 10 : 8.5)
           .text(lbl, TOT_X + 8, y + (ROW_H - (isBold ? 12 : 10)) / 2, { width: TOT_LW - 10 })
           .text(val, TOT_X + TOT_LW + 5, y + (ROW_H - (isBold ? 12 : 10)) / 2, { width: TOT_VW - 8, align: "right" });
        y += ROW_H;
      });
      y += 20;

      // ── Notes ────────────────────────────────────────────────────────────────
      const noteText = cust.notes?.trim() || (input.extraFields?.paymentConditions ?? "");
      if (noteText) {
        y = ensureSpace(y, 60);
        doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
           .text("NOTAS / CONDICIONES:", M, y);
        y += 12;
        doc.font("Helvetica").fontSize(9);
        const nh = doc.heightOfString(noteText, { width: CW });
        doc.fillColor(inkSub).text(noteText, M, y, { width: CW });
        y += nh + 16;
      }

      // ── Signature ────────────────────────────────────────────────────────────
      y = ensureSpace(y, 56);
      const sigX = M + CW - 200;
      doc.strokeColor(border).lineWidth(0.6)
         .moveTo(sigX, y + 28).lineTo(sigX + 190, y + 28).stroke();
      doc.fillColor(inkDim).font("Helvetica").fontSize(8)
         .text("Firma autorizada", sigX, y + 32, { width: 190, align: "center" });
      doc.fillColor(inkDim).font("Helvetica").fontSize(7.5)
         .text(brand, sigX, y + 44, { width: 190, align: "center" });

      doc.end();
      stream.on("finish", () => resolve({ fileName, filePath }));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}
