import PDFDocument from "pdfkit";
import fs from "fs";
import { formatCurrency } from "../../../utils/format";
import { QuotePdfInput } from "../quote.types";

// Estilo 5 — Sidebar oscuro con info de empresa, contenido limpio a la derecha
export function generateStyle5(
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

      const brand     = input.brand?.trim() || "Mi negocio";
      const qNumber   = `E-${String(timestamp).slice(-6)}`;
      const issueDate = new Date().toLocaleDateString("es-CL");
      const cust      = input.customer ?? { name: "", email: "", phone: "", notes: "" };

      const rawAccent = input.brandAccentColor?.trim() ?? "";
      const accent    = /^#[0-9A-Fa-f]{6}$/.test(rawAccent) ? rawAccent : "#1A1A1A";

      const _lum = (hex: string) => { const r = parseInt(hex.slice(1,3),16); const g = parseInt(hex.slice(3,5),16); const b = parseInt(hex.slice(5,7),16); return (0.299*r+0.587*g+0.114*b)/255; };
      const hdrTxt    = _lum(accent) > 0.55 ? "#1A1A1A" : "#FFFFFF";
      const hdrTxtSub = _lum(accent) > 0.55 ? "#4B5563" : "#D1D5DB";

      const sidebarBg  = accent;
      const sideAccent = "#9CA3AF";  // used only for thin divider lines in sidebar
      const white      = "#FFFFFF";
      const ink        = "#111827";
      const inkSub     = "#4B5563";
      const inkDim     = "#9CA3AF";
      const border     = "#E5E7EB";
      const rowAlt     = "#F3F4F6";

      // ── Sidebar constants ────────────────────────────────────────────────────
      const SB_W  = 130;  // sidebar width
      const SB_P  = 16;   // sidebar inner horizontal padding
      const SB_IW = SB_W - SB_P * 2;  // sidebar text width

      // ── Content area constants ────────────────────────────────────────────────
      const CON_X = SB_W + 20;
      const CON_W = PW - CON_X - 30;

      const drawSidebar = () => {
        doc.rect(0, 0, SB_W, PH).fill(sidebarBg);

        let sy = 28;

        // Logo or initials
        const LOGO_SZ = 64;
        const lx = (SB_W - LOGO_SZ) / 2;
        if (cover) {
          try {
            doc.save();
            doc.rect(lx, sy, LOGO_SZ, LOGO_SZ).clip();
            doc.image(cover, lx, sy, { fit: [LOGO_SZ, LOGO_SZ] });
            doc.restore();
          } catch {
            // fallback to initials
            doc.rect(lx, sy, LOGO_SZ, LOGO_SZ).fill(sideAccent);
            const init = (brand[0] || "M").toUpperCase();
            doc.fillColor(ink).font("Helvetica-Bold").fontSize(30)
               .text(init, lx, sy + 16, { width: LOGO_SZ, align: "center" });
          }
        } else {
          doc.rect(lx, sy, LOGO_SZ, LOGO_SZ).fill(sideAccent);
          const init = (brand[0] || "M").toUpperCase();
          doc.fillColor(ink).font("Helvetica-Bold").fontSize(30)
             .text(init, lx, sy + 16, { width: LOGO_SZ, align: "center" });
        }
        sy += LOGO_SZ + 14;

        // Brand name
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(10)
           .text(brand, SB_P, sy, { width: SB_IW, align: "center" });
        sy += doc.heightOfString(brand, { width: SB_IW }) + 10;

        // Thin divider
        doc.rect(SB_P, sy, SB_IW, 1).fill(sideAccent);
        sy += 12;

        // Contact info
        const infoItems: [string, string][] = [];
        if (input.brandAddress) infoItems.push(["DIRECCIÓN", input.brandAddress]);
        if (input.brandPhone)   infoItems.push(["TELÉFONO",  input.brandPhone]);
        if (input.brandRut)     infoItems.push(["RUT",       input.brandRut]);

        infoItems.forEach(([lbl, val]) => {
          doc.fillColor(hdrTxtSub).font("Helvetica-Bold").fontSize(6.5)
             .text(lbl, SB_P, sy, { width: SB_IW });
          sy += 9;
          doc.fillColor(hdrTxt).font("Helvetica").fontSize(8)
             .text(val, SB_P, sy, { width: SB_IW });
          sy += doc.heightOfString(val, { width: SB_IW }) + 8;
        });

        // Divider before quote number
        doc.rect(SB_P, sy, SB_IW, 1).fill(sideAccent);
        sy += 12;

        // Quote number at bottom of info section
        doc.fillColor(hdrTxtSub).font("Helvetica-Bold").fontSize(6.5)
           .text("N° DOCUMENTO", SB_P, sy, { width: SB_IW });
        sy += 9;
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(10)
           .text(qNumber, SB_P, sy, { width: SB_IW, align: "center" });
        sy += 18;
        doc.fillColor(hdrTxtSub).font("Helvetica").fontSize(7.5)
           .text(issueDate, SB_P, sy, { width: SB_IW, align: "center" });
      };

      // Draw sidebar on first page
      drawSidebar();

      // ── Content area ─────────────────────────────────────────────────────────
      let y = 36;

      // Title
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(28)
         .text("COTIZACIÓN", CON_X, y, { width: CON_W });
      y += 38;

      // Thin line below title
      doc.rect(CON_X, y, CON_W, 2).fill(accent);
      y += 10;

      // ── Client info ────────────────────────────────────────────────────────
      doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
         .text("PARA:", CON_X, y);
      y += 11;

      const clientLines: string[] = [];
      if (cust.name?.trim())  clientLines.push(cust.name.trim());
      if (cust.email?.trim()) clientLines.push(cust.email.trim());
      if (cust.phone?.trim()) clientLines.push(`Tel: ${cust.phone.trim()}`);

      clientLines.forEach(line => {
        doc.fillColor(ink).font("Helvetica").fontSize(9.5)
           .text(line, CON_X, y, { width: CON_W, lineBreak: false });
        y += 14;
      });
      y += 8;

      // Validity badge
      doc.rect(CON_X, y, CON_W, 20).fill(rowAlt);
      doc.strokeColor(border).lineWidth(0.4).rect(CON_X, y, CON_W, 20).stroke();
      doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
         .text("VÁLIDO POR:", CON_X + 8, y + 6, { width: 65, lineBreak: false });
      doc.fillColor(ink).font("Helvetica").fontSize(8.5)
         .text("30 días desde la emisión", CON_X + 76, y + 6, { width: CON_W - 82, lineBreak: false });
      y += 20 + 14;

      // Notes
      if (cust.notes?.trim()) {
        doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
           .text("NOTAS:", CON_X, y);
        y += 11;
        doc.font("Helvetica").fontSize(8.5);
        const nh = doc.heightOfString(cust.notes.trim(), { width: CON_W });
        doc.fillColor(inkSub).text(cust.notes.trim(), CON_X, y, { width: CON_W });
        y += nh + 12;
      }

      // ── Items table ───────────────────────────────────────────────────────────
      const qW = 36, dW = Math.floor(CON_W * 0.44), pW = 80, mW = CON_W - qW - dW - pW;
      const qX = CON_X, dX = CON_X + qW, pX = dX + dW, mX = pX + pW;
      const cP = 6;
      const TH = 22;

      const drawHead = (sy: number) => {
        doc.rect(CON_X, sy, CON_W, TH).fill(accent);
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(7.5)
           .text("CANT",        qX + 2,  sy + 7, { width: qW - 4,      align: "center" })
           .text("DESCRIPCIÓN", dX + cP, sy + 7, { width: dW - cP * 2 })
           .text("PRECIO",      pX + cP, sy + 7, { width: pW - cP * 2, align: "right" })
           .text("MONTO",       mX + cP, sy + 7, { width: mW - cP * 2, align: "right" });
        return sy + TH;
      };

      const ensureSpace = (cy: number, need: number, withH = false) => {
        if (cy + need <= PH - 48) return cy;
        doc.addPage();
        drawSidebar();
        let ny = 36;
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
        const rowH = Math.max(24, Math.ceil(nameH + (hasDesc ? descH + 3 : 0) + cP * 2));
        const fill  = idx % 2 === 0 ? white : rowAlt;

        y = ensureSpace(y, rowH + 50, true);
        doc.rect(CON_X, y, CON_W, rowH).fill(fill);

        [qX + qW, dX + dW, pX + pW].forEach(x => {
          doc.strokeColor(border).lineWidth(0.25).moveTo(x, y).lineTo(x, y + rowH).stroke();
        });
        doc.strokeColor(border).lineWidth(0.3).moveTo(CON_X, y + rowH).lineTo(CON_X + CON_W, y + rowH).stroke();

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
        doc.rect(CON_X, y, CON_W, 30).fill(white);
        doc.fillColor(inkDim).font("Helvetica").fontSize(9).text("Sin ítems.", dX + cP, y + 9);
        y += 30;
      }

      doc.strokeColor(border).lineWidth(0.5)
         .moveTo(CON_X, tableTop).lineTo(CON_X, y).stroke()
         .moveTo(CON_X + CON_W, tableTop).lineTo(CON_X + CON_W, y).stroke();
      y += 12;

      // ── Totals ────────────────────────────────────────────────────────────────
      y = ensureSpace(y, 80);
      const TW = CON_W, TX = CON_X, TLW = Math.floor(CON_W * 0.6), TVW = TW - TLW, TRH = 20;

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
      y += 24;

      // ── Footer ────────────────────────────────────────────────────────────────
      y = ensureSpace(y, 32);
      doc.rect(CON_X, y, CON_W, 1).fill(accent);
      y += 10;
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(10)
         .text("¡Gracias por su preferencia!", CON_X, y, { width: CON_W, align: "center" });
      y += 16;
      doc.fillColor(inkDim).font("Helvetica").fontSize(7.5)
         .text(`${brand}  ·  ${qNumber}  ·  ${issueDate}`, CON_X, y, { width: CON_W, align: "center" });

      doc.end();
      stream.on("finish", () => resolve({ fileName, filePath }));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}
