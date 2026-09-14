# SpyReels AI Gateway validation harness

The isolated harness lives at `server/aiGateway/e2eHarness.test.ts`.

Run it with:

```bash
pnpm test:ai-gateway:e2e
```

A second smoke test at `server/aiGateway/networkSmoke.test.ts` binds the same isolated Express gateway to a real TCP socket and drives OAuth, MCP, and REST with native HTTP requests. That catches network/header/redirect behavior that an in-process request harness can miss.

## What it proves

The harness exercises the actual Express OAuth, MCP, REST/OpenAPI gateway routes and the canonical AI tool executor without touching production data, production OAuth clients, Stripe, Instagram, or PostHog.

The primary scenario validates this sequence:

```text
Connect SpyReels
  -> OAuth authorization request
  -> explicit user approval
  -> reject an incorrect PKCE verifier
  -> exchange the still-valid code with the correct verifier
  -> signed SpyReels access token
  -> authenticated MCP tools/call
  -> authenticated REST tool call
  -> existing SpyReels plan-limit enforcement
  -> AI-source attribution event
```

It also verifies:

- an incorrect PKCE verifier is rejected before the authorization code is consumed
- raw authorization codes are not persisted in the harness store
- raw refresh tokens are not persisted in the harness store
- the modern MCP protocol headers are honored
- MCP and REST use the same canonical tool executor
- a successful `find_top_content` call reserves existing SpyReels search usage
- a plan-limit rejection returns `USAGE_LIMIT_REACHED` and does not consume another search
- source attribution remains tied to the trusted OAuth client identity rather than the request Origin header
- MCP and REST reject requests that do not carry a valid SpyReels bearer token
- OAuth authorization, token exchange, MCP, and REST also work through a real loopback TCP socket

## Isolation boundary

The harness intentionally replaces external and persistent dependencies with deterministic in-memory fakes:

- OAuth authorization-code / refresh-token persistence
- SpyReels browser-session identity
- OAuth client registration lookup
- Instagram creator/reel provider calls
- Stripe plan/usage reads and counters
- PostHog network delivery

The following production code remains real in the harness:

- OAuth authorization and token HTTP routes
- PKCE validation
- access-token signing and verification
- bearer authentication
- MCP transport validation and dispatch
- REST transport validation and dispatch
- AI Gateway registry and error mapping
- `find_top_content` plan-limit behavior
- `get_usage` account response shaping
- gateway attribution call path

This split is deliberate. It gives us a repeatable protocol-level release gate while preventing a test from charging Stripe, consuming ScrapeCreators credits, modifying a real user, or emitting production analytics.

## Independent runner results

Because GitHub Actions had recently failed before assigning a runner, the release candidate was also validated on isolated Render services with auto-deploy disabled and the AI Gateway production feature flag off.

Verified results:

- isolated `pnpm test:ai-gateway:e2e`: **PASS**, 2 tests passed
- real-socket OAuth -> token -> MCP -> REST network smoke: **PASS**, 1 test passed
- network-smoke Render build then reran the isolated E2E harness: **PASS**, 2 tests passed
- AI Gateway OpenAPI contract after isolating billing configuration: **PASS**, 2 tests passed
- AI Gateway focused Render release gate: **PASS**, 8 test files / 26 tests
- migration contract: **PASS**, verifies additive/idempotent schema and expected indexes/FKs
- full Vitest suite on the feature branch: **1426 passed, 1 skipped, 1 failed**
- the remaining full-suite failure is `shared/scriptDisplayTitle.test.ts`; both that test file and the implementation under test are identical to `main`, so it is a baseline repository failure outside the AI Gateway changes
- `pnpm check` reaches an existing TypeScript error in `client/src/pages/DevRemakeWorkspacePreview.tsx` where `RemakeWorkspaceTarget.source` is missing; the same source exists on `main`, so it is also a baseline issue outside this branch

The AI Gateway-specific failure found by the first full-suite run was `server/aiGateway/openapi.test.ts` eagerly loading Stripe configuration. That test isolation was fixed and independently rerun successfully.

## Production migration evidence

The migration was then intentionally validated against the current production MySQL schema because the available staging schema was materially behind production.

Railway one-shot migration gate result:

```text
[ai-gateway-prod-db-gate] PRECHECK db='railway' users=541 existingAiTables=3
[ai-gateway-prod-db-gate] migration applied twice successfully (idempotence PASS)
[ai-gateway-prod-db-gate] PASS tables=3 indexes=9 foreignKeys=4 usersUnchanged=541
```

The production gate verifies:

- the target host matches the explicitly configured production MySQL host token
- an explicit production confirmation variable is present
- the `users` table exists before migration
- a MySQL advisory lock prevents concurrent gate execution
- migration `0096_ai_gateway_oauth.sql` can be applied twice safely
- all three OAuth tables exist
- all nine expected indexes exist
- all four expected foreign keys exist
- the production user count is unchanged

## Production persistence smoke evidence

After the schema gate passed, a separate one-shot Railway service ran `scripts/ai-gateway-production-persistence-smoke.ts` against the real OAuth persistence tables.

It used a temporary `isTestAccount=1` user and a temporary OAuth client, bound the test gateway to loopback only, disabled production PostHog credentials, prevented Stripe network usage, deliberately forced plan-limit rejection before any Instagram/provider call, and removed all temporary rows afterward.

Railway result: **SUCCESS**.

Runtime evidence:

```text
[ai-gateway-prod-smoke] PRECHECK db='railway' users=541
[ai-gateway-prod-smoke] oauth_client PASS
[ai-gateway-prod-smoke] pkce_wrong_verifier PASS
[ai-gateway-prod-smoke] token_exchange PASS
[ai-gateway-prod-smoke] refresh_persistence PASS
[ai-gateway-prod-smoke] mcp_get_usage PASS
[ai-gateway-prod-smoke] rest_get_usage PASS source=chatgpt
[ai-gateway-prod-smoke] plan_limit PASS no_provider_call
[ai-gateway-prod-smoke] refresh_rotation PASS
[ai-gateway-prod-smoke] cleanup PASS testRows=0 usersBefore=541 usersAfter=541
[ai-gateway-prod-smoke] PASS
```

This proves with real production persistence:

- OAuth client persistence works
- PKCE failure does not burn a valid authorization code
- authorization-code exchange consumes the code exactly once
- raw authorization codes are not persisted
- raw refresh tokens are not persisted
- refresh tokens persist, rotate, and revoke correctly
- MCP and REST both authenticate against the same real OAuth data
- `get_usage` reads real plan/usage persistence
- trusted source attribution remains `chatgpt` even when a request Origin attempts to imply another source
- plan-limit enforcement prevents the expensive provider path from running
- cleanup removes the temporary OAuth/client/user/usage records
- the production user count remains unchanged at 541

## Distribution compatibility

Release-prep added the standard `offline_access` OAuth scope for refresh-token continuity. It grants no additional SpyReels tool permission; `spyreels:read` remains the resource permission. ChatGPT/Claude distribution instructions are documented in `docs/ai-gateway-distribution.md`.

The one-shot Railway migration and production-smoke services have watch patterns that do not match normal repository changes, so feature-branch commits no longer rerun production gates automatically.

## Release gate status

The canonical transport, schema, real OAuth persistence, plan enforcement, source attribution, refresh rotation, and cleanup gates are complete.

Remaining before enabling `SPYREELS_AI_GATEWAY_ENABLED` on the real SpyReels web service:

1. keep the AI Gateway feature branch reviewable against current `main`
2. run the final focused tests after any release-prep compatibility changes
3. configure a dedicated production `SPYREELS_AI_OAUTH_JWT_SECRET` separate from the browser-session `JWT_SECRET`
4. configure `SPYREELS_AI_OAUTH_ISSUER=https://spyreels.ai`
5. capture exact ChatGPT/Claude client identity and redirect/callback values during each platform's private connector setup when required
6. perform one private ChatGPT connection/tool scan and one private Claude connector connection after intentional gateway activation
7. verify real platform attribution and usage accounting before broader publication

Do not merge PR #41 or enable the production gateway flag without explicit approval.
