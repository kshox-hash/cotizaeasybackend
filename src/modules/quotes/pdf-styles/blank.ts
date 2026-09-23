import PDFDocument from "pdfkit";
import fs from "fs";
import { FONT_REGULAR, FONT_BOLD, registerQuoteFonts } from "./fonts";
import { formatCurrency } from "../../../utils/format";
import { DEFAULT_QUOTE_BLOCKS, QuoteBlockDef, QuoteCustomFieldType, QuotePdfInput } from "../quote.types";

// Plantilla en blanco (Estilo PDF "9") — a diferencia de style1..8, acá no hay
// un diseño fijo: se recorre input.blocks de arriba a abajo dibujando cada
// bloque según su tipo (y variante, para "client"/"items"). El orden del
// array ES el orden en la hoja. Igual de autocontenido que los otros estilos
// (mismos helpers strH/hLine/ensureSpace que style1.ts) — no hay un módulo de
// dibujo compartido entre estilos hoy, así que no se importa nada de ahí.
export function generateBlankTemplate(
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
      registerQuoteFonts(doc);

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
      const border = "#C8CDD4";
      const rowAlt = "#F4F6F8";
      const white  = "#FFFFFF";

      const strH = (text: string, font: string, size: number, w: number): number => {
        doc.font(font).fontSize(size);
        return doc.heightOfString(text || " ", { width: w });
      };
      const hLine = (y: number, color = border, lw = 0.5) => {
        doc.strokeColor(color).lineWidth(lw).moveTo(M, y).lineTo(M + CW, y).stroke();
      };
      const drawContHeader = () => {
        doc.fillColor(ink).font(FONT_BOLD).fontSize(13).text(brand, M, M, { width: CW * 0.6 });
        doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(8.5)
           .text(`Cotización N° ${qNumber}  ·  ${issueDate}`, M, M, { width: CW, align: "right" });
        hLine(M + 28, border, 0.6);
      };
      const ensureSpace = (cy: number, needed: number): number => {
        if (cy + needed <= PH - 52) return cy;
        doc.addPage();
        drawContHeader();
        return M + 46;
      };

      // Logo real (si hay) o iniciales de la marca en un recuadro/círculo de color.
      const drawLogoBox = (x: number, y: number, w: number, h: number, shape: "square" | "circle", bg: string, fg: string) => {
        if (cover) {
          try {
            doc.save();
            if (shape === "circle") doc.circle(x + w / 2, y + h / 2, Math.min(w, h) / 2).clip();
            else doc.roundedRect(x, y, w, h, 6).clip();
            doc.image(cover, x, y, { fit: [w, h], align: "center", valign: "center" });
            doc.restore();
            return;
          } catch { /* cae al bloque de inicial abajo */ }
        }
        if (shape === "circle") doc.circle(x + w / 2, y + h / 2, Math.min(w, h) / 2).fill(bg);
        else doc.roundedRect(x, y, w, h, 6).fill(bg);
        doc.fillColor(fg).font(FONT_BOLD).fontSize(h * 0.42)
           .text(brand.charAt(0).toUpperCase(), x, y + h * 0.28, { width: w, align: "center" });
      };

      // ── Bloque: Encabezado (4 variantes) ──────────────────────────────────
      const renderHeaderClassic = (sy: number): number => {
        let cy = sy;
        if (cover) {
          try {
            const LOGO_W = 140, LOGO_H = 44;
            doc.save();
            doc.rect(M, cy, LOGO_W, LOGO_H).clip();
            doc.image(cover, M, cy, { fit: [LOGO_W, LOGO_H] });
            doc.restore();
            cy += LOGO_H + 10;
          } catch { /* skip on error */ }
        }
        doc.fillColor(ink).font(FONT_BOLD).fontSize(18).text(brand, M, cy, { width: CW * 0.65 });
        doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(8.5)
           .text(`Cotización N° ${qNumber}`, M, cy + 2, { width: CW, align: "right" })
           .text(issueDate, M, cy + 14, { width: CW, align: "right" });
        cy += strH(brand, FONT_BOLD, 18, CW * 0.65) + 14;
        hLine(cy, border, 0.8);
        return cy + 16;
      };

      const renderHeaderCentered = (sy: number): number => {
        let cy = sy;
        const boxSize = 46;
        drawLogoBox(M + CW / 2 - boxSize / 2, cy, boxSize, boxSize, "square", accent, hdrTxt);
        cy += boxSize + 10;
        doc.fillColor(ink).font(FONT_BOLD).fontSize(16).text(brand, M, cy, { width: CW, align: "center" });
        cy += strH(brand, FONT_BOLD, 16, CW) + 4;
        doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(8)
           .text(`Cotización N° ${qNumber}  ·  ${issueDate}`, M, cy, { width: CW, align: "center" });
        cy += 20;
        hLine(cy, border, 0.8);
        return cy + 16;
      };

      const renderHeaderBand = (sy: number): number => {
        const bandH = 64;
        doc.rect(0, sy, PW, bandH).fill(accent);
        drawLogoBox(M, sy + (bandH - 38) / 2, 38, 38, "circle", hdrTxt, accent);
        doc.fillColor(hdrTxt).font(FONT_BOLD).fontSize(15)
           .text(brand, M + 50, sy + bandH / 2 - 9, { width: CW - 190 });
        doc.fillColor(hdrTxt).font(FONT_REGULAR).fontSize(8)
           .text(`N° ${qNumber}  ·  ${issueDate}`, M, sy + bandH / 2 - 5, { width: CW, align: "right" });
        return sy + bandH + 18;
      };

      const renderHeaderCircleSide = (sy: number): number => {
        let cy = sy;
        const size = 44;
        drawLogoBox(M, cy, size, size, "circle", accent, hdrTxt);
        doc.fillColor(ink).font(FONT_BOLD).fontSize(14).text(brand, M + size + 12, cy + 3, { width: CW - size - 12 - 140 });
        doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(8)
           .text(`Cotización N° ${qNumber}  ·  ${issueDate}`, M + size + 12, cy + 21, { width: CW - size - 12 - 140 });
        cy += size + 14;
        hLine(cy, border, 0.8);
        return cy + 16;
      };

      const renderHeader = (sy: number, variant: 1 | 2 | 3 | 4): number => {
        if (variant === 2) return renderHeaderCentered(sy);
        if (variant === 3) return renderHeaderBand(sy);
        if (variant === 4) return renderHeaderCircleSide(sy);
        return renderHeaderClassic(sy);
      };

      // ── Bloque: Datos del cliente (3 variantes) ──────────────────────────
      const clientLines: string[] = [];
      if (cust.name?.trim())  clientLines.push(cust.name.trim());
      if (cust.email?.trim()) clientLines.push(cust.email.trim());
      if (cust.phone?.trim()) clientLines.push(`Tel: ${cust.phone.trim()}`);

      const renderClient = (sy: number, variant: 1 | 2 | 3 | 4): number => {
        let cy = ensureSpace(sy, 60);
        if (variant === 4) {
          const half = CW / 2 - 10;
          doc.fillColor(inkDim).font(FONT_BOLD).fontSize(7.5)
             .text("CLIENTE", M, cy, { width: half })
             .text("PREPARADO POR", M + half + 20, cy, { width: half });
          cy += 12;
          const text = clientLines.join("\n") || "—";
          const h1 = strH(text, FONT_REGULAR, 9, half);
          doc.fillColor(ink).font(FONT_REGULAR).fontSize(9)
             .text(text, M, cy, { width: half })
             .text(brand, M + half + 20, cy, { width: half });
          return cy + Math.max(h1, 12) + 16;
        }
        if (variant === 2) {
          const text = clientLines.join("\n") || "—";
          const h = strH(text, FONT_REGULAR, 9.5, CW - 28);
          const boxH = h + 40;
          doc.rect(M, cy, CW, boxH).fill(rowAlt);
          doc.strokeColor(border).lineWidth(0.8).rect(M, cy, CW, boxH).stroke();
          doc.fillColor(inkDim).font(FONT_BOLD).fontSize(7.5).text("CLIENTE", M + 14, cy + 12, { width: CW - 28 });
          doc.fillColor(ink).font(FONT_REGULAR).fontSize(9.5).text(text, M + 14, cy + 24, { width: CW - 28 });
          return cy + boxH + 16;
        }
        if (variant === 3) {
          const rows: [string, string][] = [
            ["CLIENTE", cust.name || "—"],
            ["EMAIL", cust.email || "—"],
            ["TELÉFONO", cust.phone || "—"],
          ];
          const rowH = 20;
          const lblW = 130;
          rows.forEach(([lbl, val], i) => {
            const fill = i % 2 === 0 ? white : rowAlt;
            doc.rect(M, cy, CW, rowH).fill(fill);
            doc.strokeColor(border).lineWidth(0.4).rect(M, cy, CW, rowH).stroke();
            doc.strokeColor(border).lineWidth(0.3).moveTo(M + lblW, cy).lineTo(M + lblW, cy + rowH).stroke();
            doc.fillColor(inkDim).font(FONT_BOLD).fontSize(7.5).text(lbl, M + 10, cy + 6, { width: lblW - 16 });
            doc.fillColor(ink).font(FONT_REGULAR).fontSize(9).text(val, M + lblW + 10, cy + 5, { width: CW - lblW - 16 });
            cy += rowH;
          });
          return cy + 16;
        }
        // variant 1 (default): párrafo en línea
        doc.fillColor(inkDim).font(FONT_BOLD).fontSize(7.5).text("CLIENTE", M, cy);
        cy += 12;
        const text = clientLines.join("  ·  ") || "—";
        doc.fillColor(ink).font(FONT_REGULAR).fontSize(9.5).text(text, M, cy, { width: CW });
        return cy + strH(text, FONT_REGULAR, 9.5, CW) + 16;
      };

      // ── Bloque: Detalle de productos (3 variantes) ───────────────────────
      const lines = input.lines || [];

      const renderItemsClassic = (sy: number): number => {
        const qtyW = 50, mntW = 110, prcW = 110;
        const dscW = CW - qtyW - prcW - mntW;
        const qtyX = M, dscX = M + qtyW, prcX = dscX + dscW, mntX = prcX + prcW;
        const cPad = 8, TH = 24;
        let cy = ensureSpace(sy, 80);
        doc.rect(M, cy, CW, TH).fill(accent);
        doc.fillColor(hdrTxt).font(FONT_BOLD).fontSize(8)
           .text("CANT.", qtyX + cPad, cy + 8, { width: qtyW - cPad * 2, align: "center" })
           .text("DESCRIPCIÓN", dscX + cPad, cy + 8, { width: dscW - cPad })
           .text("PRECIO UNIT.", prcX + cPad, cy + 8, { width: prcW - cPad * 2, align: "right" })
           .text("MONTO", mntX + cPad, cy + 8, { width: mntW - cPad * 2, align: "right" });
        cy += TH;
        const tableStartY = cy;

        if (lines.length === 0) {
          doc.rect(M, cy, CW, 36).fill(white);
          doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(9).text("Sin ítems seleccionados.", dscX + cPad, cy + 12);
          cy += 36;
        } else {
          lines.forEach((line, idx) => {
            const hasDesc = !!line.description?.trim();
            const itemColW = dscW - cPad * 2;
            doc.font(FONT_BOLD).fontSize(9);
            const nameH = doc.heightOfString(line.name || "—", { width: itemColW });
            let descH = 0;
            if (hasDesc) { doc.font(FONT_REGULAR).fontSize(7.5); descH = doc.heightOfString(line.description, { width: itemColW }); }
            const rowH = Math.max(28, Math.ceil(nameH + (hasDesc ? descH + 4 : 0) + cPad * 2));
            const fill = idx % 2 === 0 ? white : rowAlt;
            cy = ensureSpace(cy, rowH + 60);
            doc.rect(M, cy, CW, rowH).fill(fill);
            [qtyX + qtyW, dscX + dscW, prcX + prcW].forEach(x => {
              doc.strokeColor(border).lineWidth(0.3).moveTo(x, cy).lineTo(x, cy + rowH).stroke();
            });
            doc.strokeColor(border).lineWidth(0.4).moveTo(M, cy + rowH).lineTo(M + CW, cy + rowH).stroke();
            const ty = cy + cPad;
            doc.fillColor(inkSub).font(FONT_REGULAR).fontSize(9)
               .text(String(line.quantity), qtyX + cPad, ty, { width: qtyW - cPad * 2, align: "center" });
            doc.fillColor(ink).font(FONT_BOLD).fontSize(9).text(line.name, dscX + cPad, ty, { width: itemColW });
            if (hasDesc) doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(7.5).text(line.description, dscX + cPad, ty + nameH + 3, { width: itemColW });
            doc.fillColor(inkSub).font(FONT_REGULAR).fontSize(9)
               .text(formatCurrency(line.unitPrice, input.currency), prcX + cPad, ty, { width: prcW - cPad * 2, align: "right" })
               .text(formatCurrency(line.subtotal, input.currency), mntX + cPad, ty, { width: mntW - cPad * 2, align: "right" });
            cy += rowH;
          });
        }
        doc.strokeColor(border).lineWidth(0.5)
           .moveTo(M, tableStartY).lineTo(M, cy).stroke()
           .moveTo(M + CW, tableStartY).lineTo(M + CW, cy).stroke();
        return cy + 16;
      };

      const renderItemsCards = (sy: number): number => {
        let cy = ensureSpace(sy, 60);
        if (lines.length === 0) {
          doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(9).text("Sin ítems seleccionados.", M, cy);
          return cy + 20;
        }
        lines.forEach((line) => {
          const hasDesc = !!line.description?.trim();
          const innerW = CW - 28;
          doc.font(FONT_BOLD).fontSize(10);
          const nameH = doc.heightOfString(line.name || "—", { width: innerW });
          let descH = 0;
          if (hasDesc) { doc.font(FONT_REGULAR).fontSize(8); descH = doc.heightOfString(line.description, { width: innerW }); }
          const boxH = nameH + (hasDesc ? descH + 4 : 0) + 34;
          cy = ensureSpace(cy, boxH + 40);
          doc.rect(M, cy, CW, boxH).fill(rowAlt);
          doc.strokeColor(border).lineWidth(0.6).rect(M, cy, CW, boxH).stroke();
          doc.fillColor(ink).font(FONT_BOLD).fontSize(10).text(line.name, M + 14, cy + 12, { width: innerW });
          if (hasDesc) doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(8).text(line.description, M + 14, cy + 12 + nameH + 3, { width: innerW });
          const qtyPriceLabel = `${line.quantity} × ${formatCurrency(line.unitPrice, input.currency)}  =  ${formatCurrency(line.subtotal, input.currency)}`;
          doc.fillColor(inkSub).font(FONT_BOLD).fontSize(9).text(qtyPriceLabel, M + 14, cy + boxH - 20, { width: innerW, align: "right" });
          cy += boxH + 10;
        });
        return cy + 6;
      };

      const renderItemsCompact = (sy: number): number => {
        let cy = ensureSpace(sy, 60);
        if (lines.length === 0) {
          doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(9).text("Sin ítems seleccionados.", M, cy);
          return cy + 20;
        }
        lines.forEach((line, idx) => {
          cy = ensureSpace(cy, 40);
          const label = `${line.name}  ×${line.quantity}`;
          doc.fillColor(ink).font(FONT_REGULAR).fontSize(9.5)
             .text(label, M, cy, { width: CW * 0.65, continued: false })
             .fillColor(ink).font(FONT_BOLD)
             .text(formatCurrency(line.subtotal, input.currency), M, cy, { width: CW, align: "right" });
          cy += 20;
          if (idx < lines.length - 1) { hLine(cy - 6, "#E4E7EC", 0.4); }
        });
        return cy + 10;
      };

      const renderItemsReceipt = (sy: number): number => {
        let cy = ensureSpace(sy, 60);
        if (lines.length === 0) {
          doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(9).text("Sin ítems seleccionados.", M, cy);
          return cy + 20;
        }
        lines.forEach((line) => {
          cy = ensureSpace(cy, 30);
          const label = `${line.name}${line.quantity > 1 ? `  ×${line.quantity}` : ""}`;
          const priceStr = formatCurrency(line.subtotal, input.currency);
          doc.font(FONT_BOLD).fontSize(9.5);
          const priceW = doc.widthOfString(priceStr);
          doc.fillColor(ink).font(FONT_REGULAR).fontSize(9.5).text(label, M, cy, { width: CW * 0.65 });
          const dotsX1 = M + Math.min(CW * 0.65, doc.widthOfString(label) + 6);
          const dotsX2 = M + CW - priceW - 8;
          if (dotsX2 > dotsX1) {
            doc.save();
            doc.dash(1, { space: 2 }).strokeColor(border).lineWidth(0.6)
               .moveTo(dotsX1, cy + 7).lineTo(dotsX2, cy + 7).stroke();
            doc.undash();
            doc.restore();
          }
          doc.fillColor(ink).font(FONT_BOLD).fontSize(9.5).text(priceStr, M, cy, { width: CW, align: "right" });
          cy += 18;
        });
        return cy + 10;
      };

      const renderItems = (sy: number, variant: 1 | 2 | 3 | 4): number => {
        if (variant === 2) return renderItemsCards(sy);
        if (variant === 3) return renderItemsCompact(sy);
        if (variant === 4) return renderItemsReceipt(sy);
        return renderItemsClassic(sy);
      };

      // ── Bloque: Totales (4 variantes) ──────────────────────────────────────
      const renderTotalsBar = (sy: number): number => {
        let cy = ensureSpace(sy, 90);
        const TOT_W = 288, TOT_X = M + CW - TOT_W, TOT_LBL_W = 170, TOT_VAL_W = TOT_W - TOT_LBL_W, TOT_ROW_H = 22;
        const subtotal = input.total - (input.taxAmount || 0);
        const smallRows: [string, string][] = [
          ["SUBTOTAL", formatCurrency(subtotal, input.currency)],
          ...(input.taxAmount
            ? ([[`${input.taxLabel || "IVA"}${input.taxRate ? ` (${input.taxRate}%)` : ""}`, formatCurrency(input.taxAmount, input.currency)]] as [string, string][])
            : []),
        ];
        smallRows.forEach(([lbl, val]) => {
          doc.rect(TOT_X, cy, TOT_LBL_W, TOT_ROW_H).fill(rowAlt);
          doc.rect(TOT_X + TOT_LBL_W, cy, TOT_VAL_W, TOT_ROW_H).fill(white);
          doc.strokeColor(border).lineWidth(0.5).rect(TOT_X, cy, TOT_W, TOT_ROW_H).stroke();
          doc.strokeColor(border).lineWidth(0.3).moveTo(TOT_X + TOT_LBL_W, cy).lineTo(TOT_X + TOT_LBL_W, cy + TOT_ROW_H).stroke();
          doc.fillColor(inkSub).font(FONT_REGULAR).fontSize(9)
             .text(lbl, TOT_X + 8, cy + 7, { width: TOT_LBL_W - 10 })
             .text(val, TOT_X + TOT_LBL_W + 5, cy + 7, { width: TOT_VAL_W - 8, align: "right" });
          cy += TOT_ROW_H;
        });
        const TOTAL_ROW_H = 26;
        doc.rect(TOT_X, cy, TOT_W, TOTAL_ROW_H).fill(accent);
        doc.strokeColor(border).lineWidth(0.3).moveTo(TOT_X + TOT_LBL_W, cy).lineTo(TOT_X + TOT_LBL_W, cy + TOTAL_ROW_H).stroke();
        doc.fillColor(hdrTxt).font(FONT_BOLD).fontSize(10)
           .text("TOTAL", TOT_X + 8, cy + 8, { width: TOT_LBL_W - 10 })
           .text(formatCurrency(input.total, input.currency), TOT_X + TOT_LBL_W + 5, cy + 8, { width: TOT_VAL_W - 8, align: "right" });
        return cy + TOTAL_ROW_H + 22;
      };

      const renderTotalsSimple = (sy: number): number => {
        let cy = ensureSpace(sy, 70);
        const W = 260, X = M + CW - W;
        const subtotal = input.total - (input.taxAmount || 0);
        doc.fillColor(inkSub).font(FONT_REGULAR).fontSize(9)
           .text("SUBTOTAL", X, cy, { width: W * 0.5 })
           .text(formatCurrency(subtotal, input.currency), X, cy, { width: W, align: "right" });
        cy += 16;
        if (input.taxAmount) {
          doc.fillColor(inkSub).font(FONT_REGULAR).fontSize(9)
             .text(`${input.taxLabel || "IVA"}${input.taxRate ? ` (${input.taxRate}%)` : ""}`, X, cy, { width: W * 0.5 })
             .text(formatCurrency(input.taxAmount, input.currency), X, cy, { width: W, align: "right" });
          cy += 16;
        }
        doc.strokeColor(border).lineWidth(0.8).moveTo(X, cy).lineTo(X + W, cy).stroke();
        cy += 8;
        doc.fillColor(ink).font(FONT_BOLD).fontSize(13)
           .text("TOTAL", X, cy, { width: W * 0.5 })
           .text(formatCurrency(input.total, input.currency), X, cy, { width: W, align: "right" });
        return cy + 26;
      };

      const renderTotalsCard = (sy: number): number => {
        const subtotal = input.total - (input.taxAmount || 0);
        const rows: [string, string][] = [
          ["Subtotal", formatCurrency(subtotal, input.currency)],
          ...(input.taxAmount
            ? ([[input.taxLabel || "IVA", formatCurrency(input.taxAmount, input.currency)]] as [string, string][])
            : []),
        ];
        const boxW = 320, boxX = M + CW - boxW;
        const boxH = 14 + rows.length * 14 + 30;
        let cy = ensureSpace(sy, boxH + 20);
        doc.rect(boxX, cy, boxW, boxH).fill(rowAlt);
        doc.strokeColor(border).lineWidth(0.8).rect(boxX, cy, boxW, boxH).stroke();
        let ry = cy + 12;
        rows.forEach(([lbl, val]) => {
          doc.fillColor(inkSub).font(FONT_REGULAR).fontSize(8)
             .text(lbl, boxX + 14, ry, { width: boxW - 28 - 100 })
             .text(val, boxX + 14, ry, { width: boxW - 28, align: "right" });
          ry += 14;
        });
        ry += 4;
        doc.fillColor(accent).font(FONT_BOLD).fontSize(15)
           .text(`TOTAL  ${formatCurrency(input.total, input.currency)}`, boxX + 14, ry, { width: boxW - 28, align: "right" });
        return cy + boxH + 20;
      };

      const renderTotalsHero = (sy: number): number => {
        let cy = ensureSpace(sy, 90);
        const subtotal = input.total - (input.taxAmount || 0);
        const fine = input.taxAmount
          ? `Subtotal ${formatCurrency(subtotal, input.currency)}  ·  ${input.taxLabel || "IVA"} ${formatCurrency(input.taxAmount, input.currency)}`
          : `Subtotal ${formatCurrency(subtotal, input.currency)}`;
        doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(8).text(fine, M, cy, { width: CW, align: "right" });
        cy += 14;
        doc.fillColor(inkDim).font(FONT_BOLD).fontSize(9).text("TOTAL A PAGAR", M, cy, { width: CW, align: "right" });
        cy += 15;
        doc.fillColor(accent).font(FONT_BOLD).fontSize(22)
           .text(formatCurrency(input.total, input.currency), M, cy, { width: CW, align: "right" });
        return cy + 34;
      };

      const renderTotals = (sy: number, variant: 1 | 2 | 3 | 4): number => {
        if (variant === 2) return renderTotalsSimple(sy);
        if (variant === 3) return renderTotalsCard(sy);
        if (variant === 4) return renderTotalsHero(sy);
        return renderTotalsBar(sy);
      };

      // ── Los 5 tipos reusados del Editor Visual — mismo dibujo que
      // renderCustomField en style1.ts. El valor viaja en extraFields[cf_<id>].
      const renderCustomBlock = (block: QuoteBlockDef, sy: number): number => {
        const type: QuoteCustomFieldType = (block.type as QuoteCustomFieldType) || "text";
        const title = block.title || "Campo";
        const value = (input.extraFields?.[`cf_${block.id}`] || "").trim();
        if (!value && type !== "signature") return sy;
        let cy = ensureSpace(sy, 60);
        const x = M, w = CW;

        if (type === "note") {
          doc.fillColor(inkDim).font(FONT_BOLD).fontSize(8).text(title, x, cy, { width: w });
          const th = strH(title, FONT_BOLD, 8, w);
          doc.fillColor(inkSub).font(FONT_REGULAR).fontSize(8).text(value, x, cy + th + 2, { width: w });
          return cy + th + 2 + strH(value, FONT_REGULAR, 8, w) + 12;
        }
        if (type === "keyvalue") {
          doc.fillColor(inkDim).font(FONT_BOLD).fontSize(7).text(title.toUpperCase(), x, cy, { width: w });
          doc.fillColor(ink).font(FONT_BOLD).fontSize(10).text(value, x, cy + 11, { width: w });
          return cy + 11 + 14 + 10;
        }
        if (type === "alert") {
          doc.font(FONT_REGULAR).fontSize(8);
          const vh = doc.heightOfString(value, { width: w - 16 });
          const boxH = 12 + 12 + vh + 8;
          doc.rect(x, cy, w, boxH).fill(rowAlt);
          doc.strokeColor(accent).lineWidth(1).rect(x, cy, w, boxH).stroke();
          doc.fillColor(accent).font(FONT_BOLD).fontSize(8).text(title, x + 8, cy + 8, { width: w - 16 });
          doc.fillColor(ink).font(FONT_REGULAR).fontSize(8).text(value, x + 8, cy + 20, { width: w - 16 });
          return cy + boxH + 12;
        }
        if (type === "signature") {
          const boxH = 44;
          doc.strokeColor(border).lineWidth(0.8).rect(x, cy, w, boxH).stroke();
          doc.strokeColor(inkDim).lineWidth(0.5).moveTo(x + 14, cy + boxH - 16).lineTo(x + w - 14, cy + boxH - 16).stroke();
          doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(7.5).text(title, x, cy + boxH - 12, { width: w, align: "center" });
          return cy + boxH + 12;
        }
        // text (default)
        doc.fillColor(inkDim).font(FONT_BOLD).fontSize(8)
           .text(`${title}: `, x, cy, { continued: true, width: w })
           .font(FONT_REGULAR).fillColor(inkSub).text(value);
        return cy + strH(`${title}: ${value}`, FONT_REGULAR, 8, w) + 10;
      };

      // ── Recorre los bloques en orden ──────────────────────────────────────
      const blocks = input.blocks?.length ? input.blocks : DEFAULT_QUOTE_BLOCKS;
      let y = M;
      for (const block of blocks) {
        if (block.type === "header") { y = renderHeader(y, block.variant || 1); continue; }
        if (block.type === "client") { y = renderClient(y, block.variant || 1); continue; }
        if (block.type === "items")  { y = renderItems(y, block.variant || 1); continue; }
        if (block.type === "totals") { y = renderTotals(y, block.variant || 1); continue; }
        y = renderCustomBlock(block, y);
      }

      y = ensureSpace(y, 20);
      doc.fillColor(inkDim).font(FONT_REGULAR).fontSize(7)
         .text(`${brand}  ·  Cotización N° ${qNumber}  ·  ${issueDate}  ·  Documento generado automáticamente`, M, y, { width: CW, align: "center" });

      doc.end();
      stream.on("finish", () => resolve({ fileName, filePath }));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}
