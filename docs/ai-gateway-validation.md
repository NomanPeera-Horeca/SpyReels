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
  -> PKCE S256 authorization-code exchange
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

## Release gate

Passing the isolated harness is necessary but not sufficient to enable `SPYREELS_AI_GATEWAY_ENABLED` in production.

Before enabling the gateway we still require:

1. `pnpm check`
2. the full `pnpm test` suite
3. `pnpm test:ai-gateway:e2e`
4. migration `drizzle/0096_ai_gateway_oauth.sql` applied to an isolated environment first
5. one smoke test using a real isolated OAuth client and non-production user
6. MCP and REST calls against that isolated deployment
7. confirmation that no production Stripe, Instagram, or PostHog side effects occurred during the isolated harness

GitHub-hosted CI is currently failing before step 1 because no runner is assigned. Until a real runner executes the commands above, the gateway remains a release candidate and the feature flag must remain off.
