import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import DB from "../db/db_configuration";

function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Los tokens de verificación/recuperación se guardan hasheados (nunca en texto plano),
// igual que las contraseñas — si alguien lee la base de datos no puede reutilizarlos.
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function registerUser(email: string, password: string, name?: string) {
  const pool = DB.getPool();

  const existing = await pool.query(
    `select id from users where lower(email) = lower($1) limit 1`,
    [email]
  );

  if ((existing.rowCount ?? 0) > 0) {
    throw new Error("Ya existe una cuenta con ese correo");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const verifyToken = generateRawToken();
  const verifyTokenHash = hashToken(verifyToken);
  const verifyExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

  const result = await pool.query(
    `
    insert into users (email, password, name, verify_token_hash, verify_token_expires_at, trial_ends_at)
    values ($1, $2, $3, $4, $5, now() + interval '2 days')
    returning id, email, name
    `,
    [email, passwordHash, name || null, verifyTokenHash, verifyExpiresAt]
  );

  const user = result.rows[0];

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name || "",
    },
    verifyToken,
  };
}

export async function loginUser(email: string, password: string) {
  const pool = DB.getPool();

  const result = await pool.query(
    `
    select id, email, password, email_verified
    from users
    where lower(email) = lower($1)
    limit 1
    `,
    [email]
  );

  if (result.rowCount === 0) {
    throw new Error("Usuario no existe");
  }

  const user = result.rows[0];

  if (!user.password) {
    throw new Error("Credenciales inválidas");
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    throw new Error("Credenciales inválidas");
  }

  if (!user.email_verified) {
    throw new Error("Debes confirmar tu correo antes de iniciar sesión");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET as string,
    {
      expiresIn: "7d",
    }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
    },
  };
}

// Login con Google: si el correo ya tiene cuenta, entra con esa cuenta (y si estaba
// sin verificar por el flujo de contraseña, queda verificada — Google ya confirmó que
// es dueño de ese correo, no hace falta pedírselo de nuevo). Si no existe, se crea sola,
// sin contraseña (password null) — loginUser ya trata "sin password" como "no puede
// entrar con clave", así que esas cuentas solo entran por Google hasta que le pongan una.
export async function loginOrCreateWithGoogle(email: string, name?: string, avatarUrl?: string) {
  const pool = DB.getPool();

  const existing = await pool.query(
    `select id, email, name from users where lower(email) = lower($1) limit 1`,
    [email]
  );

  let user = existing.rows[0];

  if (user) {
    // avatar_url se actualiza con el de Google en cada login (a diferencia del
    // nombre, que solo se completa si estaba vacío) — así si la persona cambia
    // su foto de perfil se refleja acá. Si Google no manda foto esta vez, se
    // queda con la que ya había en vez de borrarla.
    await pool.query(
      `update users set email_verified = true, name = coalesce(nullif(name, ''), $1), avatar_url = coalesce($3, avatar_url) where id = $2`,
      [name || null, user.id, avatarUrl || null]
    );
  } else {
    const inserted = await pool.query(
      `insert into users (email, password, name, email_verified, avatar_url)
       values ($1, null, $2, true, $3)
       returning id, email, name`,
      [email, name || null, avatarUrl || null]
    );
    user = inserted.rows[0];
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: { id: user.id, email: user.email, name: name || user.name || "", avatarUrl: avatarUrl || "" },
  };
}

export async function getUserById(userId: string) {
  const pool = DB.getPool();

  const result = await pool.query(
    `select id, email, name, email_verified, avatar_url from users where id = $1 limit 1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new Error("Usuario no existe");
  }

  return result.rows[0];
}

export async function updateUserName(userId: string, name: string) {
  const pool = DB.getPool();

  const result = await pool.query(
    `update users set name = $1 where id = $2 returning id, email, name`,
    [name, userId]
  );

  if (result.rowCount === 0) {
    throw new Error("Usuario no existe");
  }

  return result.rows[0];
}

export async function changeUserPassword(userId: string, currentPassword: string, newPassword: string) {
  const pool = DB.getPool();

  const result = await pool.query(
    `select password from users where id = $1 limit 1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new Error("Usuario no existe");
  }

  const user = result.rows[0];

  if (!user.password) {
    throw new Error("Credenciales inválidas");
  }

  const isValid = await bcrypt.compare(currentPassword, user.password);

  if (!isValid) {
    throw new Error("Contraseña actual incorrecta");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await pool.query(`update users set password = $1 where id = $2`, [passwordHash, userId]);
}

// ─── Verificación de email ──────────────────────────────────────────────────

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const pool = DB.getPool();
  const token = generateRawToken();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await pool.query(
    `update users set verify_token_hash = $1, verify_token_expires_at = $2 where id = $3`,
    [hashToken(token), expiresAt, userId]
  );
  return token;
}

// Igual que createEmailVerificationToken, pero sin requerir sesión — la necesita alguien
// que todavía no puede loguearse (login bloquea cuentas sin verificar) y perdió el correo
// original o el token de 48h ya venció. Misma respuesta exista o no la cuenta, y también
// si ya estaba verificada — no revela nada sobre qué correos están registrados.
export async function resendVerificationByEmail(email: string): Promise<{ email: string; name: string; verifyToken: string } | null> {
  const pool = DB.getPool();
  const existing = await pool.query(
    `select id, name, email_verified from users where lower(email) = lower($1) limit 1`,
    [email]
  );
  const user = existing.rows[0];
  if (!user || user.email_verified) return null;

  const verifyToken = await createEmailVerificationToken(user.id);
  return { email, name: user.name || "", verifyToken };
}

export async function verifyEmailWithToken(token: string): Promise<{ id: string; email: string } | null> {
  const pool = DB.getPool();
  const result = await pool.query(
    `update users
     set email_verified = true, verify_token_hash = null, verify_token_expires_at = null
     where verify_token_hash = $1 and verify_token_expires_at > now()
     returning id, email`,
    [hashToken(token)]
  );
  return result.rows[0] || null;
}

// ─── Recuperación de contraseña ─────────────────────────────────────────────

export async function createPasswordResetToken(email: string): Promise<{ userId: string; token: string; name: string } | null> {
  const pool = DB.getPool();
  const existing = await pool.query(
    `select id, name from users where lower(email) = lower($1) limit 1`,
    [email]
  );
  const user = existing.rows[0];
  if (!user) return null; // el controller responde igual que si existiera — no revela si el email está registrado

  const token = generateRawToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
  await pool.query(
    `update users set reset_token_hash = $1, reset_token_expires_at = $2 where id = $3`,
    [hashToken(token), expiresAt, user.id]
  );
  return { userId: user.id, token, name: user.name || "" };
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const pool = DB.getPool();
  const passwordHash = await bcrypt.hash(newPassword, 10);
  // Check-y-clear en un solo UPDATE atómico (igual que verifyEmailWithToken) para que
  // dos requests concurrentes con el mismo token no puedan "ganar la carrera" ambas.
  const result = await pool.query(
    `update users
     set password = $1, reset_token_hash = null, reset_token_expires_at = null
     where reset_token_hash = $2 and reset_token_expires_at > now()
     returning id`,
    [passwordHash, hashToken(token)]
  );
  return result.rows.length > 0;
}
