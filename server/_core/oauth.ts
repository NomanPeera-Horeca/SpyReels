import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { notifyOwnerViaTelegram } from "../telegramBot";
import axios from "axios";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

const getBaseUrl = (): string => {
  const url = process.env.OAUTH_SERVER_URL || "https://spyreels.ai";
  return url.replace(/\/$/, "");
};

export function registerOAuthRoutes(app: Express) {
  app.get("/api/auth/google", (_req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${getBaseUrl()}/api/oauth/callback`;
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
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
        console.log(`[OAuth] New user signup: ${userName} (${userEmail})`);
      }
      const sessionToken = await sdk.createSessionToken(openId, {
        name: googleUser.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
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
    const { email, password, name } = req.body;
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
}
