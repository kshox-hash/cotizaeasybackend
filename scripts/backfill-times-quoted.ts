// Backfill de una sola vez: times_quoted arranca en 0 para todo ítem de catálogo
// existente (la columna se agregó con DEFAULT 0) y de ahí en más se suma solo
// en cada cotización nueva (ver incrementCatalogItemsQuotedCount). Este script
// completa el conteo retroactivo a partir de quote_history, con la misma lógica
// que tenía el viejo getMostQuotedItems (match por catalogItemId, o por nombre
// normalizado como respaldo para líneas viejas que no lo tenían).
//
// Se corre UNA vez por base de datos, a mano:
//   npx ts-node scripts/backfill-times-quoted.ts
//
// Es seguro correrlo más de una vez por error en cuentas nuevas (no hace nada si
// quote_history está vacío), pero en una cuenta que ya generó cotizaciones desde
// que se agregó el contador, correrlo dos veces DUPLICA el conteo — por eso no
// se conecta a ningún arranque automático del servidor.

import DB from "../src/db/db_configuration";

async function main() {
  const pool = DB.getPool();

  const usersRes = await pool.query(`SELECT DISTINCT user_id FROM quote_history`);
  const userIds: string[] = usersRes.rows.map((r) => r.user_id);
  console.log(`[backfill] ${userIds.length} usuario(s) con historial.`);

  let totalUpdated = 0;

  for (const userId of userIds) {
    const catalogRes = await pool.query(
      `SELECT id::text, name FROM quote_catalog_items WHERE user_id = $1`,
      [userId]
    );
    const catalog = catalogRes.rows as { id: string; name: string }[];
    if (catalog.length === 0) continue;

    const byId = new Map(catalog.map((c) => [c.id, c]));
    const byName = new Map(catalog.map((c) => [c.name.trim().toLowerCase(), c]));

    const historyRes = await pool.query(`SELECT items FROM quote_history WHERE user_id = $1`, [userId]);

    const counts = new Map<string, number>();
    for (const row of historyRes.rows) {
      const items: any[] = Array.isArray(row.items) ? row.items : [];
      for (const it of items) {
        let match = it?.catalogItemId ? byId.get(String(it.catalogItemId)) : undefined;
        if (!match) {
          const name = String(it?.name || it?.title || "").trim().toLowerCase();
          match = name ? byName.get(name) : undefined;
        }
        if (match) counts.set(match.id, (counts.get(match.id) || 0) + 1);
      }
    }

    for (const [itemId, count] of counts) {
      await pool.query(`UPDATE quote_catalog_items SET times_quoted = $1 WHERE id = $2`, [count, itemId]);
      totalUpdated++;
    }
  }

  console.log(`[backfill] Listo — ${totalUpdated} ítem(s) de catálogo actualizados.`);
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill] Error:", err);
  process.exit(1);
});
