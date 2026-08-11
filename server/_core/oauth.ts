import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { notifyOwnerViaTelegram } from "../telegramBot";
import axios from "axios";
import { sendWelcomeEmail, sendPasswordResetEmail } from "../utils/email.js";

type GoogleOAuthStatePayload = {
  v: number;
  utm?: Record<string, string | undefined>;
  returnTo?: string | null;
  firstReferrer?: string | null;
};

function decodeGoogleOAuthState(raw: string | undefined): GoogleOAuthStatePayload | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const json = Buffer.from(decodeURIComponent(raw), "base64").toString("utf8");
    const parsed = JSON.parse(json) as GoogleOAuthStatePayload;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safePostLoginRedirect(returnTo: string | null | undefined): string {
  if (
    returnTo &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.startsWith("/api/")
  ) {
    return returnTo;
  }
  return "/";
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

const getBaseUrl = (): string => {
  // Must match the apex canonical host (www redirects to spyreels.ai).
  // Set OAUTH_SERVER_URL=https://spyreels.ai in production; never www.
  const url = process.env.OAUTH_SERVER_URL || "https://spyreels.ai";
  return url.replace(/\/$/, "");
};

export function registerOAuthRoutes(app: Express) {
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${getBaseUrl()}/api/oauth/callback`;
    const forwardedState = typeof req.query.state === "string" ? req.query.state : "";
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
    });
    if (forwardedState) {
      params.set("state", forwardedState);
    }
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const oauthStateRaw = getQueryParam(req, "state");
    const oauthState = decodeGoogleOAuthState(oauthStateRaw);
    if (!code) {
      res.status(400).json({ error: "Missing code from Google" });
      return;
    }
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = `${getBaseUrl()}/api/oauth/callback`;
      const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });
      const { access_token } = tokenRes.data;
      const userInfoRes = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const googleUser = userInfoRes.data;
      const openId = `google_${googleUser.id}`;
      const existingUser = await db.getUserByOpenId(openId);
      const isNewUser = !existingUser;
      await db.upsertUser({
        openId,
        name: googleUser.name || null,
        email: googleUser.email ?? null,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });
      if (isNewUser) {
        const userName = googleUser.name || "Unknown";
        const userEmail = googleUser.email || "No email";
        const signupTime = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
        notifyOwnerViaTelegram([
          `🎉 <b>New SpyReels Signup!</b>`,
          `👤 <b>Name:</b> ${userName}`,
          `📧 <b>Email:</b> ${userEmail}`,
          `🔑 <b>Login:</b> Google`,
          `🕐 <b>Time:</b> ${signupTime}`,
        ].join("\n")).catch(console.warn);
        sendWelcomeEmail(userEmail, googleUser.name?.split(" ")[0] || "there").catch(console.warn);
        console.log(`[OAuth] New user signup: ${userName} (${userEmail})`);
        const created = await db.getUserByOpenId(openId);
        if (created && oauthState) {
          const u = oauthState.utm ?? {};
          await db.applySignupAttribution(created.id, {
            utmSource: u.utm_source ?? null,
            utmMedium: u.utm_medium ?? null,
            utmCampaign: u.utm_campaign ?? null,
            utmTerm: u.utm_term ?? null,
            utmContent: u.utm_content ?? null,
            firstReferrer: oauthState.firstReferrer ?? null,
          });
        }
      }
      const sessionToken = await sdk.createSessionToken(openId, {
        name: googleUser.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, safePostLoginRedirect(oauthState?.returnTo));
    } catch (error) {
      console.error("[OAuth] Google callback failed", error);
      res.redirect("/?error=login_failed");
    }
  });

  // Email/password login
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    try {
      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      const bcrypt = await import("bcryptjs");
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Email/password register
  app.post("/api/auth/register", async (req, res) => {
    const { email, password, name, attribution } = req.body as {
      email?: string;
      password?: string;
      name?: string;
      attribution?: {
        utmSource?: string | null;
        utmMedium?: string | null;
        utmCampaign?: string | null;
        utmTerm?: string | null;
        utmContent?: string | null;
        firstReferrer?: string | null;
      };
    };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    try {
      const existing = await db.getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 12);
      const openId = `email_${email}`;
      await db.upsertUser({
        openId,
        name: name || null,
        email,
        loginMethod: "email",
        passwordHash,
        lastSignedIn: new Date(),
      });
      const created = await db.getUserByEmail(email);
      if (created && attribution) {
        await db.applySignupAttribution(created.id, {
          utmSource: attribution.utmSource ?? null,
          utmMedium: attribution.utmMedium ?? null,
          utmCampaign: attribution.utmCampaign ?? null,
          utmTerm: attribution.utmTerm ?? null,
          utmContent: attribution.utmContent ?? null,
          firstReferrer: attribution.firstReferrer ?? null,
        });
      }
      sendWelcomeEmail(email, name?.split(" ")[0] || "there").catch(console.warn);
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Register failed", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Forgot password
  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Email required" });
      return;
    }
    try {
      const user = await db.getUserByEmail(email);
      if (!user) {
        res.json({ success: true }); // Don't reveal if email exists
        return;
      }
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
      const mysql = await import("mysql2/promise");
      const conn = await mysql.default.createConnection(process.env.DATABASE_URL!);
      await conn.execute(
        "INSERT INTO password_reset_tokens (userId, token, expiresAt) VALUES (?, ?, ?)",
        [user.id, token, expiresAt]
      );
      await conn.end();
      const resetUrl = `${getBaseUrl()}/reset-password?token=${token}`;
      await sendPasswordResetEmail(email, resetUrl);
      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Forgot password failed", error);
      res.status(500).json({ error: "Failed to send reset email" });
    }
  });

  // Reset password
  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
      res.status(400).json({ error: "Token and password required" });
      return;
    }
    try {
      const mysql = await import("mysql2/promise");
      const conn = await mysql.default.createConnection(process.env.DATABASE_URL!);
      const [rows] = await conn.execute(
        "SELECT * FROM password_reset_tokens WHERE token = ? AND usedAt IS NULL AND expiresAt > NOW()",
        [token]
      ) as any;
      if (!rows.length) {
        await conn.end();
        res.status(400).json({ error: "Invalid or expired reset token" });
        return;
      }
      const resetToken = rows[0];
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 12);
      await conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        [passwordHash, resetToken.userId]
      );
      await conn.execute(
        "UPDATE password_reset_tokens SET usedAt = NOW() WHERE id = ?",
        [resetToken.id]
      );
      await conn.end();
      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Reset password failed", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
}
