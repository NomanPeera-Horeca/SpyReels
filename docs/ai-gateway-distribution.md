# SpyReels AI Gateway distribution runbook

Status: **production credentials prepared, gateway still disabled**.

This runbook prepares private ChatGPT and Claude testing over the same SpyReels remote MCP endpoint without creating platform-specific business logic.

## Canonical production values

```text
MCP server:        https://spyreels.ai/api/ai/mcp
OAuth issuer:      https://spyreels.ai
Authorization:     https://spyreels.ai/api/ai/oauth/authorize
Token:             https://spyreels.ai/api/ai/oauth/token
Revocation:        https://spyreels.ai/api/ai/oauth/revoke
OAuth metadata:    https://spyreels.ai/.well-known/oauth-authorization-server
Resource metadata: https://spyreels.ai/.well-known/oauth-protected-resource
Scopes:            spyreels:read offline_access
```

`offline_access` exists only for refresh-token continuity. It grants no additional SpyReels tool or data permission. `spyreels:read` remains the V1 resource permission.

## Production environment status

The real SpyReels Render web service has been prepared with:

```text
SPYREELS_AI_OAUTH_JWT_SECRET=<dedicated high-entropy secret configured in Render>
SPYREELS_AI_OAUTH_ISSUER=https://spyreels.ai
SPYREELS_AI_GATEWAY_ENABLED=false
```

The OAuth JWT secret is deliberately not recorded in this repository and is separate from the browser-session `JWT_SECRET`.

The gateway remains OFF. Preparing the secret and issuer does not expose the OAuth, MCP, REST, or OpenAPI routes while the feature code remains unmerged and the flag remains false.

## Private ChatGPT test

OpenAI's current custom-app flow uses a remote MCP endpoint. The private test must remain a developer/custom-app test, not a public directory submission.

Prepared values:

```text
App name: SpyReels Private Test
MCP endpoint: https://spyreels.ai/api/ai/mcp
Authentication: OAuth
OAuth issuer: https://spyreels.ai
Resource: https://spyreels.ai/api/ai/mcp
Scopes: spyreels:read offline_access
```

Test sequence after explicit gateway activation approval:

1. In ChatGPT, enable the available Developer Mode/custom app flow for the test account or workspace.
2. Create a private custom app using `https://spyreels.ai/api/ai/mcp`.
3. Select OAuth authentication.
4. Let ChatGPT discover SpyReels protected-resource and authorization-server metadata.
5. If ChatGPT presents an exact callback URL, copy it verbatim. Never guess or normalize it.
6. If ChatGPT presents an HTTPS Client ID Metadata Document URL as `client_id`, use the existing CIMD support and do not seed a database client.
7. If ChatGPT instead requires a fixed client ID and callback, pre-provision that exact client in `ai_oauth_clients` with source `chatgpt` and exact redirect matching.
8. Complete the SpyReels consent screen with a dedicated private test account.
9. Run the ChatGPT tool scan.
10. Confirm only these V1 tools are visible: `find_creator`, `find_top_content`, `get_usage`.
11. Call `get_usage` first, then one controlled `find_creator`, then one controlled `find_top_content`.
12. Verify source attribution is `chatgpt`, usage accounting is correct, and reconnect/refresh works without a second login.

OpenAI requires refresh-token continuity for durable OAuth app connections, which is why SpyReels advertises `offline_access` and already rotates refresh tokens.

## Private Claude test

Claude custom connectors accept a publicly reachable remote MCP URL. Claude currently allows optional OAuth Client ID and OAuth Client Secret values under Advanced settings.

Prepared values:

```text
Connector name: SpyReels Private Test
Remote MCP URL: https://spyreels.ai/api/ai/mcp
Authentication: OAuth
OAuth issuer: https://spyreels.ai
Scopes: spyreels:read offline_access
```

Test sequence after explicit gateway activation approval:

1. In Claude, open Customize > Connectors. For Team/Enterprise, an Owner adds the connector first from organization connector settings.
2. Add a custom remote MCP connector using `https://spyreels.ai/api/ai/mcp`.
3. Start with OAuth discovery and no invented credentials.
4. If Claude requires Advanced settings with a fixed OAuth Client ID/Secret, capture the exact values Claude expects before creating a SpyReels client record.
5. Register Claude's exact callback URL verbatim if a pre-provisioned client is required.
6. For a confidential Claude client, store only the SHA-256 hash of the client secret in `ai_oauth_clients.clientSecretHash`. Never commit or log the raw secret.
7. Connect using the dedicated private SpyReels test account.
8. Confirm Claude discovers only `find_creator`, `find_top_content`, and `get_usage`.
9. Call `get_usage` first, then one controlled creator lookup and one controlled top-content lookup.
10. Verify source attribution is `claude`, usage accounting is correct, and reconnect/refresh works.

Claude remote connectors run from Anthropic cloud infrastructure, so the production MCP endpoint must remain publicly reachable over HTTPS during the private test.

## Database-client template

Use this only after a platform supplies its exact client ID and redirect URI. Never paste a real client secret into source control.

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

## Private-test release gate

Before turning the feature flag on even for a private test:

1. PR #41 is reviewed and clean against current `main`.
2. Current AI Gateway focused tests are green after the `offline_access` change.
3. Production migration and production persistence smoke remain green.
4. `SPYREELS_AI_OAUTH_JWT_SECRET` and `SPYREELS_AI_OAUTH_ISSUER` remain configured on the real SpyReels web service.
5. Any platform callback/client values are registered exactly, if required.
6. Merge/deploy and `SPYREELS_AI_GATEWAY_ENABLED=true` happen only after explicit activation approval.
7. First activation is private only. Do not publish to an app/connector directory.
8. Run ChatGPT first, then Claude, so failures are isolated by platform.
9. After each platform test, verify attribution, usage accounting, token refresh, and server logs before continuing.
10. If either platform fails OAuth or tool discovery, turn the gateway flag back OFF before debugging broadly.

## Safety

- V1 tools remain read-only except normal SpyReels usage accounting.
- No browser session cookie is an external API credential.
- No Stripe, provider, database, or browser-session secret belongs in platform configuration.
- Authorization codes and refresh tokens are hashed at rest.
- Refresh tokens rotate on use and refresh-family reuse is revoked.
- Platform callback URLs are never guessed.
- The production gateway remains disabled until explicit activation approval.
