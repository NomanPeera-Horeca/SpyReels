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

Verified results:

- isolated `pnpm test:ai-gateway:e2e`: **PASS**, 2 tests passed
- real-socket OAuth -> token -> MCP -> REST network smoke: **PASS**, 1 test passed
- network-smoke Render build then reran the isolated E2E harness: **PASS**, 2 tests passed
- AI Gateway OpenAPI contract after isolating billing configuration: **PASS**, 2 tests passed
- focused Render release gate: **PASS**, 8 test files / 26 tests
- migration contract: **PASS**
- full Vitest suite before final release-prep scope change: **1426 passed, 1 skipped, 1 failed**
- the remaining full-suite failure is `shared/scriptDisplayTitle.test.ts`; both that test file and the implementation under test are identical to `main`, so it is a baseline repository failure outside the AI Gateway changes
- `pnpm check` reaches an existing TypeScript error in `client/src/pages/DevRemakeWorkspacePreview.tsx` where `RemakeWorkspaceTarget.source` is missing; the same source exists on `main`, so it is also a baseline issue outside this branch

The AI Gateway-specific failure found by the first full-suite run was `server/aiGateway/openapi.test.ts` eagerly loading Stripe configuration. That test isolation was fixed and independently rerun successfully.

## Production migration gate

The guarded production migration runner validated the real Railway production MySQL database after explicit approval.

Result:

```text
PRECHECK users=541 existingAiTables=0
migration applied twice successfully
PASS tables=3 indexes=9 foreignKeys=4 usersUnchanged=541
```

The migration is additive and idempotent. It created the three OAuth tables, verified all expected indexes and foreign keys, and left the production user count unchanged.

## Production real-persistence smoke

A separate guarded one-shot production smoke validated the real OAuth persistence tables without exposing a public test server.

Verified:

- temporary OAuth client persistence
- wrong PKCE verifier rejected without consuming the grant
- authorization-code exchange
- authorization codes stored only as hashes
- refresh tokens stored only as hashes
- MCP `get_usage` against real production persistence
- REST `get_usage` against real production persistence
- trusted `chatgpt` source attribution survives a conflicting request Origin
- exhausted-plan rejection occurs before Instagram/provider execution
- refresh-token rotation
- refresh-family reuse protection
- temporary client/user/token cleanup
- production user count remained 541 before and after

Final result:

```text
[ai-gateway-prod-smoke] PASS
```

## Production OAuth environment preparation

The real SpyReels Render service is now prepared with:

```text
SPYREELS_AI_OAUTH_JWT_SECRET=<dedicated high-entropy secret stored only in Render>
SPYREELS_AI_OAUTH_ISSUER=https://spyreels.ai
SPYREELS_AI_GATEWAY_ENABLED=false
```

The raw OAuth JWT secret is not stored in this repository and is separate from the browser-session `JWT_SECRET`.

The feature flag remains OFF. Preparing the production secret and issuer does not activate the gateway.

## Current release gate

The canonical OAuth, persistence, MCP, REST, migration, and production-environment preparation gates are complete.

Before enabling the gateway for even a private platform test we still require:

1. current branch CI/focused tests remain acceptable after final `offline_access` and documentation changes
2. PR #41 is reviewed and clean against current `main`
3. merge/deploy receives explicit approval
4. exact ChatGPT/Claude client/callback values are captured and registered if the platform requires pre-provisioning
5. first activation is private only
6. run one private ChatGPT connection/tool scan and verify attribution, usage, and refresh continuity
7. run one private Claude connection/tool scan and verify attribution, usage, and refresh continuity
8. only after both private tests pass consider broader publication

See `docs/ai-gateway-distribution.md` for the private platform test procedure.
