import crypto from "crypto";
import DB from "../../../db/db_configuration";

export async function initQuoteHistoryTable(): Promise<void> {
  await DB.getPool().query(`
    CREATE TABLE IF NOT EXISTS quote_history (
      id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT          NOT NULL,
      template_type TEXT          NOT NULL DEFAULT 'rapida',
      client_name   TEXT          NOT NULL,
      client_email  TEXT          NOT NULL,
      client_phone  TEXT,
      items         JSONB         NOT NULL DEFAULT '[]',
      total         NUMERIC(12,2) DEFAULT 0,
      message       TEXT,
      extra_fields  JSONB         DEFAULT '{}',
      sent_at       TIMESTAMPTZ   DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_quote_history_user_id ON quote_history(user_id);
  `);
}

// status: 'sent' | 'viewed' | 'accepted' | 'rejected'
// payment_status: 'unpaid' | 'paid'
export async function initQuoteHistoryStatusColumns(): Promise<void> {
  await DB.getPool().query(`
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent';
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS quote_token TEXT;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS checkout_url TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_history_token ON quote_history(quote_token) WHERE quote_token IS NOT NULL;
  `);
}

// Guarda el estilo/color/logo usados en el PDF enviado, para poder reenviar una copia idéntica después.
export async function initQuoteHistoryPdfConfigColumns(): Promise<void> {
  await DB.getPool().query(`
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS quote_style TEXT;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS quote_accent_color TEXT;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS quote_logo_url TEXT;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS currency TEXT;
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2);
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2);
    ALTER TABLE quote_history ADD COLUMN IF NOT EXISTS tax_label TEXT;
  `);
}

function generateQuoteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function saveQuoteHistory(params: {
  userId: string;
  templateType: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  items: any[];
  total: number;
  message?: string;
  extraFields?: Record<string, any>;
  status?: string;
  quoteStyle?: string | null;
  quoteAccentColor?: string | null;
  quoteLogoUrl?: string | null;
  currency?: string | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  taxLabel?: string | null;
}) {
  const token = generateQuoteToken();
  const res = await DB.getPool().query(
    `INSERT INTO quote_history
       (user_id, template_type, client_name, client_email, client_phone, items, total, message, extra_fields, quote_token, status, quote_style, quote_accent_color, quote_logo_url, currency, tax_rate, tax_amount, tax_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING *`,
    [
      params.userId,
      params.templateType,
      params.clientName,
      params.clientEmail,
      params.clientPhone || null,
      JSON.stringify(params.items),
      params.total,
      params.message || null,
      JSON.stringify(params.extraFields || {}),
      token,
      params.status || "sent",
      params.quoteStyle || null,
      params.quoteAccentColor || null,
      params.quoteLogoUrl || null,
      params.currency || null,
      params.taxRate ?? null,
      params.taxAmount ?? null,
      params.taxLabel || null,
    ]
  );
  return res.rows[0];
}

export async function markQuoteAnswered(userId: string, quoteId: string) {
  const res = await DB.getPool().query(
    `UPDATE quote_history
     SET status = 'answered'
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [quoteId, userId]
  );
  return res.rows[0] || null;
}

export async function listQuoteHistory(userId: string, limit = 60) {
  const res = await DB.getPool().query(
    `SELECT id, template_type, client_name, client_email, client_phone,
            items, total, currency, tax_rate, tax_amount, tax_label, message, extra_fields, sent_at,
            status, viewed_at, accepted_at, rejected_at, payment_status, paid_at
     FROM quote_history
     WHERE user_id = $1
     ORDER BY sent_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

export async function deleteQuoteHistory(userId: string, quoteId: string) {
  const res = await DB.getPool().query(
    `DELETE FROM quote_history WHERE id = $1 AND user_id = $2 RETURNING id`,
    [quoteId, userId]
  );
  return res.rows[0] || null;
}

export async function getQuoteByToken(token: string) {
  const res = await DB.getPool().query(
    `SELECT * FROM quote_history WHERE quote_token = $1 LIMIT 1`,
    [token]
  );
  return res.rows[0] || null;
}

export async function getQuoteById(id: string) {
  const res = await DB.getPool().query(
    `SELECT * FROM quote_history WHERE id = $1 LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function getQuoteByIdForUser(userId: string, id: string) {
  const res = await DB.getPool().query(
    `SELECT * FROM quote_history WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId]
  );
  return res.rows[0] || null;
}

// Solo devuelve la fila cuando ESTA llamada es la que hizo la transición sent -> viewed
// (atómico vía WHERE status = 'sent'). Dos requests concurrentes (ej. doble apertura
// del link) solo pueden hacer que UNA de las dos reciba una fila no nula, evitando
// notificar al dueño dos veces por la misma vista. Si el status ya no es 'sent', esta
// llamada no hace nada (viewed_at ya quedó fijado por el primer view).
export async function claimQuoteFirstView(token: string) {
  const res = await DB.getPool().query(
    `UPDATE quote_history
     SET status = 'viewed', viewed_at = COALESCE(viewed_at, NOW())
     WHERE quote_token = $1 AND status = 'sent'
     RETURNING *`,
    [token]
  );
  return res.rows[0] || null;
}

export async function markQuoteAccepted(token: string) {
  const res = await DB.getPool().query(
    `UPDATE quote_history
     SET status = 'accepted', accepted_at = NOW()
     WHERE quote_token = $1 AND status IN ('sent', 'viewed')
     RETURNING *`,
    [token]
  );
  return res.rows[0] || null;
}

export async function markQuoteRejected(token: string) {
  const res = await DB.getPool().query(
    `UPDATE quote_history
     SET status = 'rejected', rejected_at = NOW()
     WHERE quote_token = $1 AND status IN ('sent', 'viewed')
     RETURNING *`,
    [token]
  );
  return res.rows[0] || null;
}

export async function markQuotePaid(quoteId: string) {
  const res = await DB.getPool().query(
    `UPDATE quote_history
     SET payment_status = 'paid', paid_at = NOW()
     WHERE id = $1 AND payment_status <> 'paid'
     RETURNING *`,
    [quoteId]
  );
  return res.rows[0] || null;
}

export async function saveQuoteCheckout(quoteId: string, checkoutUrl: string, preferenceId: string) {
  const res = await DB.getPool().query(
    `UPDATE quote_history
     SET checkout_url = $1, mp_preference_id = $2
     WHERE id = $3
     RETURNING *`,
    [checkoutUrl, preferenceId, quoteId]
  );
  return res.rows[0] || null;
}
