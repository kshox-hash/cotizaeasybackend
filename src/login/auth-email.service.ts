import { createTransporter, SMTP_FROM } from "../core/mailer";
import { withRetry } from "../core/retry";
import { escapeHtml } from "../utils/html";

function wrapEmail(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#1e3a5f;padding:28px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${escapeHtml(title)}</p>
          </td>
        </tr>
        <tr><td style="padding:28px 32px;">${bodyHtml}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
      <tr><td align="center">
        <a href="${url}" style="display:inline-block;background:#1e3a5f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;">
          ${escapeHtml(label)}
        </a>
      </td></tr>
    </table>`;
}

export async function sendVerificationEmail(input: { to: string; verifyUrl: string }): Promise<void> {
  const html = wrapEmail("Confirma tu correo", `
    <p style="margin:0 0 8px;font-size:15px;color:#374151;">
      Gracias por crear tu cuenta en Cotiza Easy Pro. Confirma tu correo para asegurarte de recibir
      los avisos de tus cotizaciones (cuando un cliente las vea, acepte o rechace) y poder recuperar
      tu cuenta si alguna vez olvidas tu contraseña.
    </p>
    ${ctaButton(input.verifyUrl, "Confirmar mi correo")}
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">Este link vence en 48 horas.</p>
  `);
  const transporter = createTransporter();
  await withRetry(() => transporter.sendMail({
    from: SMTP_FROM(),
    to: input.to,
    subject: "Confirma tu correo — Cotiza Easy Pro",
    html,
  }), 2, 1500);
}

export async function sendPasswordResetEmail(input: { to: string; name?: string; resetUrl: string }): Promise<void> {
  const html = wrapEmail("Recuperar contraseña", `
    <p style="margin:0 0 8px;font-size:15px;color:#374151;">
      Hola${input.name ? ` ${escapeHtml(input.name)}` : ""}, recibimos una solicitud para restablecer
      la contraseña de tu cuenta. Si no fuiste tú, puedes ignorar este correo — tu contraseña actual
      sigue funcionando.
    </p>
    ${ctaButton(input.resetUrl, "Elegir nueva contraseña")}
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">Este link vence en 1 hora.</p>
  `);
  const transporter = createTransporter();
  await withRetry(() => transporter.sendMail({
    from: SMTP_FROM(),
    to: input.to,
    subject: "Recuperar tu contraseña — Cotiza Easy Pro",
    html,
  }), 2, 1500);
}
