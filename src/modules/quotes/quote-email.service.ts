import fs from "fs";
import { createTransporter, SMTP_FROM } from "../../core/mailer";
import { escapeHtml } from "../../utils/html";
import { withRetry } from "../../core/retry";
import { formatCurrency } from "../../utils/format";

type SendQuoteEmailInput = {
  to: string;
  customerName: string;
  brandName: string;
  pdfPath: string;
  pdfFileName: string;
  items: { name: string; quantity: number; unitPrice: number; subtotal: number }[];
  total: number;
  currency?: string;
  taxRate?: number;
  taxAmount?: number;
  taxLabel?: string;
  viewUrl?: string;
  /** Email real del dueño de la cuenta — si el cliente responde el correo, le llega
   *  directo a él en vez de perderse en la casilla compartida de Cotiza Easy Pro. */
  replyTo?: string;
};

function buildQuoteEmailHtml(input: SendQuoteEmailInput): string {
  const rows = input.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111827;">${escapeHtml(item.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#6b7280;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#6b7280;text-align:right;">${formatCurrency(item.unitPrice, input.currency)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${formatCurrency(item.subtotal, input.currency)}</td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        
        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:28px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${escapeHtml(input.brandName)}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#93c5fd;">Tu cotización está lista</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;">
              Hola <strong>${escapeHtml(input.customerName)}</strong>, aquí está el resumen de tu cotización.
              Encontrarás el detalle completo en el PDF adjunto.
            </p>

            <!-- Tabla de productos -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:left;">Producto</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:center;">Cant.</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:right;">Precio</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>

            <!-- Total -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:0;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;overflow:hidden;">
              ${input.taxAmount ? `
              <tr style="background:#f9fafb;">
                <td colspan="3" style="padding:8px 12px;font-size:12px;color:#6b7280;">Subtotal</td>
                <td style="padding:8px 12px;font-size:13px;color:#374151;text-align:right;">${formatCurrency(input.total - input.taxAmount, input.currency)}</td>
              </tr>
              <tr style="background:#f9fafb;">
                <td colspan="3" style="padding:8px 12px;font-size:12px;color:#6b7280;">${escapeHtml(input.taxLabel || "IVA")}${input.taxRate ? ` (${input.taxRate}%)` : ""}</td>
                <td style="padding:8px 12px;font-size:13px;color:#374151;text-align:right;">${formatCurrency(input.taxAmount, input.currency)}</td>
              </tr>` : ''}
              <tr style="background:#1e3a5f;">
                <td colspan="3" style="padding:14px 12px;font-size:13px;font-weight:600;color:#ffffff;">Total estimado</td>
                <td style="padding:14px 12px;font-size:16px;font-weight:700;color:#ffffff;text-align:right;">${formatCurrency(input.total, input.currency)}</td>
              </tr>
            </table>

            ${input.viewUrl ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
              <tr><td align="center">
                <a href="${input.viewUrl}" style="display:inline-block;background:#1e3a5f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;">
                  Ver y responder cotización
                </a>
              </td></tr>
            </table>` : ''}

            <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
              Esta cotización es referencial y puede ajustarse según tus necesidades.
              Nos pondremos en contacto contigo a la brevedad.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f0f0f0;background:#f9fafb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              ${escapeHtml(input.brandName)} · Documento generado automáticamente
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

type SendQuotePaidEmailInput = {
  to: string;
  customerName: string;
  brandName: string;
  total: number;
  currency?: string;
};

export async function sendQuotePaidEmail(input: SendQuotePaidEmailInput): Promise<void> {
  const transporter = createTransporter();
  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#16A34A;padding:28px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Pago confirmado</p>
            <p style="margin:6px 0 0;font-size:13px;color:#bbf7d0;">${escapeHtml(input.brandName)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#374151;">
              Hola <strong>${escapeHtml(input.customerName)}</strong>, confirmamos tu pago por
              <strong>${formatCurrency(input.total, input.currency)}</strong>. ${escapeHtml(input.brandName)} ya fue notificado.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await withRetry(() => transporter.sendMail({
    from: `"${input.brandName}" <${process.env.SMTP_FROM_EMAIL}>`,
    to: input.to,
    subject: `Pago confirmado — ${input.brandName}`,
    html,
  }), 2, 1500);
}

type SendQuoteStatusNotificationInput = {
  to: string;
  ownerName: string;
  clientName: string;
  total: number;
  currency?: string;
  status: "viewed" | "accepted" | "rejected";
  historyUrl?: string;
};

const STATUS_COPY: Record<SendQuoteStatusNotificationInput["status"], { subject: string; verb: string; color: string }> = {
  viewed:   { subject: "vio tu cotización",     verb: "vio",       color: "#3B82F6" },
  accepted: { subject: "aceptó tu cotización",  verb: "aceptó ✓",  color: "#16A34A" },
  rejected: { subject: "rechazó tu cotización", verb: "rechazó",   color: "#EF4444" },
};

// Notifica al dueño de la cuenta cuando su cliente interactúa con una cotización enviada,
// para que no tenga que entrar manualmente al Historial a enterarse.
export async function sendQuoteStatusNotification(input: SendQuoteStatusNotificationInput): Promise<void> {
  const copy = STATUS_COPY[input.status];
  const transporter = createTransporter();
  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:${copy.color};padding:28px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">
              ${escapeHtml(input.clientName)} ${copy.verb}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#374151;">
              Hola ${escapeHtml(input.ownerName || "")}, tu cliente <strong>${escapeHtml(input.clientName)}</strong>
              ${copy.subject} por ${formatCurrency(input.total, input.currency)}.
            </p>
            ${input.historyUrl ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
              <tr><td align="center">
                <a href="${input.historyUrl}" style="display:inline-block;background:#1e3a5f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;">
                  Ver en Cotiza Easy Pro
                </a>
              </td></tr>
            </table>` : ''}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await withRetry(() => transporter.sendMail({
    from: SMTP_FROM(),
    to: input.to,
    subject: `${input.clientName} ${copy.subject}`,
    html,
  }), 2, 1500);
}

export async function sendQuoteEmail(input: SendQuoteEmailInput): Promise<void> {
  const transporter = createTransporter();
  const html = buildQuoteEmailHtml(input);

  const pdfBuffer = fs.readFileSync(input.pdfPath);
  await withRetry(() => transporter.sendMail({
    from: `"${input.brandName}" <${process.env.SMTP_FROM_EMAIL}>`,
    to: input.to,
    replyTo: input.replyTo || undefined,
    subject: `Tu cotización de ${input.brandName}`,
    html,
    attachments: [
      {
        filename: input.pdfFileName,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  }), 2, 1500);
}