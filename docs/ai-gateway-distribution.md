# SpyReels AI Gateway distribution runbook

Status: **prepared, not enabled**.

This runbook prepares ChatGPT and Claude distribution over the same SpyReels remote MCP endpoint without creating a second business layer.

## Canonical production values

```text
MCP server:       https://spyreels.ai/api/ai/mcp
OAuth issuer:     https://spyreels.ai
Authorization:    https://spyreels.ai/api/ai/oauth/authorize
Token:            https://spyreels.ai/api/ai/oauth/token
Revocation:       https://spyreels.ai/api/ai/oauth/revoke
OAuth metadata:   https://spyreels.ai/.well-known/oauth-authorization-server
Resource metadata:https://spyreels.ai/.well-known/oauth-protected-resource
Scope:            spyreels:read offline_access
```

`offline_access` is refresh-token continuity only. It does not add a SpyReels tool or data permission. `spyreels:read` remains the V1 resource permission.

## Rollout invariant

Keep this value OFF until the merge and activation steps are explicitly approved:

```text
SPYREELS_AI_GATEWAY_ENABLED=false
```

Do not publish a platform connector while the flag is off. Platform configuration may be drafted, but connection/tool scans will not succeed until the gateway is intentionally enabled on the real SpyReels web service.

## ChatGPT / OpenAI custom app

OpenAI's current custom-app flow uses a remote MCP endpoint. In ChatGPT Developer Mode, create a custom app and provide the SpyReels MCP endpoint above. Select OAuth authentication and let ChatGPT discover the SpyReels OAuth metadata.

Prepared values:

```text
Name: SpyReels
MCP endpoint: https://spyreels.ai/api/ai/mcp
Authentication: OAuth
Requested resource permission: spyreels:read
Refresh continuity scope: offline_access
```

Do not invent or hard-code a ChatGPT callback URL. During the actual ChatGPT setup, use the callback/client identity values supplied by ChatGPT exactly.

Preferred client-registration order:

1. If ChatGPT presents an HTTPS Client ID Metadata Document URL, use the existing SpyReels CIMD path. No database client seed is required.
2. If ChatGPT supplies a fixed client ID/callback instead, pre-provision that exact client in `ai_oauth_clients` with source `chatgpt` and exact redirect URI matching.
3. Do not accept source attribution from request headers or Origin. Attribution must come from the trusted OAuth client identity.

Before publishing beyond a private test, verify the tool scan exposes only the V1 read-only tools:

- `find_creator`
- `find_top_content`
- `get_usage`

## Claude custom connector

Claude custom connectors accept a public remote MCP server URL. For individual plans the connector is added from Customize > Connectors; Team/Enterprise owners add it for the organization first. Claude also supports optional OAuth Client ID and OAuth Client Secret fields in Advanced settings.

Prepared values:

```text
Name: SpyReels
Remote MCP URL: https://spyreels.ai/api/ai/mcp
Authentication: OAuth
Scope: spyreels:read offline_access
```

For Claude, prefer a pre-provisioned client once Claude's exact OAuth redirect URI and client settings are known. If Claude provides a confidential client secret, store only its SHA-256 hash in `ai_oauth_clients.clientSecretHash`; never commit the raw secret.

Do not guess Anthropic callback URLs. Exact redirect URI matching is enforced by SpyReels, so capture the platform-provided value during connector setup and register it verbatim.

## Database-client template

Use this only after the platform has supplied its exact client ID and redirect URI. Never paste a real client secret into source control.

```sql
INSERT INTO ai_oauth_clients
  (clientId, clientSecretHash, clientName, source, redirectUris, allowedScopes, isPublic, isActive)
VALUES
  ('<PLATFORM_CLIENT_ID>', <NULL_OR_SHA256_SECRET>, '<PLATFORM_NAME>', '<chatgpt|claude>',
   JSON_ARRAY('<EXACT_PLATFORM_REDIRECT_URI>'),
   JSON_ARRAY('spyreels:read', 'offline_access'),
   <1_FOR_PUBLIC_OR_0_FOR_CONFIDENTIAL>, 1)
ON DUPLICATE KEY UPDATE
  clientName = VALUES(clientName),
  source = VALUES(source),
  redirectUris = VALUES(redirectUris),
  allowedScopes = VALUES(allowedScopes),
  isPublic = VALUES(isPublic),
  isActive = VALUES(isActive);
```

## Activation checklist

Before turning the feature flag on:

1. PR #41 is reviewed and mergeable against current `main`.
2. Dedicated `SPYREELS_AI_OAUTH_JWT_SECRET` is configured on the real SpyReels web service and is separate from the browser-session `JWT_SECRET`.
3. `SPYREELS_AI_OAUTH_ISSUER=https://spyreels.ai` is configured.
4. Production OAuth migration and production persistence smoke remain green.
5. ChatGPT/Claude platform callback/client values are registered exactly, if a database client is required.
6. Run one private ChatGPT tool scan and one private Claude connector connection before broader publication.
7. Verify PostHog/source attribution and usage limits using real platform calls.
8. Only then consider broader app/directory submission.

## Safety

- Keep tools read-only in V1 except normal SpyReels usage accounting.
- No browser session cookie is an external API credential.
- No Stripe, provider, database, or browser-session secrets belong in platform connector configuration.
- Refresh tokens remain hashed at rest and rotate on use.
- The gateway stays disabled until explicit activation approval.
