import { Request, Response } from "express";
import * as repo from "./quote-history.repository";
import { companyProfileService } from "../../profiles/company_profile.service";
import { dispatchQuoteToClients, normalizeStoredItemsToLines } from "../quote-dispatch.service";

type ResendBody = {
  clients: { name: string; email: string; phone?: string }[];
};

export const quoteHistoryController = {
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const quotes = await repo.listQuoteHistory(userId);
      return res.json({ ok: true, quotes });
    } catch (e: any) {
      console.error("[quoteHistory] list:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async remove(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const deleted = await repo.deleteQuoteHistory(userId, String(req.params["quoteId"]));
      if (!deleted) return res.status(404).json({ ok: false, message: "No encontrado" });
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[quoteHistory] remove:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async answer(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const answered = await repo.markQuoteAnswered(userId, String(req.params["quoteId"]));
      if (!answered) return res.status(404).json({ ok: false, message: "No encontrado" });
      return res.json({ ok: true, quote: answered });
    } catch (e: any) {
      console.error("[quoteHistory] answer:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async resend(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

      const { clients } = req.body as ResendBody;
      if (!Array.isArray(clients) || clients.length === 0) {
        return res.status(400).json({ ok: false, message: "Se requiere al menos un destinatario." });
      }
      for (const c of clients) {
        if (!c?.name?.trim() || !c?.email?.trim()) {
          return res.status(400).json({ ok: false, message: "Nombre y email son obligatorios para cada destinatario." });
        }
      }

      const quoteId = String(req.params["quoteId"]);
      const original = await repo.getQuoteByIdForUser(userId, quoteId);
      if (!original) return res.status(404).json({ ok: false, message: "Cotización no encontrada." });

      const profile = await companyProfileService.getByUserId(userId).catch(() => null);

      const brandName = profile?.business_name || "Mi negocio";

      const brandAddress = [profile?.address, profile?.city].filter(Boolean).join(", ") || undefined;

      const lines = normalizeStoredItemsToLines(original.items);
      const total = Number(original.total) || lines.reduce((acc, l) => acc + l.subtotal, 0);
      const docTitle = original.template_type === "eventos" ? "Propuesta" : "Cotización";

      const results = await dispatchQuoteToClients({
        userId,
        clients,
        templateType: original.template_type,
        docTitle,
        brandName,
        brandRut:           profile?.rut || undefined,
        brandAddress,
        brandPhone:         profile?.phone || undefined,
        brandCoverImageUrl: original.quote_logo_url || profile?.quote_logo_url || undefined,
        brandAccentColor:   original.quote_accent_color || profile?.quote_accent_color || profile?.brand_color || undefined,
        quoteStyle:         original.quote_style || profile?.quote_style || undefined,
        currency:           original.currency || profile?.currency || undefined,
        subtitle:           profile?.description || "",
        items:              original.items,
        lines,
        total,
        taxRate:            original.tax_rate != null ? Number(original.tax_rate) : undefined,
        taxAmount:          original.tax_amount != null ? Number(original.tax_amount) : undefined,
        taxLabel:           original.tax_label || undefined,
        message:            original.message || undefined,
        extraFields:        original.extra_fields || undefined,
      });

      const failed = results.filter(r => !r.ok);
      if (failed.length === results.length) {
        return res.status(500).json({ ok: false, message: "No se pudo reenviar la cotización a ningún destinatario.", results });
      }

      return res.status(200).json({
        ok: true,
        message: failed.length > 0
          ? `Cotización reenviada a ${results.length - failed.length} de ${results.length} destinatarios.`
          : "Cotización reenviada correctamente.",
        results,
      });
    } catch (e: any) {
      console.error("[quoteHistory] resend:", e);
      return res.status(500).json({ ok: false, message: "Error reenviando cotización." });
    }
  },
};
