import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Datos inválidos",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  // Errores internos — no exponer el mensaje al cliente
  console.error("[error]", req.method, req.path, error);

  return res.status(500).json({
    error: "Error interno del servidor",
  });
}
