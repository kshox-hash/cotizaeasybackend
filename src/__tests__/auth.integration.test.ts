// Pruebas de integración: pegan contra el servidor real corriendo en TEST_API_URL
// (por defecto http://localhost:4001) y usan la misma base de datos configurada en
// .env para setup/limpieza. Cada test genera un email único y borra el usuario que
// crea al final, para no ensuciar datos de otras cuentas.
import "../config/env";
import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import DB from "../db/db_configuration";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:4001";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@example.com`;
}

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const createdEmails: string[] = [];

afterAll(async () => {
  if (createdEmails.length > 0) {
    await DB.getPool().query(`DELETE FROM users WHERE email = ANY($1)`, [createdEmails]);
  }
  await DB.getPool().end();
});

describe("POST /auth/register", () => {
  it("crea una cuenta nueva y devuelve un token", async () => {
    const email = uniqueEmail("register-ok");
    createdEmails.push(email);

    const { status, json } = await post("/auth/register", { email, password: "test1234" });

    expect(status).toBe(201);
    expect(json.ok).toBe(true);
    expect(typeof json.token).toBe("string");
    expect(json.user.email).toBe(email);
  });

  it("rechaza un registro duplicado con el mismo correo", async () => {
    const email = uniqueEmail("register-dup");
    createdEmails.push(email);

    await post("/auth/register", { email, password: "test1234" });
    const { status, json } = await post("/auth/register", { email, password: "test1234" });

    expect(status).toBe(409);
    expect(json.ok).toBe(false);
  });

  it("una cuenta nueva empieza con email_verified = false", async () => {
    const email = uniqueEmail("register-unverified");
    createdEmails.push(email);
    await post("/auth/register", { email, password: "test1234" });

    const row = await DB.getPool().query(`select email_verified from users where email = $1`, [email]);
    expect(row.rows[0].email_verified).toBe(false);
  });
});

describe("POST /auth/login", () => {
  it("inicia sesión con las credenciales correctas", async () => {
    const email = uniqueEmail("login-ok");
    createdEmails.push(email);
    await post("/auth/register", { email, password: "test1234" });

    const { status, json } = await post("/auth/login", { email, password: "test1234" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.token).toBe("string");
  });

  it("rechaza una contraseña incorrecta", async () => {
    const email = uniqueEmail("login-badpw");
    createdEmails.push(email);
    await post("/auth/register", { email, password: "test1234" });

    const { status, json } = await post("/auth/login", { email, password: "contraseña-incorrecta" });
    expect(status).toBe(401);
    expect(json.ok).toBe(false);
  });
});

describe("Recuperación de contraseña", () => {
  it("permite restablecer la contraseña con el token y luego iniciar sesión con la nueva", async () => {
    const email = uniqueEmail("reset-flow");
    createdEmails.push(email);
    await post("/auth/register", { email, password: "clave-original" });

    // forgot-password nunca devuelve el token (sale solo por correo) — lo leemos
    // directo de la base para simular haber hecho click en el link del email.
    const forgot = await post("/auth/forgot-password", { email });
    expect(forgot.status).toBe(200);
    expect(forgot.json.ok).toBe(true);

    const row = await DB.getPool().query(
      `select reset_token_hash, reset_token_expires_at from users where email = $1`, [email]
    );
    expect(row.rows[0].reset_token_hash).toBeTruthy();
    expect(new Date(row.rows[0].reset_token_expires_at).getTime()).toBeGreaterThan(Date.now());

    // No tenemos el token en texto plano (solo su hash quedó en la DB) — para probar el
    // endpoint end-to-end generamos uno nuevo llamando al servicio directamente.
    const { createPasswordResetToken, resetPasswordWithToken } = await import("../login/login.service");
    const tokenResult = await createPasswordResetToken(email);
    expect(tokenResult).not.toBeNull();

    const reset = await post("/auth/reset-password", { token: tokenResult!.token, newPassword: "clave-nueva" });
    expect(reset.status).toBe(200);
    expect(reset.json.ok).toBe(true);

    // la contraseña vieja ya no sirve
    const loginOld = await post("/auth/login", { email, password: "clave-original" });
    expect(loginOld.status).toBe(401);

    // la nueva sí
    const loginNew = await post("/auth/login", { email, password: "clave-nueva" });
    expect(loginNew.status).toBe(200);

    // el mismo token no se puede reutilizar
    const reuse = await resetPasswordWithToken(tokenResult!.token, "otra-mas");
    expect(reuse).toBe(false);
  });

  it("responde ok:true aunque el correo no exista (no revela qué cuentas están registradas)", async () => {
    const { status, json } = await post("/auth/forgot-password", { email: "no-existe-nunca@example.com" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
  });
});

describe("Verificación de email", () => {
  it("marca email_verified = true con un token válido, y no permite reusarlo", async () => {
    const email = uniqueEmail("verify-flow");
    createdEmails.push(email);
    await post("/auth/register", { email, password: "test1234" });

    const { createEmailVerificationToken } = await import("../login/login.service");
    const row = await DB.getPool().query(`select id from users where email = $1`, [email]);
    const token = await createEmailVerificationToken(row.rows[0].id);

    const verify = await post("/auth/verify-email", { token });
    expect(verify.status).toBe(200);
    expect(verify.json.ok).toBe(true);

    const after = await DB.getPool().query(`select email_verified from users where email = $1`, [email]);
    expect(after.rows[0].email_verified).toBe(true);

    const reuse = await post("/auth/verify-email", { token });
    expect(reuse.status).toBe(400);
  });

  it("rechaza un token inválido", async () => {
    const { status, json } = await post("/auth/verify-email", { token: "token-que-no-existe" });
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
  });
});
