import { Request, Response } from "express";
import * as repo from "./clients.repository";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const clientsController = {
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const clients = await repo.listClients(userId);
      return res.json({ ok: true, clients });
    } catch (e: any) {
      console.error("[clients] list:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const { name, email, phone, notes } = req.body;
      if (!name?.trim()) return res.status(400).json({ ok: false, message: "Nombre es requerido" });
      if (email?.trim() && !EMAIL_RE.test(String(email).trim()))
        return res.status(400).json({ ok: false, message: "Correo inválido" });
      const client = await repo.createClient(userId, {
        name: name.trim(),
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        notes: notes?.trim() || undefined,
      });
      return res.status(201).json({ ok: true, client });
    } catch (e: any) {
      console.error("[clients] create:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const clientId = String(req.params["clientId"]);
      const { name, email, phone, notes } = req.body;
      if (email !== undefined && email?.trim() && !EMAIL_RE.test(String(email).trim()))
        return res.status(400).json({ ok: false, message: "Correo inválido" });
      const client = await repo.updateClient(userId, clientId, {
        name: name?.trim(),
        email: email !== undefined ? (email?.trim() || null) : undefined,
        phone: phone !== undefined ? (phone?.trim() || null) : undefined,
        notes: notes !== undefined ? (notes?.trim() || null) : undefined,
      });
      if (!client) return res.status(404).json({ ok: false, message: "Cliente no encontrado" });
      return res.json({ ok: true, client });
    } catch (e: any) {
      console.error("[clients] update:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },

  async remove(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ ok: false, message: "No autorizado" });
      const deleted = await repo.deleteClient(userId, String(req.params["clientId"]));
      if (!deleted) return res.status(404).json({ ok: false, message: "Cliente no encontrado" });
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[clients] remove:", e);
      return res.status(500).json({ ok: false, message: "Error interno del servidor." });
    }
  },
};
