import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

/**
 * Verifica la firma X-Hub-Signature-256 que Meta envía en cada webhook POST.
 * Si META_APP_SECRET no está configurado, deja pasar (modo dev sin firma).
 */
export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction) {
  if (!config.appSecret) {
    return next();
  }
  const sig = req.headers["x-hub-signature-256"];
  if (typeof sig !== "string") {
    console.warn("[webhook] falta X-Hub-Signature-256");
    res.sendStatus(401);
    return;
  }
  const body = JSON.stringify(req.body);
  const expected = "sha256=" + createHmac("sha256", config.appSecret).update(body).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      console.warn("[webhook] firma inválida");
      res.sendStatus(403);
      return;
    }
  } catch {
    res.sendStatus(403);
    return;
  }
  next();
}

/**
 * Protege rutas internas (web → bot) con el shared secret.
 * El cliente web lo pone en el header X-Lia-Secret.
 * En modo dev (secret sin env) se muestra en consola al arrancar.
 */
export function requireLiaSecret(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["x-lia-secret"];
  if (header === config.liaSecret) return next();
  console.warn("[auth] X-Lia-Secret inválido o ausente desde", req.ip);
  res.sendStatus(401);
}
