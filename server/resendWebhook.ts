import type { Express, Request, Response } from "express";
import express from "express";
import { Webhook } from "svix";
import { insertEmailEventRow } from "./db";

function parseResendWebhookPayload(evt: Record<string, unknown>) {
  const eventType = typeof evt.type === "string" ? evt.type : "unknown";
  const data =
    evt.data && typeof evt.data === "object" ? (evt.data as Record<string, unknown>) : {};
  const resendEmailId =
    (typeof data.email_id === "string" && data.email_id) ||
    (typeof data.id === "string" && data.id) ||
    null;

  let recipient: string | null = null;
  if (Array.isArray(data.to) && data.to.length > 0) {
    recipient = String(data.to[0]);
  } else if (typeof data.to === "string") {
    recipient = data.to;
  }

  let templateSlug: string | null = null;
  const tags = data.tags;
  if (Array.isArray(tags)) {
    for (const raw of tags) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as Record<string, unknown>;
      if (String(t.name) === "template" && typeof t.value === "string") {
        templateSlug = t.value;
        break;
      }
    }
  }

  return { eventType, resendEmailId, recipient, templateSlug };
}

/**
 * Registers `POST /api/resend/webhook` with **raw** JSON body (required for Svix).
 * Must be mounted **before** `express.json()` on the Express app.
 */
export function registerResendWebhookRoutes(app: Express): void {
  app.post(
    "/api/resend/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
      if (!secret) {
        console.warn("[Resend webhook] RESEND_WEBHOOK_SECRET is not set; refusing events");
        return res.status(503).json({ error: "Webhook not configured" });
      }

      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: "Expected raw JSON body" });
      }

      const payload = req.body.toString("utf8");
      const svixId = req.headers["svix-id"];
      const svixTimestamp = req.headers["svix-timestamp"];
      const svixSignature = req.headers["svix-signature"];
      if (
        typeof svixId !== "string" ||
        typeof svixTimestamp !== "string" ||
        typeof svixSignature !== "string"
      ) {
        return res.status(400).json({ error: "Missing Svix signature headers" });
      }

      try {
        const wh = new Webhook(secret);
        const evt = wh.verify(payload, {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        }) as Record<string, unknown>;

        const parsed = parseResendWebhookPayload(evt);
        await insertEmailEventRow({
          resendEmailId: parsed.resendEmailId,
          eventType: parsed.eventType,
          recipient: parsed.recipient,
          templateSlug: parsed.templateSlug,
          payload: evt,
        });

        return res.json({ received: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[Resend webhook] Verification or persist failed:", message);
        return res.status(400).json({ error: "Invalid webhook" });
      }
    }
  );
}
