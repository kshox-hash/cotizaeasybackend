import fs from "fs";
import { Request, Response } from "express";
import { uploadImageToR2, deleteFromR2 } from "../../utils/r2-upload";
import { companyProfileService } from "../profiles/company_profile.service";
import { companyProfileRepository } from "../profiles/company_profile_repository";
import { dispatchQuoteToClients } from "./quote-dispatch.service";
import { generateQuotePdf } from "./quote.service";
import { QuoteTemplateType } from "./quote.types";

type QuoteItem = {
  title: string;
  price: number;
  description?: string;
  quantity?: number;
};

type SendQuoteBody = {
  clients: {
    name: string;
    email: string;
    phone?: string;
  }[];
  products: QuoteItem[];
  message?: string;
  templateType?: string;
  extraFields?: Record<string, any>;
  quoteStyle?: string;
  quoteAccentColor?: string;
  quoteLogoUrl?: string;
  currency?: string;
  taxRate?: number;
  taxLabel?: string;
};

function computeTax(subtotal: number, taxRatePercent: number | undefined | null) {
  const taxRate = Number(taxRatePercent || 0);
  const taxAmount = taxRate > 0 ? Math.round(subtotal * (taxRate / 100)) : 0;
  return { taxRate: taxRate > 0 ? taxRate : undefined, taxAmount: taxRate > 0 ? taxAmount : undefined, total: subtotal + taxAmount };
}

export const quoteSendController = {
  async uploadLogo(req: Request, res: Response): Promise<Response> {
    try {
      const userId = String(req.user?.userId ?? "").trim();
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ ok: false, message: "No se recibió ninguna imagen." });

      const previousUrl = (await companyProfileRepository.getByUserId(userId).catch(() => null))?.quote_logo_url || null;

      const result = await uploadImageToR2(file.buffer, `quote-logos/${userId}`, {
        width: 800,
        height: 400,
        fit: "inside",
      });

      await companyProfileRepository.updateQuoteLogo(userId, result.url);
      if (previousUrl && previousUrl !== result.url) void deleteFromR2(previousUrl);

      return res.json({ ok: true, url: result.url });
    } catch (err) {
      console.error("[quoteSend] uploadLogo:", err);
      return res.status(500).json({ ok: false, message: "Error subiendo imagen." });
    }
  },

  async removeLogo(req: Request, res: Response): Promise<Response> {
    try {
      const userId = String(req.user?.userId ?? "").trim();
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

      const previousUrl = (await companyProfileRepository.getByUserId(userId).catch(() => null))?.quote_logo_url || null;

      await companyProfileRepository.updateQuoteLogo(userId, null);
      if (previousUrl) void deleteFromR2(previousUrl);

      return res.json({ ok: true });
    } catch (err) {
      console.error("[quoteSend] removeLogo:", err);
      return res.status(500).json({ ok: false, message: "Error quitando el logo." });
    }
  },

  async preview(req: Request<{}, {}, SendQuoteBody>, res: Response): Promise<Response | void> {
    let filePath: string | null = null;
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

      const {
        clients,
        products,
        templateType = "rapida",
        extraFields = {},
        quoteStyle,
        quoteAccentColor,
        quoteLogoUrl,
        currency,
        taxRate: taxRateOverride,
        taxLabel: taxLabelOverride,
      } = req.body;

      if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ ok: false, message: "Se requiere al menos un producto." });
      }

      const profile = await companyProfileService.getByUserId(userId).catch(() => null);
      const brandName = profile?.business_name || "Mi negocio";
      const brandAddress = [profile?.address, profile?.city].filter(Boolean).join(", ") || undefined;

      const lines = products.map((p) => {
        const unitPrice = Number(p.price || 0);
        const quantity = Math.max(1, Number(p.quantity || 1));
        return {
          name: p.title || "Servicio",
          description: p.description || "",
          quantity,
          unitPrice,
          subtotal: unitPrice * quantity,
        };
      });
      const subtotal = lines.reduce((acc, l) => acc + l.subtotal, 0);
      const { taxRate, taxAmount, total } = computeTax(subtotal, taxRateOverride ?? profile?.tax_rate);
      const docTitle = templateType === "eventos" ? "Propuesta" : "Cotización";
      const previewClient = clients?.[0];

      const generated = await generateQuotePdf({
        token: `preview-${userId}-${Date.now()}`,
        brand: brandName,
        brandRut: profile?.rut || undefined,
        brandAddress,
        brandPhone: profile?.phone || undefined,
        brandCoverImageUrl: quoteLogoUrl || profile?.quote_logo_url || undefined,
        brandAccentColor: quoteAccentColor || profile?.quote_accent_color || profile?.brand_color || undefined,
        quoteStyle: quoteStyle || profile?.quote_style || undefined,
        currency: currency || profile?.currency || undefined,
        title: docTitle,
        subtitle: profile?.description || "",
        templateType: templateType as QuoteTemplateType,
        customer: {
          name: previewClient?.name || "Cliente de ejemplo",
          email: previewClient?.email || "cliente@ejemplo.com",
          phone: previewClient?.phone || "",
          notes: "",
        },
        lines,
        total,
        taxRate,
        taxAmount,
        taxLabel: taxLabelOverride || profile?.tax_label || undefined,
        extraFields,
      });
      filePath = generated.filePath;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on("close", () => { if (filePath) fs.unlink(filePath, () => {}); });
    } catch (error: any) {
      if (filePath) fs.unlink(filePath, () => {});
      console.error("[quoteSend] preview:", error);
      return res.status(500).json({ ok: false, message: "Error generando la vista previa." });
    }
  },

  async send(req: Request<{}, {}, SendQuoteBody>, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });

      const {
        clients,
        products,
        message,
        templateType = "rapida",
        extraFields = {},
        quoteStyle,
        quoteAccentColor,
        quoteLogoUrl,
        currency,
      } = req.body;

      if (!Array.isArray(clients) || clients.length === 0) {
        return res.status(400).json({ ok: false, message: "Se requiere al menos un destinatario." });
      }
      for (const c of clients) {
        if (!c?.name?.trim() || !c?.email?.trim()) {
          return res.status(400).json({ ok: false, message: "Nombre y email son obligatorios para cada destinatario." });
        }
      }
      if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ ok: false, message: "Se requiere al menos un producto." });
      }

      const profile = await companyProfileService.getByUserId(userId).catch(() => null);

      const brandName = profile?.business_name || "Mi negocio";

      const brandAddress = [profile?.address, profile?.city].filter(Boolean).join(", ") || undefined;

      const lines = products.map((p) => {
        const unitPrice = Number(p.price || 0);
        const quantity = Math.max(1, Number(p.quantity || 1));
        return {
          name: p.title || "Servicio",
          description: p.description || "",
          quantity,
          unitPrice,
          subtotal: unitPrice * quantity,
        };
      });

      const subtotal = lines.reduce((acc, l) => acc + l.subtotal, 0);
      const { taxRate, taxAmount, total } = computeTax(subtotal, profile?.tax_rate);
      const docTitle = templateType === "eventos" ? "Propuesta" : "Cotización";

      const results = await dispatchQuoteToClients({
        userId,
        clients,
        templateType,
        docTitle,
        brandName,
        brandRut: profile?.rut || undefined,
        brandAddress,
        brandPhone: profile?.phone || undefined,
        brandCoverImageUrl: quoteLogoUrl || profile?.quote_logo_url || undefined,
        brandAccentColor: quoteAccentColor || profile?.quote_accent_color || profile?.brand_color || undefined,
        quoteStyle: quoteStyle || profile?.quote_style || undefined,
        currency: currency || profile?.currency || undefined,
        subtitle: profile?.description || "",
        items: products,
        lines,
        total,
        taxRate,
        taxAmount,
        taxLabel: profile?.tax_label || undefined,
        message,
        extraFields,
      });

      const failed = results.filter((r) => !r.ok);
      if (failed.length === results.length) {
        return res.status(500).json({ ok: false, message: "No se pudo enviar la cotización a ningún destinatario.", results });
      }

      return res.status(200).json({
        ok: true,
        message:
          failed.length > 0
            ? `Cotización enviada a ${results.length - failed.length} de ${results.length} destinatarios.`
            : "Cotización enviada correctamente.",
        results,
      });
    } catch (error: any) {
      console.error("[quoteSend] send:", error);
      return res.status(500).json({ ok: false, message: "Error enviando cotización." });
    }
  },
};
