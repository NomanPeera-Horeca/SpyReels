# SpyReels AI Gateway

## Product goal

Make SpyReels available as a content-intelligence engine to ChatGPT, Claude, Microsoft Copilot, Gemini, Perplexity, Cursor, enterprise agents, and future AI hosts without duplicating business logic per platform.

The product principle is **build once, distribute everywhere**.

## Architecture boundary

```text
Instagram / TikTok / YouTube providers
              |
        SpyReels Core
              |
      SpyReels AI Gateway
              |
   +----------+-----------+
   |                      |
 Remote MCP          REST / OpenAPI
   |                      |
ChatGPT, Claude,       partners and
Copilot, future MCP    non-MCP hosts
```

The AI Gateway is the canonical business boundary. MCP and REST/OpenAPI are transports only. Platform-specific adapters must not reimplement creator lookup, ranking, transcription, generation, billing, usage, or entitlement rules.

## Account and billing source of truth

External AI hosts connect to the user's existing SpyReels account. SpyReels remains the source of truth for identity, subscription plan, entitlements, usage limits, billing, saved research, and content.

Do not create a separate subscription per AI host.

## V1 universal tool contract

The first read-only tool surface is intentionally small:

- `find_creator`
- `find_top_content`
- `get_usage`

Planned later tools, after the foundation is proven:

- `analyze_content`
- `transcribe_content`
- `create_hooks`
- `create_script`
- `save_research`

Do not mirror every existing SpyReels UI action as a tool. The external surface should stay small, composable, and stable.

## Remote MCP transport

The gateway targets the finalized MCP `2026-07-28` protocol and also accepts the established legacy protocol versions during the migration window.

The modern transport is stateless. SpyReels does not require sticky MCP sessions. Modern requests validate:

- `MCP-Protocol-Version`
- `Mcp-Method`
- `Mcp-Name` for named calls such as `tools/call`
- JSON-RPC method/header agreement

Supported transport methods in this checkpoint:

- `server/discover`
- `tools/list`
- `tools/call`
- `ping`
- legacy `initialize`

The MCP endpoint is:

```text
https://spyreels.ai/api/ai/mcp
```

All MCP calls require a SpyReels OAuth bearer token with `spyreels:read`.

## REST / OpenAPI transport

The same canonical tool executor is also available through a small REST surface for non-MCP hosts and partner integrations. This transport does not contain separate business logic.

Endpoints:

```text
GET  https://spyreels.ai/api/ai/openapi.json
GET  https://spyreels.ai/api/ai/v1/tools
POST https://spyreels.ai/api/ai/v1/tools/find_creator
POST https://spyreels.ai/api/ai/v1/tools/find_top_content
POST https://spyreels.ai/api/ai/v1/tools/get_usage
```

The OpenAPI document is public discovery metadata. Tool listing and tool execution require a SpyReels OAuth bearer token with `spyreels:read`.

REST responses preserve the gateway's stable execution envelope, request id, source attribution, and external error codes. MCP and REST both call `executeSpyReelsAiTool(...)`, so plan limits and business behavior stay identical across hosts.

## OAuth authorization server

External AI clients must never reuse the SpyReels browser session cookie as an API credential.

The AI Gateway implements an OAuth authorization-code flow with:

- PKCE S256 required
- one-time authorization codes
- five-minute authorization-code lifetime
- one-hour signed access tokens
- database-backed refresh tokens
- refresh-token rotation
- refresh-family revocation when token reuse is detected
- exact redirect URI matching
- dedicated access-token signing secret
- explicit `spyreels:read` scope
- RFC 9728 protected-resource metadata
- authorization-server metadata
- RFC 9207-style `iss` parameter on authorization responses

OAuth endpoints:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-authorization-server
/api/ai/oauth/authorize
/api/ai/oauth/token
/api/ai/oauth/revoke
```

### Client registration strategy

SpyReels supports two client identities:

1. **Pre-provisioned database clients** for known platform integrations and confidential clients.
2. **Client ID Metadata Documents (CIMD)** for modern MCP clients whose `client_id` is an HTTPS metadata URL.

CIMD is the preferred modern MCP discovery model. Dynamic Client Registration is not advertised in this checkpoint.

CIMD fetching is restricted to public HTTPS hosts, rejects local/private-address hosts, rejects redirects, and does not trust arbitrary client metadata for SpyReels source attribution. Known platform attribution is derived only from trusted client hostnames. Unknown clients remain `unknown`.

## OAuth persistence

Migration `drizzle/0096_ai_gateway_oauth.sql` creates:

- `ai_oauth_clients`
- `ai_oauth_authorization_codes`
- `ai_oauth_refresh_tokens`

Raw authorization codes and refresh tokens are never stored. Only SHA-256 hashes are persisted.

## Feature flag and environment

The transport is registered only when:

```text
SPYREELS_AI_GATEWAY_ENABLED=true
```

The default is off. Merging the code without enabling the flag does not expose OAuth, MCP, REST, or OpenAPI endpoints.

Required before enabling:

```text
SPYREELS_AI_GATEWAY_ENABLED=true
SPYREELS_AI_OAUTH_JWT_SECRET=<dedicated random secret, at least 32 characters>
SPYREELS_AI_OAUTH_ISSUER=https://spyreels.ai
```

`SPYREELS_AI_OAUTH_JWT_SECRET` must be separate from the existing browser-session `JWT_SECRET`.

## Browser login handoff

If a user starts an OAuth connection without an active SpyReels browser session, the authorization endpoint sends them through the existing Google login. A same-origin `/ai/oauth/continue` bridge restores the exact authorization request afterward, because the existing Google callback intentionally refuses generic `/api/*` return destinations.

The final consent screen is still served by SpyReels and requires an explicit **Connect SpyReels** action.

## CSRF boundary

Browser-session endpoints keep first-party CSRF origin protection, including the OAuth consent POST.

The following external protocol endpoints are exempt from cookie CSRF checks because they authenticate with OAuth/client credentials rather than a browser session:

- `/api/ai/oauth/token`
- `/api/ai/oauth/revoke`
- `/api/ai/mcp`
- `/api/ai/v1/*`

## Attribution and observability

Every gateway execution carries:

- request id
- AI source
- optional client identity
- tool name
- success/failure
- stable external error code
- duration

Server analytics can report product activity by ChatGPT, Claude, Copilot, Gemini, Perplexity, Cursor, API, and unknown/future clients.

## Rollout rules

1. Develop only on `feature/spyreels-ai-gateway-v1` until approved.
2. Keep the first tools read-only except for normal SpyReels usage accounting.
3. Keep `SPYREELS_AI_GATEWAY_ENABLED` off until schema migration and validation are complete.
4. Do not deploy or merge without explicit approval.
5. Reuse existing SpyReels services and entitlements instead of parallel business logic.
6. Add platform-specific distribution metadata only after the canonical OAuth + MCP + REST/OpenAPI paths validate independently.
7. Never put browser cookie secrets, Stripe identifiers, provider API keys, or database credentials into AI-host credentials.

## Current validation status

The implementation is still a release candidate, not production-enabled. GitHub-hosted CI has recently failed before executing any steps because no runner was assigned (`runner_id: 0`, empty runner name, zero steps). Treat that as infrastructure failure, not as a passing or failing code result.

Before enabling the flag, we still require a real typecheck/test run plus an end-to-end OAuth + MCP + REST smoke test against an isolated environment.

## Distribution sequence after transport validation

Once the isolated smoke test passes, distribution work should happen as thin adapters over the same gateway rather than new platform-specific backends:

1. ChatGPT / OpenAI connector metadata against Remote MCP.
2. Claude remote MCP connection instructions/metadata.
3. Microsoft Copilot connector or agent metadata, using MCP when supported and REST/OpenAPI otherwise.
4. Gemini / Google agent integration, using the same OAuth account connection and REST/OpenAPI contract when MCP is not the preferred transport.
5. Perplexity and other hosts through MCP or REST depending on their supported connector model.

No adapter may bypass SpyReels OAuth, plan limits, usage accounting, source attribution, or the canonical tool registry.
