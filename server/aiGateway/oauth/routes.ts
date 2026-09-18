import type { Express, Request, Response } from "express";
import { sdk } from "../../_core/sdk";
import {
  AI_GATEWAY_SCOPES,
  aiGatewayIssuer,
  aiGatewayResource,
  authorizationEndpoint,
  protectedResourceMetadataUrl,
  revocationEndpoint,
  tokenEndpoint,
} from "./config";
import {
  normalizeRequestedScopes,
  resolveAiOAuthClient,
  validateAiOAuthClientSecret,
  validateAiOAuthRedirectUri,
  type ResolvedAiOAuthClient,
} from "./clientRegistry";
import {
  exchangeAiOAuthAuthorizationCode,
  issueAiOAuthAuthorizationCode,
  refreshAiOAuthTokens,
  revokeAiOAuthRefreshToken,
} from "./service";
import { AiOAuthError } from "./errors";

function singleQuery(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function oauthErrorResponse(res: Response, error: unknown): void {
  noStore(res);
  if (error instanceof AiOAuthError) {
    res.status(error.status).json({
      error: error.oauthCode,
      error_description: error.message,
    });
    return;
  }
  console.error("[ai-gateway] OAuth endpoint failed", error);
  res.status(500).json({
    error: "server_error",
    error_description: "SpyReels could not complete the OAuth request.",
  });
}

function appendRedirectParams(
  redirectUri: string,
  params: Record<string, string | undefined>
): string {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) target.searchParams.set(key, value);
  }
  return target.toString();
}

function encodeGoogleReturnState(returnTo: string): string {
  return Buffer.from(
    JSON.stringify({ v: 1, returnTo, firstReferrer: null }),
    "utf8"
  ).toString("base64");
}

function oauthLoginBridgeUrl(originalAuthorizeUrl: string): string {
  const encoded = Buffer.from(originalAuthorizeUrl, "utf8").toString("base64url");
  return `/ai/oauth/continue?request=${encodeURIComponent(encoded)}`;
}

function redirectToSpyReelsLogin(req: Request, res: Response): void {
  const authorizeUrl = req.originalUrl.startsWith("/")
    ? req.originalUrl
    : "/api/ai/oauth/authorize";
  const returnTo = oauthLoginBridgeUrl(authorizeUrl);
  const params = new URLSearchParams({
    state: encodeGoogleReturnState(returnTo),
  });
  res.redirect(302, `/api/auth/google?${params.toString()}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hidden(name: string, value: string | undefined): string {
  if (value === undefined) return "";
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;
}

function consentHtml(input: {
  clientName: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  scope: string;
  codeChallenge: string;
  resource?: string;
}): string {
  const scopes = new Set(input.scope.split(/\\s+/).filter(Boolean));
  const canCreate = scopes.has("spyreels:create");
  const accessCopy = canCreate
    ? `${escapeHtml(input.clientName)} is asking for access to research content and generate remake scripts using your SpyReels account.`
    : `${escapeHtml(input.clientName)} is asking for read-only access to your SpyReels account.`;
  const permissionTitle = canCreate
    ? "Creator research, transcription and remake generation"
    : "Creator research and account usage";
  const permissionCopy = canCreate
    ? "Research public creators, inspect and transcribe public Reels, read your SpyReels usage, and generate remake scripts. Generation can use your normal SpyReels plan allowance. SpyReels will not publish content or modify Instagram."
    : "Research public creators, view top-performing content, and read your current SpyReels usage.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect SpyReels</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:#09090b; color:#fafafa; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(520px,100%); padding:28px; border:1px solid #27272a; border-radius:18px; background:#111113; box-shadow:0 22px 80px rgba(0,0,0,.36); }
    .brand { margin-bottom:28px; font-weight:750; letter-spacing:-.02em; }
    h1 { margin:0 0 10px; font-size:26px; line-height:1.2; letter-spacing:-.03em; }
    p { margin:0; color:#a1a1aa; line-height:1.6; }
    .permission { margin:22px 0; padding:16px; border:1px solid #27272a; border-radius:12px; background:#0b0b0d; }
    .permission strong { display:block; margin-bottom:6px; }
    .actions { display:flex; gap:10px; margin-top:24px; }
    button { flex:1; padding:12px 14px; border:1px solid #3f3f46; border-radius:10px; font:inherit; font-weight:650; cursor:pointer; }
    .cancel { color:#e4e4e7; background:#18181b; }
    .approve { color:#fff; background:#7c3aed; border-color:#7c3aed; }
    .fine { margin-top:18px; color:#71717a; font-size:12px; }
  </style>
</head>
<body>
  <main>
    <div class="brand">SpyReels</div>
    <h1>Connect SpyReels to ${escapeHtml(input.clientName)}</h1>
    <p>${accessCopy}</p>
    <div class="permission">
      <strong>${permissionTitle}</strong>
      <p>${permissionCopy}</p>
    </div>
    <form method="post" action="/api/ai/oauth/authorize">
      ${hidden("response_type", "code")}
      ${hidden("client_id", input.clientId)}
      ${hidden("redirect_uri", input.redirectUri)}
      ${hidden("state", input.state)}
      ${hidden("scope", input.scope)}
      ${hidden("code_challenge", input.codeChallenge)}
      ${hidden("code_challenge_method", "S256")}
      ${hidden("resource", input.resource)}
      <div class="actions">
        <button class="cancel" name="decision" value="deny" type="submit">Cancel</button>
        <button class="approve" name="decision" value="approve" type="submit">Connect SpyReels</button>
      </div>
    </form>
    <div class="fine">This connection uses short-lived access tokens and can be revoked.</div>
  </main>
</body>
</html>`;
}

type ValidAuthorizationRequest = {
  client: ResolvedAiOAuthClient;
  clientId: string;
  redirectUri: string;
  state?: string;
  scopes: string[];
  codeChallenge: string;
  resource?: string;
};

async function validateAuthorizationRequest(
  raw: Record<string, unknown>
): Promise<ValidAuthorizationRequest> {
  const responseType = typeof raw.response_type === "string" ? raw.response_type : "";
  const clientId = typeof raw.client_id === "string" ? raw.client_id.trim() : "";
  const redirectUri = typeof raw.redirect_uri === "string" ? raw.redirect_uri.trim() : "";
  const state = typeof raw.state === "string" ? raw.state : undefined;
  const scope = typeof raw.scope === "string" ? raw.scope : undefined;
  const codeChallenge =
    typeof raw.code_challenge === "string" ? raw.code_challenge.trim() : "";
  const codeChallengeMethod =
    typeof raw.code_challenge_method === "string"
      ? raw.code_challenge_method.trim()
      : "";
  const resource = typeof raw.resource === "string" ? raw.resource.trim() : undefined;

  if (responseType !== "code") {
    throw new AiOAuthError("unsupported_response_type", "Only response_type=code is supported.");
  }
  if (!clientId || !redirectUri) {
    throw new AiOAuthError("invalid_request", "client_id and redirect_uri are required.");
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    throw new AiOAuthError("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    throw new AiOAuthError("invalid_request", "code_challenge is invalid.");
  }
  if (resource && resource !== aiGatewayResource()) {
    throw new AiOAuthError("invalid_request", "The requested OAuth resource is not supported.");
  }

  const client = await resolveAiOAuthClient(clientId);
  if (!client) {
    throw new AiOAuthError("invalid_request", "Unknown OAuth client.");
  }
  if (!validateAiOAuthRedirectUri(client, redirectUri)) {
    throw new AiOAuthError("invalid_request", "redirect_uri is not registered for this client.");
  }
  const scopes = normalizeRequestedScopes(client, scope);
  if (!scopes) {
    throw new AiOAuthError("invalid_scope", "One or more requested scopes are not allowed.");
  }

  return {
    client,
    clientId,
    redirectUri,
    state,
    scopes,
    codeChallenge,
    resource,
  };
}

function parseClientCredentials(req: Request): {
  clientId: string;
  clientSecret?: string;
} {
  const authorization = req.headers.authorization || "";
  if (/^Basic\s+/i.test(authorization)) {
    try {
      const encoded = authorization.replace(/^Basic\s+/i, "");
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator >= 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, separator)),
          clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
        };
      }
    } catch {
      // Fall through to body credentials.
    }
  }
  return {
    clientId: typeof req.body?.client_id === "string" ? req.body.client_id : "",
    clientSecret:
      typeof req.body?.client_secret === "string" ? req.body.client_secret : undefined,
  };
}

async function authenticateTokenClient(req: Request): Promise<ResolvedAiOAuthClient> {
  const credentials = parseClientCredentials(req);
  if (!credentials.clientId) {
    throw new AiOAuthError("invalid_client", "client_id is required.", 401);
  }
  const client = await resolveAiOAuthClient(credentials.clientId);
  if (!client || !validateAiOAuthClientSecret(client, credentials.clientSecret)) {
    throw new AiOAuthError("invalid_client", "OAuth client authentication failed.", 401);
  }
  return client;
}

export function registerAiOAuthRoutes(app: Express): void {
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: aiGatewayResource(),
      authorization_servers: [aiGatewayIssuer()],
      scopes_supported: [...AI_GATEWAY_SCOPES],
      bearer_methods_supported: ["header"],
      resource_documentation: `${aiGatewayIssuer()}/docs/ai-platform-architecture`,
    });
  });

  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: aiGatewayIssuer(),
      authorization_endpoint: authorizationEndpoint(),
      token_endpoint: tokenEndpoint(),
      revocation_endpoint: revocationEndpoint(),
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_post",
        "client_secret_basic",
      ],
      revocation_endpoint_auth_methods_supported: [
        "none",
        "client_secret_post",
        "client_secret_basic",
      ],
      scopes_supported: [...AI_GATEWAY_SCOPES],
      client_id_metadata_document_supported: true,
    });
  });

  // Existing Google login only allows non-/api returnTo destinations. This
  // same-origin bridge safely resumes the exact authorization request after login.
  app.get("/ai/oauth/continue", (req, res) => {
    const encoded = singleQuery(req, "request") || "";
    let target = "";
    try {
      target = Buffer.from(encoded, "base64url").toString("utf8");
    } catch {
      target = "";
    }
    if (
      !target.startsWith("/api/ai/oauth/authorize?") &&
      target !== "/api/ai/oauth/authorize"
    ) {
      res.status(400).send("Invalid SpyReels OAuth continuation.");
      return;
    }
    res.redirect(302, target);
  });

  app.get("/api/ai/oauth/authorize", async (req, res) => {
    try {
      const validated = await validateAuthorizationRequest({
        response_type: singleQuery(req, "response_type"),
        client_id: singleQuery(req, "client_id"),
        redirect_uri: singleQuery(req, "redirect_uri"),
        state: singleQuery(req, "state"),
        scope: singleQuery(req, "scope"),
        code_challenge: singleQuery(req, "code_challenge"),
        code_challenge_method: singleQuery(req, "code_challenge_method"),
        resource: singleQuery(req, "resource"),
      });

      try {
        await sdk.authenticateRequest(req);
      } catch {
        redirectToSpyReelsLogin(req, res);
        return;
      }

      noStore(res);
      res.type("html").send(
        consentHtml({
          clientName: validated.client.clientName,
          clientId: validated.clientId,
          redirectUri: validated.redirectUri,
          state: validated.state,
          scope: validated.scopes.join(" "),
          codeChallenge: validated.codeChallenge,
          resource: validated.resource,
        })
      );
    } catch (error) {
      oauthErrorResponse(res, error);
    }
  });

  app.post("/api/ai/oauth/authorize", async (req, res) => {
    try {
      const validated = await validateAuthorizationRequest(req.body ?? {});
      const user = await sdk.authenticateRequest(req);
      const decision = typeof req.body?.decision === "string" ? req.body.decision : "";

      if (decision !== "approve") {
        res.redirect(
          302,
          appendRedirectParams(validated.redirectUri, {
            error: "access_denied",
            error_description: "The user declined the SpyReels connection.",
            state: validated.state,
            iss: aiGatewayIssuer(),
          })
        );
        return;
      }

      const code = await issueAiOAuthAuthorizationCode({
        clientId: validated.clientId,
        userId: user.id,
        redirectUri: validated.redirectUri,
        scopes: validated.scopes,
        codeChallenge: validated.codeChallenge,
      });
      noStore(res);
      res.redirect(
        302,
        appendRedirectParams(validated.redirectUri, {
          code,
          state: validated.state,
          iss: aiGatewayIssuer(),
        })
      );
    } catch (error) {
      oauthErrorResponse(res, error);
    }
  });

  app.post("/api/ai/oauth/token", async (req, res) => {
    try {
      const client = await authenticateTokenClient(req);
      const grantType = typeof req.body?.grant_type === "string" ? req.body.grant_type : "";
      const resource = typeof req.body?.resource === "string" ? req.body.resource : undefined;
      if (resource && resource !== aiGatewayResource()) {
        throw new AiOAuthError("invalid_request", "The requested OAuth resource is not supported.");
      }

      let tokenSet;
      if (grantType === "authorization_code") {
        const code = typeof req.body?.code === "string" ? req.body.code : "";
        const redirectUri = typeof req.body?.redirect_uri === "string" ? req.body.redirect_uri : "";
        const codeVerifier = typeof req.body?.code_verifier === "string" ? req.body.code_verifier : "";
        if (!code || !redirectUri || !codeVerifier) {
          throw new AiOAuthError(
            "invalid_request",
            "code, redirect_uri, and code_verifier are required."
          );
        }
        if (!validateAiOAuthRedirectUri(client, redirectUri)) {
          throw new AiOAuthError(
            "invalid_grant",
            "redirect_uri does not match the client registration."
          );
        }
        tokenSet = await exchangeAiOAuthAuthorizationCode({
          code,
          clientId: client.clientId,
          redirectUri,
          codeVerifier,
          source: client.source,
        });
      } else if (grantType === "refresh_token") {
        const refreshToken =
          typeof req.body?.refresh_token === "string" ? req.body.refresh_token : "";
        if (!refreshToken) {
          throw new AiOAuthError("invalid_request", "refresh_token is required.");
        }
        tokenSet = await refreshAiOAuthTokens({
          refreshToken,
          clientId: client.clientId,
        });
      } else {
        throw new AiOAuthError(
          "unsupported_grant_type",
          "Only authorization_code and refresh_token grants are supported."
        );
      }

      noStore(res);
      res.json({
        access_token: tokenSet.accessToken,
        token_type: tokenSet.tokenType,
        expires_in: tokenSet.expiresIn,
        refresh_token: tokenSet.refreshToken,
        scope: tokenSet.scope,
      });
    } catch (error) {
      if (error instanceof AiOAuthError && error.oauthCode === "invalid_client") {
        res.setHeader("WWW-Authenticate", 'Basic realm="SpyReels OAuth"');
      }
      oauthErrorResponse(res, error);
    }
  });

  app.post("/api/ai/oauth/revoke", async (req, res) => {
    try {
      const client = await authenticateTokenClient(req);
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      if (token) {
        await revokeAiOAuthRefreshToken({ token, clientId: client.clientId });
      }
      noStore(res);
      res.status(200).send("");
    } catch (error) {
      oauthErrorResponse(res, error);
    }
  });

  app.locals.spyReelsAiProtectedResourceMetadataUrl = protectedResourceMetadataUrl();
}
