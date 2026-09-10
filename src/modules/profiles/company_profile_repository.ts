import DB from "../../db/db_configuration";
import { CompanyProfile, CompanyProfileInput } from "./company-profile.type";

const initBusinessProfilesTable = async (): Promise<void> => {
  const pool = DB.getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_profiles (
      id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      business_name       TEXT          NOT NULL,
      rut                 TEXT,
      city                TEXT,
      address             TEXT,
      phone               TEXT,
      brand_color         TEXT,
      description         TEXT,
      quote_logo_url      TEXT,
      quote_style         TEXT,
      quote_accent_color  TEXT,
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );
    ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CLP';
    ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
    ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS tax_label TEXT;
  `);
};

const getByUserId = async (userId: string): Promise<CompanyProfile | null> => {
  const pool = DB.getPool();
  const query = `
    SELECT id, user_id, business_name, rut, city, address, phone, brand_color,
           description, quote_logo_url, quote_style, quote_accent_color, currency,
           tax_rate, tax_label,
           created_at, updated_at
    FROM business_profiles
    WHERE user_id = $1
    LIMIT 1
  `;
  const result = await pool.query<CompanyProfile>(query, [userId]);
  return result.rows[0] ?? null;
};

const upsert = async (input: CompanyProfileInput): Promise<CompanyProfile> => {
  const pool = DB.getPool();
  const query = `
    INSERT INTO business_profiles (
      user_id, business_name, rut, city, address, phone, brand_color, description, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      business_name = EXCLUDED.business_name,
      rut = EXCLUDED.rut,
      city = EXCLUDED.city,
      address = EXCLUDED.address,
      phone = EXCLUDED.phone,
      brand_color = EXCLUDED.brand_color,
      description = EXCLUDED.description,
      updated_at = NOW()
    RETURNING id, user_id, business_name, rut, city, address, phone, brand_color,
              description, quote_logo_url, quote_style, quote_accent_color, currency,
              tax_rate, tax_label,
              created_at, updated_at
  `;
  const values = [
    input.user_id,
    input.business_name,
    input.rut ?? null,
    input.city ?? null,
    input.address ?? null,
    input.phone ?? null,
    input.brand_color ?? null,
    input.description ?? null,
  ];
  const result = await pool.query<CompanyProfile>(query, values);
  if (!result.rows[0]) {
    throw new Error("No se pudo guardar el perfil de empresa");
  }
  return result.rows[0];
};

const updateQuoteLogo = async (userId: string, url: string | null): Promise<void> => {
  const pool = DB.getPool();
  await pool.query(
    `UPDATE business_profiles SET quote_logo_url = $1, updated_at = NOW() WHERE user_id = $2`,
    [url, userId]
  );
};

const updateQuoteConfig = async (
  userId: string,
  quoteStyle: string | null,
  quoteAccentColor: string | null,
  options?: { currency?: string | null; taxRate?: number | null; taxLabel?: string | null }
): Promise<void> => {
  const pool = DB.getPool();
  const fields = ["quote_style = $1", "quote_accent_color = $2"];
  const values: unknown[] = [quoteStyle, quoteAccentColor];
  let i = 3;

  if (options?.currency) { fields.push(`currency = $${i++}`); values.push(options.currency); }
  if (options?.taxRate !== undefined && options.taxRate !== null) { fields.push(`tax_rate = $${i++}`); values.push(options.taxRate); }
  if (options?.taxLabel !== undefined) { fields.push(`tax_label = $${i++}`); values.push(options.taxLabel); }

  values.push(userId);
  await pool.query(
    `UPDATE business_profiles SET ${fields.join(", ")}, updated_at = NOW() WHERE user_id = $${i}`,
    values
  );
};

export const companyProfileRepository = {
  initBusinessProfilesTable,
  getByUserId,
  upsert,
  updateQuoteLogo,
  updateQuoteConfig,
};
