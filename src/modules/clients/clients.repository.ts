import DB from "../../db/db_configuration";

export async function initClientsTable(): Promise<void> {
  await DB.getPool().query(`
    CREATE TABLE IF NOT EXISTS clients (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT        NOT NULL,
      email      TEXT,
      phone      TEXT,
      notes      TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
  `);
}

const SELECT_COLUMNS = `id::text, name, email, phone, notes, created_at`;

export async function listClients(userId: string) {
  const res = await DB.getPool().query(
    `SELECT ${SELECT_COLUMNS}
     FROM clients
     WHERE user_id = $1
     ORDER BY name ASC`,
    [userId]
  );
  return res.rows;
}

export async function createClient(
  userId: string,
  params: { name: string; email?: string; phone?: string; notes?: string }
) {
  const res = await DB.getPool().query(
    `INSERT INTO clients (user_id, name, email, phone, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SELECT_COLUMNS}`,
    [userId, params.name, params.email || null, params.phone || null, params.notes || null]
  );
  return res.rows[0];
}

export async function updateClient(
  userId: string,
  clientId: string,
  params: { name?: string; email?: string | null; phone?: string | null; notes?: string | null }
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.name  !== undefined) { fields.push(`name = $${i++}`);  values.push(params.name); }
  if (params.email !== undefined) { fields.push(`email = $${i++}`); values.push(params.email); }
  if (params.phone !== undefined) { fields.push(`phone = $${i++}`); values.push(params.phone); }
  if (params.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(params.notes); }

  if (fields.length === 0) return null;
  values.push(clientId, userId);

  const res = await DB.getPool().query(
    `UPDATE clients SET ${fields.join(", ")}
     WHERE id = $${i++} AND user_id = $${i++}
     RETURNING ${SELECT_COLUMNS}`,
    values
  );
  return res.rows[0] || null;
}

export async function deleteClient(userId: string, clientId: string) {
  const res = await DB.getPool().query(
    `DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id`,
    [clientId, userId]
  );
  return res.rows[0] || null;
}
