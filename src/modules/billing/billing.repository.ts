import DB from "../../db/db_configuration";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled";

export type BillingInfo = {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  mpPreapprovalId: string | null;
  subscriptionCurrentPeriodEnd: string | null;
};

export async function initBillingColumns(): Promise<void> {
  await DB.getPool().query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
  `);
  // Cuentas creadas antes de este módulo no tienen trial_ends_at — se les da el mismo
  // trial de 2 días a partir de ahora en vez de dejarlas bloqueadas de sorpresa.
  await DB.getPool().query(`
    UPDATE users SET trial_ends_at = now() + interval '2 days'
    WHERE trial_ends_at IS NULL AND subscription_status = 'trial';
  `);
}

export async function getBillingInfo(userId: string): Promise<BillingInfo | null> {
  const result = await DB.getPool().query(
    `select subscription_status, trial_ends_at, mp_preapproval_id, subscription_current_period_end
     from users where id = $1 limit 1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    subscriptionStatus: row.subscription_status,
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null,
    mpPreapprovalId: row.mp_preapproval_id,
    subscriptionCurrentPeriodEnd: row.subscription_current_period_end
      ? new Date(row.subscription_current_period_end).toISOString()
      : null,
  };
}

export async function savePendingPreapproval(userId: string, preapprovalId: string): Promise<void> {
  await DB.getPool().query(
    `update users set mp_preapproval_id = $1 where id = $2`,
    [preapprovalId, userId]
  );
}

export async function activateSubscription(userId: string, currentPeriodEnd: Date): Promise<void> {
  await DB.getPool().query(
    `update users
     set subscription_status = 'active', subscription_current_period_end = $2
     where id = $1`,
    [userId, currentPeriodEnd]
  );
}

export async function markPastDue(userId: string): Promise<void> {
  await DB.getPool().query(
    `update users set subscription_status = 'past_due' where id = $1`,
    [userId]
  );
}

export async function markCanceled(userId: string): Promise<void> {
  await DB.getPool().query(
    `update users set subscription_status = 'canceled' where id = $1`,
    [userId]
  );
}

export async function findUserIdByPreapprovalId(preapprovalId: string): Promise<string | null> {
  const result = await DB.getPool().query(
    `select id from users where mp_preapproval_id = $1 limit 1`,
    [preapprovalId]
  );
  return result.rows[0]?.id ?? null;
}
