import { Request, Response } from "express";
import * as repo from "./quote-catalog.repository";

export const quoteServicesController = {
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const services = await repo.listQuoteServices(userId);
      return res.json({ ok: true, services });
    } catch (e: any) {
      console.error("[quoteServices] list:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async listAll(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const services = await repo.listAllQuotableServices(userId);
      return res.json({ ok: true, services });
    } catch (e: any) {
      console.error("[quoteServices] listAll:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const { name, description, unit = "unidad", price, code, isQuoteOnly } = req.body;
      if (!name?.trim()) return res.status(400).json({ ok: false, message: "Nombre es requerido" });
      if (price == null || isNaN(Number(price)) || Number(price) < 0)
        return res.status(400).json({ ok: false, message: "Precio inválido" });
      const service = await repo.createQuoteService(userId, {
        name: name.trim(),
        description: description?.trim() || undefined,
        unit: unit || "unidad",
        price: Number(price),
        code: code?.trim() || undefined,
        isQuoteOnly: isQuoteOnly === undefined ? true : Boolean(isQuoteOnly),
      });
      return res.status(201).json({ ok: true, service });
    } catch (e: any) {
      console.error("[quoteServices] create:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const serviceId = String(req.params["serviceId"]);
      const { name, description, unit, price, code, isActive, isQuoteOnly } = req.body;
      const service = await repo.updateQuoteService(userId, serviceId, {
        name: name?.trim(),
        description: description !== undefined ? (description?.trim() || null) : undefined,
        unit: unit?.trim(),
        price: price != null ? Number(price) : undefined,
        code: code !== undefined ? (code?.trim() || null) : undefined,
        isActive,
        isQuoteOnly: isQuoteOnly !== undefined ? Boolean(isQuoteOnly) : undefined,
      });
      if (!service) return res.status(404).json({ ok: false, message: "Servicio no encontrado" });
      return res.json({ ok: true, service });
    } catch (e: any) {
      console.error("[quoteServices] update:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async remove(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const deleted = await repo.deleteQuoteService(userId, String(req.params["serviceId"]));
      if (!deleted) return res.status(404).json({ ok: false, message: "Servicio no encontrado" });
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[quoteServices] remove:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },
};
