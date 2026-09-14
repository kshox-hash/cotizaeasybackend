import { Request, Response } from "express";
import { companyProfileService } from "./company_profile.service";
import { companyProfileRepository } from "./company_profile_repository";
import { isSupportedCurrency, taxNameForCurrency } from "../../utils/format";
import { QuoteCustomFieldDef, QuoteCustomFieldZone, QuoteLayoutBlock, QuoteLayoutBlockId } from "../quotes/quote.types";

const VALID_BLOCK_IDS: QuoteLayoutBlockId[] = ["client", "notes", "items", "terms", "signature", "footer"];
const VALID_FIELD_ZONES: QuoteCustomFieldZone[] = ["client", "meta", "footer"];
const MAX_CUSTOM_FIELDS = 12;

function sanitizeQuoteCustomFields(raw: unknown): QuoteCustomFieldDef[] {
  if (!Array.isArray(raw)) throw new Error("Los campos personalizados no tienen un formato válido");
  if (raw.length > MAX_CUSTOM_FIELDS) throw new Error(`Como máximo ${MAX_CUSTOM_FIELDS} campos personalizados`);
  const seen = new Set<string>();
  return raw.map((f): QuoteCustomFieldDef => {
    const zone = f?.zone;
    if (!VALID_FIELD_ZONES.includes(zone)) throw new Error(`Zona desconocida: ${zone}`);
    const title = String(f?.title ?? "").trim().slice(0, 60);
    if (!title) throw new Error("Cada campo necesita un título");
    // El id lo manda el cliente (se genera al crear el campo en el editor) — se
    // valida el formato y la unicidad, pero no se confía más allá de eso, ya
    // que también es la clave que se usa para leer su valor desde extraFields.
    const id = String(f?.id ?? "").trim();
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) throw new Error("Id de campo inválido");
    if (seen.has(id)) throw new Error(`Campo repetido: ${id}`);
    seen.add(id);
    return { id, title, zone };
  });
}

function sanitizeQuoteLayout(raw: unknown): QuoteLayoutBlock[] {
  if (!Array.isArray(raw)) throw new Error("El diseño de la cotización no tiene un formato válido");
  const seen = new Set<string>();
  const blocks = raw.map((b): QuoteLayoutBlock => {
    const id = b?.id;
    if (!VALID_BLOCK_IDS.includes(id)) throw new Error(`Bloque desconocido: ${id}`);
    if (seen.has(id)) throw new Error(`Bloque repetido: ${id}`);
    seen.add(id);
    const title = String(b?.title ?? "").trim().slice(0, 60);
    if (!title) throw new Error("Cada bloque necesita un título");
    const block: QuoteLayoutBlock = { id, title, visible: !!b?.visible };
    if (id === "terms" || id === "footer") block.text = String(b?.text ?? "").slice(0, 4000);
    return block;
  });
  // Los bloques fijos (cliente/detalle) no se pueden ocultar ni faltar — si el
  // cliente/frontend los omite o los apaga, se fuerzan de vuelta acá, nunca
  // se confía en eso solo del lado del cliente.
  for (const id of ["client", "items"] as const) {
    const b = blocks.find((x) => x.id === id);
    if (!b) throw new Error(`Falta el bloque obligatorio: ${id}`);
    b.visible = true;
  }
  if (VALID_BLOCK_IDS.some((id) => !blocks.find((b) => b.id === id))) {
    throw new Error("Faltan bloques en el diseño");
  }
  return blocks;
}

type UpsertMeBody = {
  business_name: string;
  rut?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  brand_color?: string | null;
  description?: string | null;
};

export const companyProfileController = {
  async getMe(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
      }
      const profile = await companyProfileService.getByUserId(userId);
      return res.json({ ok: true, profile });
    } catch (error) {
      console.error("[companyProfile] getMe:", error);
      return res.status(500).json({ ok: false, message: "Error obteniendo perfil de empresa" });
    }
  },

  async upsertMe(req: Request<unknown, unknown, UpsertMeBody>, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
      }
      const profile = await companyProfileService.upsert({ ...req.body, user_id: userId });
      return res.json({ ok: true, profile });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "Error guardando perfil de empresa",
      });
    }
  },

  async updateQuoteConfig(
    req: Request<unknown, unknown, {
      quote_style?: string | null; quote_accent_color?: string | null; currency?: string | null;
      tax_rate?: number | string | null;
    }>,
    res: Response
  ): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
      }
      const quoteStyle = req.body?.quote_style ?? null;
      const quoteAccentColor = req.body?.quote_accent_color ?? null;
      const rawCurrency = req.body?.currency ?? null;
      if (rawCurrency && !isSupportedCurrency(rawCurrency)) {
        return res.status(400).json({ ok: false, message: "Moneda no soportada" });
      }
      const currency = rawCurrency ? rawCurrency.toUpperCase() : null;

      let taxRate: number | undefined;
      if (req.body?.tax_rate !== undefined && req.body?.tax_rate !== null) {
        const n = Number(req.body.tax_rate);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return res.status(400).json({ ok: false, message: "El impuesto debe ser un porcentaje entre 0 y 100" });
        }
        taxRate = n;
      }

      // El nombre del impuesto nunca se acepta como texto libre del cliente — no tiene
      // sentido que alguien pueda poner cualquier cosa ahí. Se deriva siempre acá según
      // la moneda (la que llega en este request, o si no viene, la que ya tenía guardada).
      let effectiveCurrency = currency;
      if (!effectiveCurrency) {
        const existing = await companyProfileRepository.getByUserId(userId).catch(() => null);
        effectiveCurrency = existing?.currency || "CLP";
      }
      const taxLabel = taxNameForCurrency(effectiveCurrency);

      await companyProfileRepository.updateQuoteConfig(userId, quoteStyle, quoteAccentColor, { currency, taxRate, taxLabel });
      return res.json({ ok: true });
    } catch (error) {
      console.error("[companyProfile] updateQuoteConfig:", error);
      return res.status(500).json({ ok: false, message: "Error guardando configuración de cotizaciones" });
    }
  },

  async updateQuoteLayout(
    req: Request<unknown, unknown, { blocks?: unknown }>,
    res: Response
  ): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
      }
      let blocks: QuoteLayoutBlock[];
      try {
        blocks = sanitizeQuoteLayout(req.body?.blocks);
      } catch (err) {
        return res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "Diseño inválido" });
      }
      await companyProfileRepository.updateQuoteLayout(userId, blocks);
      return res.json({ ok: true, blocks });
    } catch (error) {
      console.error("[companyProfile] updateQuoteLayout:", error);
      return res.status(500).json({ ok: false, message: "Error guardando el diseño de la cotización" });
    }
  },

  async updateCustomFields(
    req: Request<unknown, unknown, { fields?: unknown }>,
    res: Response
  ): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
      }
      let fields: QuoteCustomFieldDef[];
      try {
        fields = sanitizeQuoteCustomFields(req.body?.fields);
      } catch (err) {
        return res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "Campos inválidos" });
      }
      await companyProfileRepository.updateCustomFields(userId, fields);
      return res.json({ ok: true, fields });
    } catch (error) {
      console.error("[companyProfile] updateCustomFields:", error);
      return res.status(500).json({ ok: false, message: "Error guardando los campos personalizados" });
    }
  },
};
