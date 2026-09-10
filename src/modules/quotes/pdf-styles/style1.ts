import PDFDocument from "pdfkit";
import fs from "fs";
import { formatCurrency } from "../../../utils/format";
import { QuotePdfInput, QuoteTemplateType, TEMPLATE_LABELS } from "../quote.types";

export function generateStyle1(
  input: QuotePdfInput,
  cover: Buffer | null,
  fileName: string,
  filePath: string,
  timestamp: number,
): Promise<{ fileName: string; filePath: string }> {
  return new Promise((resolve, reject) => {
    try {
      const tType: QuoteTemplateType = input.templateType || "rapida";

      const doc    = new PDFDocument({ margin: 0, size: "A4" });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const PW = doc.page.width;
      const PH = doc.page.height;
      const M  = 40;
      const CW = PW - M * 2;

      const brand     = input.brand?.trim()  || "Mi negocio";
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
        doc.strokeColor(color).lineWidth(lw)
           .moveTo(M, y).lineTo(M + CW, y).stroke();
      };

      const qtyW = 50;
      const mntW = 110;
      const prcW = 110;
      const dscW = CW - qtyW - prcW - mntW;
      const qtyX = M;
      const dscX = M + qtyW;
      const prcX = dscX + dscW;
      const mntX = prcX + prcW;
      const cPad = 8;
      const TH   = 24;

      const drawItemHead = (sy: number): number => {
        doc.rect(M, sy, CW, TH).fill(accent);
        doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(8)
           .text("CANT.",         qtyX + cPad, sy + 8, { width: qtyW - cPad * 2, align: "center" })
           .text("DESCRIPCIÓN",  dscX + cPad, sy + 8, { width: dscW - cPad })
           .text("PRECIO UNIT.", prcX + cPad, sy + 8, { width: prcW - cPad * 2, align: "right" })
           .text("MONTO",        mntX + cPad, sy + 8, { width: mntW - cPad * 2, align: "right" });
        return sy + TH;
      };

      const drawContHeader = () => {
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(13)
           .text(brand, M, M, { width: CW * 0.6 });
        doc.fillColor(inkDim).font("Helvetica").fontSize(8.5)
           .text(`Cotización N° ${qNumber}  ·  ${issueDate}`, M, M, { width: CW, align: "right" });
        hLine(M + 28, border, 0.6);
      };

      const ensureSpace = (cy: number, needed: number, withHead = false): number => {
        if (cy + needed <= PH - 52) return cy;
        doc.addPage();
        drawContHeader();
        let ny = M + 46;
        if (withHead) ny = drawItemHead(ny);
        return ny;
      };

      const LEFT_W  = Math.round(CW * 0.54);
      const RIGHT_W = CW - LEFT_W - 14;
      const RIGHT_X = M + LEFT_W + 14;

      let yL = M;
      let yR = M;

      const LOGO_W = 152;
      const LOGO_H = 48;
      if (cover) {
        try {
          doc.save();
          doc.rect(M, yL, LOGO_W, LOGO_H).clip();
          doc.image(cover, M, yL, { fit: [LOGO_W, LOGO_H] });
          doc.restore();
          yL += LOGO_H + 10;
        } catch { /* skip on error */ }
      }

      doc.fillColor(ink).font("Helvetica-Bold").fontSize(18)
         .text(brand, M, yL, { width: LEFT_W });
      yL += strH(brand, "Helvetica-Bold", 18, LEFT_W) + 3;

      if (input.subtitle?.trim()) {
        doc.fillColor(inkSub).font("Helvetica").fontSize(9)
           .text(input.subtitle.trim(), M, yL, { width: LEFT_W });
        yL += strH(input.subtitle.trim(), "Helvetica", 9, LEFT_W) + 3;
      }
      if (input.brandAddress) {
        doc.fillColor(inkSub).font("Helvetica").fontSize(8.5)
           .text(input.brandAddress, M, yL, { width: LEFT_W });
        yL += 13;
      }
      if (input.brandRut) {
        doc.fillColor(inkSub).font("Helvetica").fontSize(8.5)
           .text(`RUT: ${input.brandRut}`, M, yL, { width: LEFT_W });
        yL += 13;
      }
      if (input.brandPhone) {
        doc.fillColor(inkSub).font("Helvetica").fontSize(8.5)
           .text(`Teléfono: ${input.brandPhone}`, M, yL, { width: LEFT_W });
        yL += 13;
      }

      doc.fillColor(ink).font("Helvetica-BoldOblique").fontSize(34)
         .text("Cotización", RIGHT_X, yR, { width: RIGHT_W, align: "right" });
      yR += 48;

      const INFO_ROWS: [string, string][] = [
        ["FECHA",         issueDate],
        ["N.° COTIZACIÓN", qNumber],
        ["TIPO",          TEMPLATE_LABELS[tType]],
      ];
      const INFO_ROW_H = 19;
      const INFO_H     = INFO_ROWS.length * INFO_ROW_H;
      const LBL_W      = 94;
      const VAL_W      = RIGHT_W - LBL_W;

      INFO_ROWS.forEach(([label, value], i) => {
        const ry = yR + i * INFO_ROW_H;
        doc.rect(RIGHT_X, ry, LBL_W, INFO_ROW_H).fill("#F0F2F5");
        doc.rect(RIGHT_X + LBL_W, ry, VAL_W, INFO_ROW_H).fill(white);
        doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7)
           .text(label, RIGHT_X + 5, ry + 7, { width: LBL_W - 8 });
        doc.fillColor(ink).font("Helvetica").fontSize(8)
           .text(value, RIGHT_X + LBL_W + 5, ry + 6, { width: VAL_W - 8 });
      });

      doc.strokeColor(border).lineWidth(0.5)
         .rect(RIGHT_X, yR, RIGHT_W, INFO_H).stroke();
      for (let i = 1; i < INFO_ROWS.length; i++) {
        const ry = yR + i * INFO_ROW_H;
        doc.strokeColor(border).lineWidth(0.3)
           .moveTo(RIGHT_X, ry).lineTo(RIGHT_X + RIGHT_W, ry).stroke();
      }
      doc.strokeColor(border).lineWidth(0.3)
         .moveTo(RIGHT_X + LBL_W, yR)
         .lineTo(RIGHT_X + LBL_W, yR + INFO_H).stroke();
      yR += INFO_H;

      let y = Math.max(yL, yR) + 16;

      hLine(y, border, 0.8);
      y += 13;

      doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
         .text("COTIZACIÓN PARA:", M, y);
      doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
         .text("PREPARADO POR:", RIGHT_X, y);
      y += 12;

      const clientLines: string[] = [];
      if (cust.name?.trim())  clientLines.push(cust.name.trim());
      if (cust.email?.trim()) clientLines.push(cust.email.trim());
      if (cust.phone?.trim()) clientLines.push(`Tel: ${cust.phone.trim()}`);

      const clientText = clientLines.join("\n") || "—";
      const clientH = strH(clientText, "Helvetica", 9, LEFT_W);
      doc.fillColor(ink).font("Helvetica").fontSize(9)
         .text(clientText, M, y, { width: LEFT_W });
      doc.fillColor(ink).font("Helvetica").fontSize(9)
         .text(brand, RIGHT_X, y, { width: RIGHT_W });
      y += Math.max(clientH, 13) + 14;

      const noteText = cust.notes?.trim();
      if (noteText) {
        hLine(y, border, 0.4);
        y += 10;
        doc.fillColor(inkDim).font("Helvetica-Bold").fontSize(7.5)
           .text("COMENTARIOS O INSTRUCCIONES:", M, y);
        y += 12;
        doc.font("Helvetica").fontSize(9);
        const noteH = doc.heightOfString(noteText, { width: CW });
        doc.fillColor(inkSub).text(noteText, M, y, { width: CW });
        y += noteH + 10;
      }

      const ex = input.extraFields || {};
      const metaCols: [string, string][] = [];

      switch (tType) {
        case "servicios":
          if (ex.deliveryDate)      metaCols.push(["FECHA ENTREGA",       ex.deliveryDate]);
          if (ex.paymentConditions) metaCols.push(["CONDICIONES DE PAGO", ex.paymentConditions]);
          if (ex.exclusions)        metaCols.push(["NO INCLUYE",          ex.exclusions]);
          break;
        case "productos":
          if (ex.deliveryTime)  metaCols.push(["TIEMPO DE ENTREGA",  ex.deliveryTime]);
          if (ex.priceValidity) metaCols.push(["VALIDEZ DEL PRECIO", ex.priceValidity]);
          break;
        case "construccion":
          if (ex.workAddress)     metaCols.push(["DIRECCIÓN DE OBRA",   ex.workAddress]);
          if (ex.duration)        metaCols.push(["DURACIÓN ESTIMADA",   ex.duration]);
          if (ex.paymentSchedule) metaCols.push(["CALENDARIO DE PAGOS", ex.paymentSchedule]);
          break;
        case "eventos":
          if (ex.eventDate)          metaCols.push(["FECHA DEL EVENTO",      ex.eventDate]);
          if (ex.bookingDeposit)     metaCols.push(["RESERVA REQUERIDA",     ex.bookingDeposit]);
          if (ex.cancellationPolicy) metaCols.push(["POLÍTICA CANCELACIÓN",  ex.cancellationPolicy]);
          break;
      }
      if (ex.notes) metaCols.push(["NOTAS", ex.notes]);

      if (metaCols.length > 0) {
        y += 4;
        const metaColW = Math.floor(CW / metaCols.length);
        doc.rect(M, y, CW, 20).fill(accent);
        metaCols.forEach(([label], i) => {
          const cx = M + i * metaColW;
          if (i > 0) {
            doc.strokeColor("#FFFFFF40" as any).lineWidth(0.5)
               .moveTo(cx, y).lineTo(cx, y + 20).stroke();
          }
          doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(7)
             .text(label, cx + cPad, y + 7, { width: metaColW - cPad * 2, align: "center" });
        });
        y += 20;

        let maxValH = 16;
        metaCols.forEach(([, value]) => {
          doc.font("Helvetica").fontSize(8);
          const h = doc.heightOfString(value, { width: metaColW - cPad * 2 });
          if (h + 14 > maxValH) maxValH = Math.ceil(h) + 14;
        });

        doc.rect(M, y, CW, maxValH).fill(rowAlt);
        doc.strokeColor(border).lineWidth(0.5).rect(M, y, CW, maxValH).stroke();
        metaCols.forEach(([, value], i) => {
          const cx = M + i * metaColW;
          if (i > 0) {
            doc.strokeColor(border).lineWidth(0.3)
               .moveTo(cx, y).lineTo(cx, y + maxValH).stroke();
          }
          doc.fillColor(inkSub).font("Helvetica").fontSize(8)
             .text(value, cx + cPad, y + 7, { width: metaColW - cPad * 2, align: "center" });
        });
        y += maxValH + 12;
      } else {
        y += 8;
      }

      const tableStartY = y;
      y = drawItemHead(y);

      const lines = Array.isArray(input.lines) ? input.lines : [];

      if (lines.length === 0) {
        doc.rect(M, y, CW, 36).fill(white);
        [qtyX + qtyW, dscX + dscW, prcX + prcW].forEach(x => {
          doc.strokeColor(border).lineWidth(0.3)
             .moveTo(x, y).lineTo(x, y + 36).stroke();
        });
        doc.strokeColor(border).lineWidth(0.4)
           .moveTo(M, y + 36).lineTo(M + CW, y + 36).stroke();
        doc.fillColor(inkDim).font("Helvetica").fontSize(9)
           .text("Sin ítems seleccionados.", dscX + cPad, y + 12);
        y += 36;
      } else {
        lines.forEach((line, idx) => {
          const hasDesc  = !!line.description?.trim();
          const itemColW = dscW - cPad * 2;

          doc.font("Helvetica-Bold").fontSize(9);
          const nameH = doc.heightOfString(line.name || "—", { width: itemColW });
          let descH = 0;
          if (hasDesc) {
            doc.font("Helvetica").fontSize(7.5);
            descH = doc.heightOfString(line.description, { width: itemColW });
          }
          const rowH = Math.max(28, Math.ceil(nameH + (hasDesc ? descH + 4 : 0) + cPad * 2));
          const fill  = idx % 2 === 0 ? white : rowAlt;

          y = ensureSpace(y, rowH + 60, true);

          doc.rect(M, y, CW, rowH).fill(fill);
          [qtyX + qtyW, dscX + dscW, prcX + prcW].forEach(x => {
            doc.strokeColor(border).lineWidth(0.3)
               .moveTo(x, y).lineTo(x, y + rowH).stroke();
          });
          doc.strokeColor(border).lineWidth(0.4)
             .moveTo(M, y + rowH).lineTo(M + CW, y + rowH).stroke();

          const ty = y + cPad;
          doc.fillColor(inkSub).font("Helvetica").fontSize(9)
             .text(String(line.quantity), qtyX + cPad, ty, { width: qtyW - cPad * 2, align: "center" });
          doc.fillColor(ink).font("Helvetica-Bold").fontSize(9)
             .text(line.name, dscX + cPad, ty, { width: itemColW });
          if (hasDesc) {
            doc.fillColor(inkDim).font("Helvetica").fontSize(7.5)
               .text(line.description, dscX + cPad, ty + nameH + 3, { width: itemColW });
          }
          doc.fillColor(inkSub).font("Helvetica").fontSize(9)
             .text(formatCurrency(line.unitPrice, input.currency), prcX + cPad, ty, { width: prcW - cPad * 2, align: "right" })
             .text(formatCurrency(line.subtotal, input.currency),  mntX + cPad, ty, { width: mntW - cPad * 2, align: "right" });

          y += rowH;
        });
      }

      doc.strokeColor(border).lineWidth(0.5)
         .moveTo(M, tableStartY).lineTo(M, y).stroke()
         .moveTo(M + CW, tableStartY).lineTo(M + CW, y).stroke();
      y += 14;

      y = ensureSpace(y, 80);

      const TOT_W     = 288;
      const TOT_X     = M + CW - TOT_W;
      const TOT_LBL_W = 170;
      const TOT_VAL_W = TOT_W - TOT_LBL_W;
      const TOT_ROW_H = 22;

      const subtotal = input.total - (input.taxAmount || 0);
      const smallRows: [string, string][] = [
        ["SUBTOTAL", formatCurrency(subtotal, input.currency)],
        ["DESCUENTO", "—"],
        ...(input.taxAmount
          ? ([[`${input.taxLabel || "IVA"}${input.taxRate ? ` (${input.taxRate}%)` : ""}`, formatCurrency(input.taxAmount, input.currency)]] as [string, string][])
          : []),
      ];
      smallRows.forEach(([lbl, val]) => {
        doc.rect(TOT_X, y, TOT_LBL_W, TOT_ROW_H).fill(rowAlt);
        doc.rect(TOT_X + TOT_LBL_W, y, TOT_VAL_W, TOT_ROW_H).fill(white);
        doc.strokeColor(border).lineWidth(0.5).rect(TOT_X, y, TOT_W, TOT_ROW_H).stroke();
        doc.strokeColor(border).lineWidth(0.3)
           .moveTo(TOT_X + TOT_LBL_W, y).lineTo(TOT_X + TOT_LBL_W, y + TOT_ROW_H).stroke();
        doc.fillColor(inkSub).font("Helvetica").fontSize(9)
           .text(lbl, TOT_X + 8, y + 7, { width: TOT_LBL_W - 10 })
           .text(val, TOT_X + TOT_LBL_W + 5, y + 7, { width: TOT_VAL_W - 8, align: "right" });
        y += TOT_ROW_H;
      });

      const TOTAL_ROW_H = 26;
      doc.rect(TOT_X, y, TOT_W, TOTAL_ROW_H).fill(accent);
      doc.strokeColor(border).lineWidth(0.3)
         .moveTo(TOT_X + TOT_LBL_W, y).lineTo(TOT_X + TOT_LBL_W, y + TOTAL_ROW_H).stroke();
      doc.fillColor(hdrTxt).font("Helvetica-Bold").fontSize(10)
         .text("TOTAL", TOT_X + 8, y + 8, { width: TOT_LBL_W - 10 })
         .text(formatCurrency(input.total, input.currency), TOT_X + TOT_LBL_W + 5, y + 8, { width: TOT_VAL_W - 8, align: "right" });
      y += TOTAL_ROW_H + 22;

      y = ensureSpace(y, 48);
      hLine(y, border, 0.8);
      y += 12;

      doc.fillColor(ink).font("Helvetica-Bold").fontSize(10)
         .text("¡GRACIAS POR SU PREFERENCIA!", M, y, { width: CW, align: "center" });
      y += 18;

      doc.fillColor(inkDim).font("Helvetica").fontSize(7.5)
         .text(
           `Si desea realizar alguna consulta con respecto a esta cotización, póngase en contacto con ${brand}.`,
           M, y, { width: CW, align: "center" }
         );
      y += 14;

      doc.fillColor(inkDim).font("Helvetica").fontSize(7)
         .text(
           `${brand}  ·  Cotización N° ${qNumber}  ·  ${issueDate}  ·  Documento generado automáticamente`,
           M, y, { width: CW, align: "center" }
         );

      doc.end();
      stream.on("finish", () => resolve({ fileName, filePath }));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}
