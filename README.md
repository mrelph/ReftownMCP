# RefTown MCP Server

An MCP (Model Context Protocol) server that lets Claude interact with your [RefTown.com](https://reftown.com) referee account. View game schedules, check availability, look up contacts, and manage your profile through natural language.

## Prerequisites

- Node.js 18+
- A RefTown.com account
- Claude Desktop (or any MCP-compatible client)

## Installation

```bash
git clone <repo-url>
cd ReftownMCP
npm install
```

## Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REFTOWN_USERNAME` | Yes | — | Your RefTown username or email |
| `REFTOWN_PASSWORD` | Yes | — | Your RefTown password |
| `REFTOWN_BASE_URL` | No | `https://reftown.com` | Override the base URL |
| `REFTOWN_DELAY_MS` | No | `2000` | Delay between requests (ms). Respects robots.txt crawl-delay. |

## Claude Desktop Setup

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "reftown": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/path/to/ReftownMCP",
      "env": {
        "REFTOWN_USERNAME": "your_username",
        "REFTOWN_PASSWORD": "your_password"
      }
    }
  }
}
```

Or if you prefer to use the `.env` file, omit the `env` block and ensure the `.env` file exists in the project directory.

## Available Tools

### Read-Only

| Tool | Description |
|------|-------------|
| `login` | Log in to RefTown. Other tools auto-login if needed. |
| `get_schedule` | Fetch game assignments. Optional `period`: upcoming, past, all. |
| `get_game_details` | Get details for a specific game by RID. |
| `get_availability` | View availability calendar for a month/year. |
| `get_contacts` | Fetch crew/official contacts. Optional client-side name filter. |
| `get_profile` | View your official profile, zones, organizations, custom fields. |
| `get_calendar_feed_url` | Get iCal subscription URLs (games+events, games only, events only). |
| `search_open_games` | Search for open/unfilled games. Filter by zone, date range, or sport. |

### Write Operations

| Tool | Description |
|------|-------------|
| `accept_game` | Accept a game assignment. Requires `gameId` (the game RID). |
| `decline_game` | Decline a game assignment. Requires `gameId`, optional `reason`. |
| `request_game` | Request assignment to an open game. Requires `gameId`, optional `duty` (position number). |

### Stubs (Not Yet Implemented)

| Tool | Why |
|------|-----|
| `set_availability` | Requires `jx_editavail.asp` AJAX endpoint (form fields unknown). |

## Development

```bash
# Run the MCP server directly
npm start

# Run with file watching
npm run dev

# Type-check
npx tsc --noEmit

# Build to dist/
npm run build
```

### Discovery Script

The `src/discover.ts` script logs into RefTown, fetches key pages, and saves both raw HTML and structural summaries to the `discovery/` directory. Use this to map new endpoints:

```bash
export $(cat .env | xargs) && npx tsx src/discover.ts
```

## How It Works

RefTown is a classic ASP web application with no public API. This server scrapes the HTML pages using [Cheerio](https://cheerio.js.org/) and manages session cookies via [tough-cookie](https://github.com/salesforce/tough-cookie). Requests are rate-limited (default 2s) to respect the site's robots.txt crawl-delay of 120s.

Key architectural details:
- **Session management**: Cookie-based auth with automatic re-login on session expiry (detected via inline login forms and redirects).
- **Retry limits**: Auth retries are capped at 2 to prevent infinite loops.
- **Request timeout**: 30s per request via `AbortSignal.timeout`.
- **Error handling**: All tool handlers catch errors and return MCP-formatted error responses.

## Known Limitations

- **set_availability stub**: Setting availability is still a stub pending `jx_editavail.asp` AJAX endpoint discovery.
- **Profile sub-pages**: Email, phone, and address require fetching separate profile sub-pages (`?Focus=ContactEmail`, etc.) which aren't implemented yet.
- **Email obfuscation**: Contact emails are reconstructed from RefTown's JavaScript obfuscation (`sb_domain`/`sb_user` variables). If RefTown changes this pattern, email extraction will break.
- **Self-assign hash**: The request_game tool requires a session-specific hash from the game detail page. If RefTown changes their hash generation, the request flow may break.
