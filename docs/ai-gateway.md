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

External AI hosts connect to the user's existing SpyReels account. SpyReels remains the source of truth for:

- identity
- subscription plan
- entitlements
- usage limits
- billing
- saved research and content

The same account must work across SpyReels web, ChatGPT, Claude, Copilot, API clients, and future hosts.

Do not create a separate subscription per AI host.

## V1 universal tool contract

First checkpoint exposes only the smallest high-confidence surface:

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

## Authentication target

The remote integration must use a standards-based OAuth flow rather than reusing SpyReels browser session cookies.

Target capabilities:

- OAuth 2.1-style authorization code flow
- PKCE
- refresh tokens
- explicit scopes
- per-user connection and revocation
- protected-resource metadata (`/.well-known/oauth-protected-resource`)
- authorization-server metadata
- static OAuth clients first
- dynamic client registration only after the provider is stable and tested

No external host receives Stripe identifiers, session-cookie secrets, provider API keys, or internal database credentials.

## Attribution and observability

Every gateway execution carries:

- request id
- AI source
- optional client name
- tool name
- success/failure
- stable external error code
- duration

Server analytics should allow product reporting by source such as ChatGPT, Claude, Copilot, Gemini, Perplexity, Cursor, API, and future clients.

## Rollout rules

1. Develop only on `feature/spyreels-ai-gateway-v1` until approved.
2. Keep the first tools read-only except for normal SpyReels usage accounting.
3. No public MCP or REST route until auth and CI are green.
4. Put any new transport behind a server-side feature flag.
5. Do not deploy or merge without explicit approval.
6. Reuse existing SpyReels services and entitlements instead of creating parallel logic.
7. Add platform adapters only after the canonical gateway works independently of any one AI host.

## Definition of done for the foundation

The foundation is ready for the auth/transport milestone when:

- gateway types and registry compile cleanly
- registry tests pass
- `find_creator`, `find_top_content`, and `get_usage` use existing SpyReels sources of truth
- source attribution is captured
- no production route is exposed
- full repository CI is green
