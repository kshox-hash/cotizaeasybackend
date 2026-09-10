import { escapeHtml } from "../../utils/html";
import { formatCurrency } from "../../utils/format";

type QuoteViewItem = { title?: string; name?: string; price?: number; unitPrice?: number; quantity?: number };

export type QuoteViewData = {
  token: string;
  brandName: string;
  clientName: string;
  status: string; // 'sent' | 'viewed' | 'accepted' | 'rejected'
  items: QuoteViewItem[];
  total: number;
  message?: string | null;
  logoUrl?: string | null;
  accentColor?: string | null;
  currency?: string | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  taxLabel?: string | null;
  nonce: string;
};

export function renderQuotePageHtml(data: QuoteViewData): string {
  const rawAccent = data.accentColor?.trim() ?? "";
  const accent = /^#[0-9A-Fa-f]{6}$/.test(rawAccent) ? rawAccent : "#F97316";
  const logoHtml = data.logoUrl
    ? `<img src="${escapeHtml(data.logoUrl)}" alt="${escapeHtml(data.brandName)}" style="max-height:40px;max-width:180px;object-fit:contain;margin-bottom:14px;display:block;" />`
    : "";

  const rows = data.items
    .map((it) => {
      const name = it.title || it.name || "Ítem";
      const price = Number(it.price ?? it.unitPrice ?? 0);
      const qty = Math.max(1, Number(it.quantity || 1));
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #EFEFF2;font-size:14px;color:#111116;">${escapeHtml(name)}${qty > 1 ? ` <span style="color:#9A9AA6;">×${qty}</span>` : ""}</td>
        <td style="padding:12px 0;border-bottom:1px solid #EFEFF2;font-size:14px;color:#111116;text-align:right;font-weight:700;">${formatCurrency(price * qty, data.currency)}</td>
      </tr>`;
    })
    .join("");

  const isDecided = data.status === "accepted" || data.status === "rejected";

  let actionBlock = "";
  if (data.status === "rejected") {
    actionBlock = `<div class="notice notice-muted">Marcaste esta cotización como no aceptada.</div>`;
  } else if (data.status === "accepted") {
    actionBlock = `<div class="notice notice-success">✓ Aceptaste esta cotización. ${escapeHtml(data.brandName)} se pondrá en contacto contigo.</div>`;
  } else if (!isDecided) {
    actionBlock = `
      <div style="display:flex;gap:10px;">
        <button id="btn-accept" class="btn btn-primary" style="flex:1;">Aceptar</button>
        <button id="btn-reject" class="btn btn-ghost" style="flex:1;">Rechazar</button>
      </div>
      <div id="quote-error" class="notice notice-error" style="display:none;"></div>`;
  }

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cotización de ${escapeHtml(data.brandName)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #EAEAED;
      color: #111116;
      font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      max-width: 420px;
      width: 100%;
      background: #FFFFFF;
      border-radius: 20px;
      padding: 28px 26px;
    }
    .eyebrow { font-size: 11px; font-weight: 700; color: #AEAEBA; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 6px; }
    h1 { margin: 0 0 4px; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
    .sub { font-size: 13px; color: #78788C; margin: 0 0 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    .total-row td { padding: 14px 0 4px; font-size: 15px; font-weight: 800; }
    .total-row td:last-child { color: ${accent}; }
    .msg { font-size: 13px; color: #78788C; background: #F2F2F5; border-radius: 12px; padding: 12px 14px; margin: 16px 0; line-height: 1.5; }
    .btn { border: none; border-radius: 12px; padding: 13px 18px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }
    .btn-primary { background: ${accent}; color: #fff; }
    .btn-ghost { background: #F2F2F5; color: #38383F; }
    .btn[disabled] { opacity: .6; cursor: default; }
    .notice { font-size: 13px; border-radius: 12px; padding: 12px 14px; text-align: center; }
    .notice-muted { background: #F2F2F5; color: #78788C; }
    .notice-success { background: #EAF7EE; color: #16A34A; font-weight: 700; }
    .notice-error { background: #FEECEC; color: #EF4444; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="card">
    ${logoHtml}
    <div class="eyebrow">Cotización de ${escapeHtml(data.brandName)}</div>
    <h1>Hola ${escapeHtml(data.clientName)}</h1>
    <p class="sub">Revisa el detalle y responde cuando quieras.</p>

    <table>
      <tbody>${rows}</tbody>
      <tfoot>
        ${data.taxAmount ? `
        <tr><td style="color:#78788C;font-size:13px;padding:4px 0;">Subtotal</td><td style="text-align:right;color:#78788C;font-size:13px;padding:4px 0;">${formatCurrency(data.total - data.taxAmount, data.currency)}</td></tr>
        <tr><td style="color:#78788C;font-size:13px;padding:4px 0;">${escapeHtml(data.taxLabel || "IVA")}${data.taxRate ? ` (${data.taxRate}%)` : ""}</td><td style="text-align:right;color:#78788C;font-size:13px;padding:4px 0;">${formatCurrency(data.taxAmount, data.currency)}</td></tr>` : ""}
        <tr class="total-row"><td>Total</td><td style="text-align:right;">${formatCurrency(data.total, data.currency)}</td></tr>
      </tfoot>
    </table>

    ${data.message ? `<div class="msg">${escapeHtml(data.message)}</div>` : ""}

    <div style="margin-top:18px;">
      ${actionBlock}
    </div>
  </div>

  <script nonce="${escapeHtml(data.nonce)}">
    (function () {
      var token = ${JSON.stringify(data.token)};
      var acceptBtn = document.getElementById('btn-accept');
      var rejectBtn = document.getElementById('btn-reject');
      var errorBox = document.getElementById('quote-error');

      function showError(msg) {
        if (!errorBox) return;
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
      }

      function decide(action, btn) {
        if (!btn) return;
        [acceptBtn, rejectBtn].forEach(function (b) { if (b) b.disabled = true; });
        fetch('/api/quotes/' + token + '/' + action, { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data.ok) { showError(data.message || 'No se pudo procesar tu respuesta.'); [acceptBtn, rejectBtn].forEach(function (b) { if (b) b.disabled = false; }); return; }
            window.location.reload();
          })
          .catch(function () { showError('Error de conexión. Intenta de nuevo.'); [acceptBtn, rejectBtn].forEach(function (b) { if (b) b.disabled = false; }); });
      }

      if (acceptBtn) acceptBtn.addEventListener('click', function () { decide('accept', acceptBtn); });
      if (rejectBtn) rejectBtn.addEventListener('click', function () { decide('reject', rejectBtn); });
    })();
  </script>
</body>
</html>`;
}
