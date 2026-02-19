# Changelog

## [0.2.0] - 2026-02-19

### Added

- **`accept_game` tool** — Accept a game assignment by game RID. Fetches the game detail page to discover the assignment RID and official ID, then POSTs the accept form to `games.asp`.
- **`decline_game` tool** — Decline a game assignment with an optional reason. Sends the decline response with a comment field (`R{assignmentRID}`) for the reason text.
- **`request_game` tool** — Request assignment to an open/unfilled game via RefTown's self-assign flow. Three-step process: parses the game detail page for the self-assign link (including security hash), loads the confirmation page, then submits the request.
- **Game detail page parser** (`src/parsers/game-detail.ts`) — Extracts official ID, assignment RID, and self-assign links from `games.asp?RID=X` pages.
- **11 new tests** — Game detail parser tests (5), HTTP contract tests for accept/decline/request (5), and schema validation for `requestGameSchema` (1). Test suite now has 56 tests total.

### Changed

- `accept_game` and `decline_game` are no longer stubs — they perform real POST requests to RefTown.
- Updated tool descriptions in MCP server registration to remove "(stub)" labels.
- `search_open_games` now listed in README tools table.

## [0.1.1] - 2026-02-09

### Fixed

- **Profile custom fields parser not finding table after heading** (`src/tools/profile.ts`)
  - **Bug:** `customFieldsHeading.next("table")` only checked the immediate next sibling element. If any intervening element existed between the "Custom Fields" heading and the custom fields table, the parser would silently return no custom fields.
  - **Fix:** Changed to `customFieldsHeading.nextAll("table").first()` which scans all subsequent siblings to find the first `<table>` element, making the parser resilient to RefTown inserting elements between the heading and table.

### Added

- **Integration test suite** (`src/integration-tests.ts`)
  - 45 tests across 4 layers:
    - Layer 1 (14 tests): HTTP contract validation - verifies correct URLs, headers, content types, redirect handling, and session expiry retry logic for all API integration points
    - Layer 2 (24 tests): HTML parser tests with representative fixtures covering game table, availability calendar, contacts (including email de-obfuscation), profile, calendar feeds, and login name extraction
    - Layer 3 (8 tests): Live integration tests against reftown.com (auto-skipped when credentials not set)
    - Layer 4 (4 tests): MCP server protocol tests - module imports, Zod schema validation, and stub tool responses
  - Run with: `npx tsx src/integration-tests.ts`
