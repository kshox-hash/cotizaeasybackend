import DB from "../../../db/db_configuration";

export async function initQuoteCatalogItemsTable(): Promise<void> {
  await DB.getPool().query(`
    CREATE TABLE IF NOT EXISTS quote_catalog_items (
      id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          TEXT          NOT NULL,
      description   TEXT,
      unit          TEXT          DEFAULT 'unidad',
      price         NUMERIC(12,2) NOT NULL DEFAULT 0,
      is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
      is_quote_only BOOLEAN       NOT NULL DEFAULT TRUE,
      sort_order    INTEGER       NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );
    ALTER TABLE quote_catalog_items ADD COLUMN IF NOT EXISTS code TEXT;
    CREATE INDEX IF NOT EXISTS idx_quote_catalog_items_user_id ON quote_catalog_items(user_id);
  `);
}

const SELECT_COLUMNS = `id::text, name, code, description, COALESCE(unit, 'unidad') AS unit,
            price, is_active, is_quote_only, created_at`;

// El catálogo guardado explícitamente para cotizaciones (is_quote_only = true).
export async function listQuoteServices(userId: string) {
  const res = await DB.getPool().query(
    `SELECT ${SELECT_COLUMNS}
     FROM quote_catalog_items
     WHERE user_id = $1 AND is_quote_only = TRUE
     ORDER BY sort_order ASC, name ASC`,
    [userId]
  );
  return res.rows;
}

// Todos los ítems activos del catálogo (para armar una cotización manual con cualquiera).
export async function listAllQuotableServices(userId: string) {
  const res = await DB.getPool().query(
    `SELECT ${SELECT_COLUMNS}
     FROM quote_catalog_items
     WHERE user_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, name ASC`,
    [userId]
  );
  return res.rows;
}

export async function createQuoteService(
  userId: string,
  params: { name: string; description?: string; unit: string; price: number; code?: string; isQuoteOnly?: boolean }
) {
  const res = await DB.getPool().query(
    `INSERT INTO quote_catalog_items (user_id, name, description, unit, price, code, is_quote_only)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SELECT_COLUMNS}`,
    [userId, params.name, params.description || null, params.unit, params.price, params.code || null, params.isQuoteOnly ?? true]
  );
  return res.rows[0];
}

export async function updateQuoteService(
  userId: string,
  serviceId: string,
  params: {
    name?: string;
    description?: string | null;
    unit?: string;
    price?: number;
    code?: string | null;
    isActive?: boolean;
    isQuoteOnly?: boolean;
  }
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.name        !== undefined) { fields.push(`name = $${i++}`);          values.push(params.name); }
  if (params.description !== undefined) { fields.push(`description = $${i++}`);   values.push(params.description); }
  if (params.unit        !== undefined) { fields.push(`unit = $${i++}`);           values.push(params.unit); }
  if (params.price       !== undefined) { fields.push(`price = $${i++}`);          values.push(params.price); }
  if (params.code        !== undefined) { fields.push(`code = $${i++}`);           values.push(params.code); }
  if (params.isActive    !== undefined) { fields.push(`is_active = $${i++}`);      values.push(params.isActive); }
  if (params.isQuoteOnly !== undefined) { fields.push(`is_quote_only = $${i++}`);  values.push(params.isQuoteOnly); }

  if (fields.length === 0) return null;
  values.push(serviceId, userId);

  const res = await DB.getPool().query(
    `UPDATE quote_catalog_items SET ${fields.join(", ")}
     WHERE id = $${i++} AND user_id = $${i++}
     RETURNING ${SELECT_COLUMNS}`,
    values
  );
  return res.rows[0] || null;
}

export async function deleteQuoteService(userId: string, serviceId: string) {
  const res = await DB.getPool().query(
    `DELETE FROM quote_catalog_items WHERE id = $1 AND user_id = $2 RETURNING id`,
    [serviceId, userId]
  );
  return res.rows[0] || null;
}
