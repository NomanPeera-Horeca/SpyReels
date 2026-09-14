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

function redirectToSpyReelsLogin(req: Request, res: Response): void {
  const returnTo = req.originalUrl.startsWith("/") ? req.originalUrl : "/";
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
  const scopeLabel = input.scope.includes("spyreels:read")
    ? "Research creators, view top-performing content, and read your SpyReels usage."
    : "Access your SpyReels account.";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect SpyReels</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #09090b; color: #fafafa; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
    .card { width: min(520px, 100%); border: 1px solid #27272a; background: #111113; border-radius: 18px; padding: 28px; box-shadow: 0 22px 80px rgba(0,0,0,.36); }
    .brand { font-weight: 700; letter-spacing: -.02em; margin-bottom: 28px; }
    h1 { font-size: 26px; line-height: 1.2; margin: 0 0 10px; letter-spacing: -.03em; }
    p { color: #a1a1aa; line-height: 1.6; margin: 0; }
    .permission { margin: 22px 0; padding: 16px; border: 1px solid #27272a; border-radius: 12px; background: #0b0b0d; }
    .permission strong { display: block; margin-bottom: 6px; }
    .actions { display: flex; gap: 10px; margin-top: 24px; }
    button { flex: 1; border-radius: 10px; border: 1px solid #3f3f46; padding: 12px 14px; font: inherit; font-weight: 650; cursor: pointer; }
    .approve { color: white; background: #7c3aed; border-color: #7c3aed; }
    .cancel { color: #e4e4e7; background: #18181b; }
    .fine { margin-top: 18px; font-size: 12px; color: #71717a; }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">SpyReels</div>
    <h1>Connect SpyReels to ${escapeHtml(input.clientName)}</h1>
    <p>${escapeHtml(input.clientName)} is asking for permission to use your SpyReels account.</p>
    <div class="permission">
      <strong>Read-only SpyReels access</strong>
      <p>${escapeHtml(scopeLabel)}</p>
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
    <div class="fine">You can disconnect later by revoking the connection in the AI client.</div>
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
  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
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
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: [...AI_GATEWAY_SCOPES],
      client_id_metadata_document_supported: true,
    });
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
          throw new AiOAuthError("invalid_grant", "redirect_uri does not match the client registration.");
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

  // Keep the URL centralized for Bearer challenges used by the MCP route.
  app.locals.spyReelsAiProtectedResourceMetadataUrl = protectedResourceMetadataUrl();
}
