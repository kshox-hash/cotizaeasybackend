import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env";

type AuthUser = {
  userId: string;
  email: string;
};

// Se amplía Express.User (no Request.user directamente) porque passport también declara
// Request.user?: Express.User — redeclararlo con otro tipo choca (TS2717). Ampliando el
// mismo User que usa passport, req.user queda con userId/email en cualquier ruta, y en el
// callback de Google (donde passport pone ahí {token, user: {...}}) se sigue casteando.
declare global {
  namespace Express {
    interface User {
      userId?: string;
      email?: string;
      // Solo los pone el callback de /auth/google/callback (ver strategies/google.strategy.ts) —
      // ahí req.user no es el JWT decodificado sino lo que retorna loginOrCreateWithGoogle().
      token?: string;
      user?: { id: string; email: string; name: string };
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return res.status(401).json({ error: "Token requerido" });
    }

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Formato de token inválido" });
    }

    const token = authorization.replace("Bearer ", "").trim();

    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };

    return next();
  } catch {
    return res.status(401).json({
      error: "Token inválido o expirado",
    });
  }
}

export {};
