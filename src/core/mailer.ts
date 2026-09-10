import nodemailer from "nodemailer";

export function createTransporter() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS ||
    !process.env.SMTP_FROM_EMAIL
  ) {
    throw new Error("Faltan variables SMTP");
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export const SMTP_FROM = () =>
  `"Cotiza Easy Pro" <${process.env.SMTP_FROM_EMAIL}>`;
