import { Request, Response } from "express";
import {
  getQuoteByToken,
  claimQuoteFirstView,
  markQuoteAccepted,
  markQuoteRejected,
} from "../quotes/quote-history/quote-history.repository";
import { renderQuotePageHtml } from "./quote-view.html";
import { companyProfileRepository } from "../profiles/company_profile_repository";
import { getUserById } from "../../login/login.service";
import { sendQuoteStatusNotification } from "../quotes/quote-email.service";
import { CORS_ORIGINS } from "../../config/env";

type QuoteRow = Awaited<ReturnType<typeof getQuoteByToken>>;

// Avisa al dueño de la cuenta por correo — nunca debe romper la respuesta al cliente
// que está viendo/aceptando/rechazando la cotización, por eso siempre se atrapa el error.
async function notifyOwner(quote: NonNullable<QuoteRow>, status: "viewed" | "accepted" | "rejected") {
  try {
    const owner = await getUserById(quote.user_id);
    if (!owner?.email) return;
    await sendQuoteStatusNotification({
      to: owner.email,
      ownerName: owner.name || "",
      clientName: quote.client_name,
      total: Number(quote.total || 0),
      currency: quote.currency || undefined,
      status,
      historyUrl: CORS_ORIGINS[0] ? `${CORS_ORIGINS[0]}/cotizaciones` : undefined,
    });
  } catch (err) {
    console.error(`[quotePublic] notifyOwner(${status}) falló:`, err);
  }
}

function renderNotFound(): string {
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"/><title>Cotización no encontrada</title>
  <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#EAEAED;font-family:Arial,sans-serif;color:#111116;}
  .card{max-width:360px;text-align:center;padding:32px;background:#fff;border-radius:20px;}</style></head>
  <body><div class="card"><h1 style="font-size:18px;">Cotización no encontrada</h1>
  <p style="color:#78788C;font-size:13px;">Este link no es válido o ya expiró.</p></div></body></html>`;
}

export const quotePublicController = {
  async view(req: Request, res: Response): Promise<Response | void> {
    try {
      const token = String(req.params["token"] || "").trim();
      if (!token) return res.status(404).send(renderNotFound());

      const quote = await getQuoteByToken(token);
      if (!quote) return res.status(404).send(renderNotFound());

      claimQuoteFirstView(token)
        .then((viewedRow) => { if (viewedRow) void notifyOwner(viewedRow, "viewed"); })
        .catch((e) => console.error("[quotePublic] claimQuoteFirstView:", e));

      const profile = await companyProfileRepository.getByUserId(quote.user_id).catch(() => null);
      const businessName = profile?.business_name || "Negocio";

      return res.send(renderQuotePageHtml({
        token,
        brandName: businessName,
        clientName: quote.client_name,
        status: quote.status,
        items: quote.items || [],
        total: Number(quote.total || 0),
        message: quote.message,
        logoUrl: quote.quote_logo_url || profile?.quote_logo_url || null,
        accentColor: quote.quote_accent_color || profile?.quote_accent_color || profile?.brand_color || null,
        currency: quote.currency || profile?.currency || null,
        taxRate: quote.tax_rate != null ? Number(quote.tax_rate) : null,
        taxAmount: quote.tax_amount != null ? Number(quote.tax_amount) : null,
        taxLabel: quote.tax_label || null,
        nonce: String(res.locals["cspNonce"] || ""),
      }));
    } catch (error) {
      console.error("[quotePublic] view:", error);
      return res.status(500).send(renderNotFound());
    }
  },

  // Nota: v1 no integra pagos en línea (Mercado Pago quedó fuera del alcance).
  // Aceptar una cotización solo cambia su estado — el cobro se coordina fuera de la app.
  async accept(req: Request, res: Response): Promise<Response> {
    try {
      const token = String(req.params["token"] || "").trim();
      if (!token) return res.status(404).json({ ok: false, message: "Cotización no encontrada." });

      const existing = await getQuoteByToken(token);
      if (!existing) return res.status(404).json({ ok: false, message: "Cotización no encontrada." });

      if (existing.status === "accepted") {
        return res.json({ ok: true });
      }
      if (existing.status === "rejected") {
        return res.status(400).json({ ok: false, message: "Esta cotización ya fue rechazada." });
      }

      const quote = await markQuoteAccepted(token);
      if (!quote) return res.status(400).json({ ok: false, message: "No se pudo aceptar la cotización." });
      void notifyOwner(quote, "accepted");

      return res.json({ ok: true });
    } catch (error) {
      console.error("[quotePublic] accept:", error);
      return res.status(500).json({ ok: false, message: "No se pudo procesar la aceptación." });
    }
  },

  async reject(req: Request, res: Response): Promise<Response> {
    try {
      const token = String(req.params["token"] || "").trim();
      if (!token) return res.status(404).json({ ok: false, message: "Cotización no encontrada." });

      const quote = await markQuoteRejected(token);
      if (!quote) return res.status(400).json({ ok: false, message: "No se pudo actualizar la cotización." });
      void notifyOwner(quote, "rejected");

      return res.json({ ok: true });
    } catch (error) {
      console.error("[quotePublic] reject:", error);
      return res.status(500).json({ ok: false, message: "No se pudo procesar el rechazo." });
    }
  },
};
