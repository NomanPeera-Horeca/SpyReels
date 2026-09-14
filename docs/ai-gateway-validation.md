# SpyReels AI Gateway validation harness

The isolated harness lives at `server/aiGateway/e2eHarness.test.ts`.

Run it with:

```bash
pnpm test:ai-gateway:e2e
```

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

Because GitHub Actions is currently failing before assigning a runner, the release candidate is also validated on isolated Render services with auto-deploy disabled and the AI Gateway production feature flag off.

Verified results:

- isolated `pnpm test:ai-gateway:e2e`: **PASS**, 2 tests passed
- AI Gateway OpenAPI contract after isolating billing configuration: **PASS**, 2 tests passed
- full Vitest suite on the feature branch: **1426 passed, 1 skipped, 1 failed**
- the remaining full-suite failure is `shared/scriptDisplayTitle.test.ts`; the implementation under test is byte-for-byte identical to `main`, so it is a baseline repository failure outside the AI Gateway changes
- `pnpm check` reaches an existing TypeScript error in `client/src/pages/DevRemakeWorkspacePreview.tsx` where `RemakeWorkspaceTarget.source` is missing; the same source exists on `main`, so it is also a baseline issue outside this branch

The AI Gateway-specific failure found by the first full-suite run was `server/aiGateway/openapi.test.ts` eagerly loading Stripe configuration. That test isolation was fixed and independently rerun successfully.

## Release gate

Passing the isolated harness is necessary but not sufficient to enable `SPYREELS_AI_GATEWAY_ENABLED` in production.

Before enabling the gateway we still require:

1. keep AI Gateway-focused tests green on an independent runner
2. validate migration `drizzle/0096_ai_gateway_oauth.sql` in an isolated MySQL-compatible environment before any production schema change
3. run one deployed smoke test using an isolated OAuth client and non-production user
4. call both MCP and REST against that isolated deployment
5. confirm no production Stripe, Instagram, user, or PostHog side effects occurred
6. review platform-specific distribution metadata/adapters only after the canonical transport path is proven

Do not merge, deploy to the real SpyReels service, or enable the production gateway flag until those remaining gates are complete.
