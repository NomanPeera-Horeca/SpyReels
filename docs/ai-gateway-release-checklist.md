# SpyReels AI Gateway private platform release checklist

Status: **prepared, not activated**.

## Production configuration already prepared

- `SPYREELS_AI_OAUTH_JWT_SECRET` exists on the real SpyReels Render service and is separate from `JWT_SECRET`.
- `SPYREELS_AI_OAUTH_ISSUER=https://spyreels.ai`.
- `SPYREELS_AI_GATEWAY_ENABLED=false`.
- OAuth persistence tables are live in production MySQL.
- Production migration and real-persistence smoke have passed.

## Activation order

1. Confirm the current branch CI result and classify any failure against `main`.
2. Review and merge PR #41 only after explicit approval.
3. Deploy the merged `main` build with the gateway flag still OFF.
4. Verify normal SpyReels production health before changing the flag.
5. Capture platform-specific callback/client identity from ChatGPT during private app setup if required.
6. Register that exact client/callback in `ai_oauth_clients` only when needed.
7. Set `SPYREELS_AI_GATEWAY_ENABLED=true` only after explicit activation approval.
8. Run the ChatGPT private connection first.
9. Verify tool discovery, OAuth refresh continuity, source attribution, usage accounting, and logs.
10. Run the Claude private connection second.
11. Verify the same controls for Claude.
12. Keep both integrations private until both pass.

## ChatGPT private test values

```text
Name: SpyReels Private Test
MCP URL: https://spyreels.ai/api/ai/mcp
OAuth issuer: https://spyreels.ai
Resource: https://spyreels.ai/api/ai/mcp
Scopes: spyreels:read offline_access
```

Expected tools:

- `find_creator`
- `find_top_content`
- `get_usage`

Test calls in order:

1. `get_usage`
2. `find_creator` for one controlled public handle
3. `find_top_content` for the same handle with a small limit
4. reconnect/refresh check without re-authenticating

Expected attribution: `chatgpt`.

## Claude private test values

```text
Name: SpyReels Private Test
Remote MCP URL: https://spyreels.ai/api/ai/mcp
OAuth issuer: https://spyreels.ai
Scopes: spyreels:read offline_access
```

Expected tools:

- `find_creator`
- `find_top_content`
- `get_usage`

Test calls in order:

1. `get_usage`
2. `find_creator` for one controlled public handle
3. `find_top_content` for the same handle with a small limit
4. reconnect/refresh check

Expected attribution: `claude`.

## Rollback trigger

Immediately set `SPYREELS_AI_GATEWAY_ENABLED=false` if any private platform test shows:

- unexpected tool exposure
- OAuth callback mismatch that cannot be explained by exact platform configuration
- source attribution mismatch
- incorrect usage accounting
- provider calls occurring after an entitlement rejection
- refresh-token rotation/reuse failure
- elevated server error rate on ordinary SpyReels traffic

Do not publish a directory listing until both private tests pass.
