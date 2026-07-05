# ReftownMCP

MCP server (stdio transport) that exposes a RefTown.com referee account to Claude. RefTown is a classic ASP site with no public API — this server scrapes HTML with Cheerio and manages session cookies with tough-cookie.

## Commands

```bash
npm start                       # run server (tsx src/server.ts)
npm run dev                     # run with file watching
npm run build                   # tsc → dist/
npm test                        # integration tests (tsx src/integration-tests.ts)
npx tsc --noEmit                # type-check only
npx tsx src/test-tools.ts       # live smoke test: spawns server via MCP client, calls read-only tools
export $(cat .env | xargs) && npx tsx src/discover.ts   # fetch RefTown pages → discovery/ (for mapping new endpoints)
```

Requires `REFTOWN_USERNAME` and `REFTOWN_PASSWORD` env vars (see `.env.example`); `loadConfig()` throws without them. Optional: `REFTOWN_BASE_URL`, `REFTOWN_DELAY_MS` (default 2000).

## Architecture

- `src/server.ts` — entry point. Creates `McpServer` + `StdioServerTransport`, registers every tool via `server.registerTool(name, { description, inputSchema: zodSchema.shape }, handler)`. Handlers wrap tool functions in try/catch and return `errorResult()` on failure.
- `src/tools/*.ts` — one file per tool group (schedule, availability, contacts, profile, calendar, open-games, login). Each exports the tool function plus its Zod schema.
- `src/parsers/` — shared HTML parsers (`game-table.ts`, `game-detail.ts`).
- `src/client.ts` — `RefTownClient`: rate-limited GET/POST, 30s timeout (`AbortSignal.timeout`), detects session expiry (301/302 to login) and re-authenticates, capped at `MAX_AUTH_RETRIES = 2`.
- `src/auth.ts` — `AuthManager`: cookie jar, form POST to `login.asp`.
- `src/config.ts` — env-var config loading.
- `src/integration-tests.ts` — hand-rolled test harness (no framework), 4 layers: HTTP contract (mocked fetch), HTML parser fixtures, live tests (auto-skipped without credentials), MCP protocol tests.

## Conventions

- ESM (`"type": "module"`, TS `module: Node16`): local imports use `.js` extensions even though sources are `.ts`.
- Strict TypeScript. Tool results are `JSON.stringify(result, null, 2)` in a text content block.
- When adding a tool: implement in `src/tools/`, export a Zod schema, register in `server.ts`, add tests to `integration-tests.ts`, update README tool tables and CHANGELOG.

## Gotchas

- **Live account, real writes**: `accept_game`, `decline_game`, `request_game` POST to a real RefTown account. `npm test` Layer 3 hits reftown.com when credentials are set.
- **Rate limiting is deliberate**: default 2s delay between requests (site robots.txt asks crawl-delay 120s). Don't remove it.
- **`.mcp.json` is gitignored on purpose** — it contains real credentials locally. Never commit it or copy its contents into tracked files.
- **`set_availability` is a stub** — pending discovery of the `jx_editavail.asp` AJAX endpoint.
- **Fragile scraping points**: contact emails are reconstructed from RefTown's JS obfuscation (`sb_domain`/`sb_user`); `request_game` depends on a session-specific self-assign hash from the game detail page. Site markup changes break parsers — use `src/discover.ts` output to re-map.
- `start-mcp.sh` does not load `.env`; env vars must come from the caller (e.g. the MCP client config).
