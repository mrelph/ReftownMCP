# Changelog

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
