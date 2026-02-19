/**
 * Integration tests for ReftownMCP API contract validation.
 *
 * Layer 1: HTTP contract tests (mock fetch, verify URLs/headers/payloads)
 * Layer 2: HTML parser tests (representative HTML fixtures → structured data)
 * Layer 3: Live integration tests (requires REFTOWN_USERNAME/PASSWORD env vars)
 * Layer 4: MCP server protocol tests (server startup + tool listing)
 */

import { AuthManager } from "./auth.js";
import { RefTownClient } from "./client.js";
import { Config } from "./config.js";
import { parseGameTable } from "./parsers/game-table.js";
import { parseGameDetailPage } from "./parsers/game-detail.js";
import { getAvailabilityTool } from "./tools/availability.js";
import { getContactsTool } from "./tools/contacts.js";
import { getProfileTool } from "./tools/profile.js";
import { getCalendarFeedUrlTool } from "./tools/calendar.js";
import { searchOpenGamesTool, requestGameTool } from "./tools/open-games.js";
import { getScheduleTool, acceptGameTool, declineGameTool } from "./tools/schedule.js";
import { loginTool } from "./tools/login.js";
import * as cheerio from "cheerio";

// ─── Test Framework ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: { name: string; error: string }[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    const msg = error instanceof Error ? error.message : String(error);
    failures.push({ name, error: msg });
    console.log(`  ✗ ${name}`);
    console.log(`    ${msg}`);
  }
}

function section(name: string): void {
  console.log(`\n═══ ${name} ═══`);
}

// ─── Fetch Interceptor for HTTP Contract Tests ────────────────────────────────

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  redirectMode?: string;
}

const capturedRequests: CapturedRequest[] = [];
const originalFetch = globalThis.fetch;

function mockFetch(responses: Map<string, { status: number; headers?: Record<string, string>; body: string }>): void {
  capturedRequests.length = 0;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) {
        headers[k] = v;
      }
    }
    capturedRequests.push({
      url,
      method,
      headers,
      body: init?.body?.toString(),
      redirectMode: init?.redirect,
    });

    // Match by URL prefix
    for (const [pattern, resp] of responses) {
      if (url.includes(pattern)) {
        const respHeaders = new Headers(resp.headers ?? {});
        return new Response(resp.body, {
          status: resp.status,
          headers: respHeaders,
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  };
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

// ─── HTML Fixtures ────────────────────────────────────────────────────────────

const GAME_TABLE_HTML = `
<html><body>
<table class="subtable floatheader">
  <tr><th>Org</th><th>Date</th><th>Sport</th><th>Location</th><th>Crew</th><th>Comments</th></tr>
  <tr class="game">
    <td><B>CHOA</B> <a href="games.asp?RID=98765">G-12345</a></td>
    <td>Sun<br>2/15/2026<br>1:00 PM</td>
    <td>Ice Hockey<br>Bantam AA<br>Regular Season<br>U15</td>
    <td><table><tr><td>@: <B>Centennial Arena</B></td></tr><tr><td>H: Home Hawks</td></tr><tr><td>V: Visitor Eagles</td></tr></table></td>
    <td><table class="subtablec"><tr>Referee Crew</tr><tr class="note"><td></td><td>Referee:</td><td><span class="ongame">John Doe</span></td><td></td></tr><tr class="note"><td></td><td>Lineprsn 1:</td><td>Jane Smith</td><td></td></tr></table><div class="gameacc">Accepted</div></td>
    <td><div class="gamecom">Bring black jersey</div><table><tr><td class="right">15.2 km</td></tr></table></td>
  </tr>
  <tr class="game">
    <td><B>CMHA</B> <a href="games.asp?RID=11111">G-99999</a></td>
    <td>Sat<br>2/22/2026<br>3:30 PM</td>
    <td>Ice Hockey<br>Midget AAA<br>Playoff<br>U18</td>
    <td><table><tr><td>@: <B>Olympic Oval</B></td></tr><tr><td>H: Flames</td></tr><tr><td>V: Oilers</td></tr></table></td>
    <td><table class="subtablec"><tr>Officials</tr><tr class="note"><td></td><td>Referee:</td><td>Bob Wilson</td><td></td></tr></table></td>
    <td></td>
  </tr>
</table>
</body></html>`;

const AVAILABILITY_HTML = `
<html><body>
<a href="availability.asp?OffRID=42&month=2&year=2026">Link</a>
<table class="subtable availcal">
  <tr>
    <td class="availcal">
      <div class="availcal_date">1</div>
      <table class="availdetails">
        <tr style="background:#EEFFEE"><td>Available</td></tr>
        <tr><td>From</td><td>8:00 AM</td></tr>
        <tr><td>To</td><td>10:00 PM</td></tr>
      </table>
    </td>
    <td class="availcaltoday">
      <div class="availcal_date">2</div>
      <div class="working"><a href="games.asp?RID=555">Game</a></div>
    </td>
    <td class="availcal">
      <div class="availcal_date">3</div>
    </td>
  </tr>
</table>
</body></html>`;

const CONTACTS_HTML = `
<html><body>
<table class="subtable floatheader">
  <tr><th>vCard</th><th>Name</th><th>Address</th><th>Contact</th></tr>
  <tr>
    <td><a href="vcard.asp?OID=100">vCard</a></td>
    <td><B>Referee</B> <a href="roster.asp?OID=100">Alice Johnson</a></td>
    <td></td>
    <td>
      <a href="tel://555-1234">555-1234</a>
      <script>var sb_domain = 'example.com'; var sb_user = 'alice';</script>
    </td>
  </tr>
  <tr>
    <td><a href="vcard.asp?OID=200">vCard</a></td>
    <td><B>Linesman</B> <a href="roster.asp?OID=200">Bob Smith</a></td>
    <td></td>
    <td>
      <script>var sb_domain = 'gmail.com'; var sb_user = 'bobsmith';</script>
    </td>
  </tr>
</table>
</body></html>`;

const PROFILE_HTML = `
<html><body>
<div class="head1md">Preferences for Test User</div>
<a href="availability.asp?OffRID=42">Availability</a>
<B>Registration Status</B><BR>Registered
<li class="indentp20">Zone A - Calgary</li>
<li class="indentp20">Zone B - Edmonton</li>
<table class="subtable accountlinktable">
  <tr class="aclink"><td></td><td>Calgary Hockey Association</td><td></td><td>Test User</td><td>Official</td></tr>
  <tr class="aclink"><td></td><td>Edmonton Minor Hockey</td><td></td><td>Test User</td><td>Official</td></tr>
</table>
<div class="head1wrap">Other Information/Custom Fields</div>
<table><tr><td>
  <li><B>Shirt Size:</B> Large</li>
  <li><B>Car:</B> <img src="_icons/c.gif" alt="yes"></li>
</td></tr></table>
</body></html>`;

const CALENDAR_FEED_HTML = `
<html><body>
<div id="TabsX-1-0">
  <a href="webcal://reftown.com/vsend.asp?PAK=abc123&scope=all">Subscribe</a>
  <a href="https://reftown.com/vsend.asp?PAK=abc123&scope=all">HTTPS</a>
</div>
<div id="TabsX-1-2">
  <a href="webcal://reftown.com/vsend.asp?PAK=abc123&scope=games">Games Only</a>
  <a href="https://reftown.com/vsend.asp?PAK=abc123&scope=games">HTTPS</a>
</div>
<div id="TabsX-1-4">
  <a href="webcal://reftown.com/vsend.asp?PAK=abc123&scope=events">Events Only</a>
  <a href="https://reftown.com/vsend.asp?PAK=abc123&scope=events">HTTPS</a>
</div>
</body></html>`;

const LOGIN_SUCCESS_HTML = `
<html><body>
<ul class="dropdown redgrad"><li><a>Test User <img src="arrow.gif"></a></li></ul>
<table class="subtable accountlinktable">
  <tr class="aclink"><td></td><td>CHOA</td><td></td><td>Test User</td></tr>
</table>
</body></html>`;

// Game detail page with accept/decline form (user assigned, pending acceptance)
const GAME_DETAIL_ACCEPT_HTML = `
<html><body>
<form name="games" action="games.asp" method="POST" onsubmit="return verifyGamesForm(1,10,0,0,0)">
<input type="HIDDEN" name="Official" value="681">
<input type="HIDDEN" name="Accept" value="1">
<input type="HIDDEN" name="NoMenu" value="0">
<input type="HIDDEN" name="MapEn" value="0">
<input type="HIDDEN" name="NumGames" value="25">
<input type="HIDDEN" name="xAction" value="">
<table border="1" class="subtable floatheader">
<thead><tr class="subtablehead"><th>Game#<br>Status</th><th>Date<br>Time</th><th>League</th><th>Location</th><th>Officials</th><th>Comments</th></tr></thead>
<tbody>
<tr class="game">
  <td>49811</td>
  <td>Sat<br>11/2/2024<br>3:30 PM</td>
  <td>USA<br>REC</td>
  <td><table><tr><td>@: <B>Sno-King Ice Arena</B></td></tr><tr><td>H: Hawks</td></tr><tr><td>V: Eagles</td></tr></table></td>
  <td>
    <table class="subtablec">
      <tr>Single</tr>
      <tr class="note"><td></td><td>Referee 1:</td><td><span class="ongame">Test User</span></td><td>
        <a href="finance.asp?Focus=FIA&RID=272767"></a>
      </td></tr>
    </table>
    <div class="gameacc">Pending</div>
  </td>
  <td></td>
</tr>
</tbody>
</table>
<input type="HIDDEN" name="hRID" value="49811">
</form>
</body></html>`;

// Game detail page with self-assign (request) links for open positions
const GAME_DETAIL_OPEN_HTML = `
<html><body>
<form name="games" action="games.asp" method="POST">
<input type="HIDDEN" name="Official" value="681">
<input type="HIDDEN" name="Accept" value="1">
<input type="HIDDEN" name="NoMenu" value="0">
<input type="HIDDEN" name="MapEn" value="0">
<input type="HIDDEN" name="NumGames" value="25">
<input type="HIDDEN" name="xAction" value="">
<table border="1" class="subtable floatheader">
<thead><tr class="subtablehead"><th>Game#</th><th>Date<br>Time</th><th>League</th><th>Location</th><th>Officials</th><th>Comments</th></tr></thead>
<tbody>
<tr class="game">
  <td>59382</td>
  <td>Sat<br>2/21/2026<br>2:55 PM</td>
  <td>USA<br>Select</td>
  <td><table><tr><td>@: <B>Kraken Iceplex</B></td></tr><tr><td>H:</td></tr><tr><td>V:</td></tr></table></td>
  <td>
    <table class="subtablec">
      <tr>3 Officials</tr>
      <tr class="note"><td></td><td>Lineprsn 1:</td><td>Assigned</td><td></td></tr>
      <tr class="note"><td></td><td>Lineprsn 2:</td><td>Assigned</td><td></td></tr>
      <tr class="note"><td></td><td>Referee 1:</td><td>Unassigned : <a href="games_selfassign.asp?RID=59382&amp;ogact=TKO&amp;Duty=1&amp;NoMenu=1&amp;hash=abc123def456">Request</a></td><td></td></tr>
    </table>
  </td>
  <td>PNAHA League game</td>
</tr>
</tbody>
</table>
<input type="HIDDEN" name="hRID" value="59382">
</form>
</body></html>`;

// Self-assign confirmation page
const SELFASSIGN_CONFIRM_HTML = `
<html><body>
<div class="head1md">Self-Assignment Confirmation</div>
<table>
<tbody>
<tr><th>Game No.</th><th>Date Time</th><th>Officials</th></tr>
<tr><td>59382</td><td>Sat 2/21/2026 2:55 PM</td>
<td><table><tr><td>Referee 1:</td><td>Unassigned</td><td><input type="radio" name="SelDuty_59382" value="1" checked> Request</td></tr></table></td>
</tr>
</tbody>
</table>
<div>Do you wish to continue?<p><input type="submit" name="ConfirmLinkSet" value="Continue"></p></div>
</body></html>`;

// Self-assign success response
const SELFASSIGN_SUCCESS_HTML = `
<html><body>
<div class="head1md">Self-Assignment Confirmation</div>
<div>Your request has been submitted.</div>
</body></html>`;

// Accept success response (redirects back to game list)
const ACCEPT_SUCCESS_HTML = `
<html><body>
<table class="subtable floatheader">
<tr class="subtablehead"><th>Game#</th></tr>
</table>
<div>No games found matching selected criteria</div>
</body></html>`;

// ─── Shared Test Config ───────────────────────────────────────────────────────

const testConfig: Config = {
  username: "testuser",
  password: "testpass",
  baseUrl: "https://reftown.com",
  requestDelayMs: 0, // No delay for tests
};

// ─── Layer 1: HTTP Contract Tests ─────────────────────────────────────────────

async function httpContractTests(): Promise<void> {
  section("Layer 1: HTTP Contract Tests");

  // --- Auth Login Contract ---
  await test("Auth: GET login.asp picks up cookies before POST", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", {
      status: 200,
      headers: { "Set-Cookie": "ASPSESSIONID=abc123; path=/" },
      body: '<html><body>Welcome</body></html>',
    });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    await auth.login();

    assert(capturedRequests.length >= 2, `Expected >=2 requests, got ${capturedRequests.length}`);
    assert(capturedRequests[0].url === "https://reftown.com/login.asp", `First request should GET login.asp, got ${capturedRequests[0].url}`);
    assert(capturedRequests[0].method === "GET", `First request should be GET, got ${capturedRequests[0].method}`);
    restoreFetch();
  });

  await test("Auth: POST login.asp sends form-encoded credentials", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", {
      status: 200,
      body: '<html><body>Welcome</body></html>',
    });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    await auth.login();

    const postReq = capturedRequests.find(r => r.method === "POST");
    assert(!!postReq, "Should have made a POST request");
    assert(postReq!.url === "https://reftown.com/login.asp", `POST URL should be login.asp, got ${postReq!.url}`);
    assert(postReq!.headers["Content-Type"] === "application/x-www-form-urlencoded", `Content-Type should be form-urlencoded, got ${postReq!.headers["Content-Type"]}`);
    assert(postReq!.body?.includes("Username=testuser"), `Body should contain Username, got ${postReq!.body}`);
    assert(postReq!.body?.includes("Password=testpass"), `Body should contain Password`);
    assert(postReq!.body?.includes("Submit=Login"), `Body should contain Submit=Login`);
    restoreFetch();
  });

  await test("Auth: POST login.asp includes User-Agent header", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: '<html><body>Welcome</body></html>' });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    await auth.login();

    const postReq = capturedRequests.find(r => r.method === "POST");
    assert(!!postReq, "Should have made a POST request");
    assert(postReq!.headers["User-Agent"]?.includes("Mozilla"), `Should include browser User-Agent, got ${postReq!.headers["User-Agent"]}`);
    restoreFetch();
  });

  await test("Auth: Login follows 302 redirect to non-login page", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    // GET login.asp
    responses.set("login.asp", {
      status: 302,
      headers: { Location: "/default.asp" },
      body: "",
    });
    // GET default.asp
    responses.set("default.asp", {
      status: 200,
      body: "<html><body>Dashboard</body></html>",
    });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const result = await auth.login();

    // Should succeed (redirects to default.asp = success)
    assert(result.success === true, `Login should succeed on redirect to default.asp, got success=${result.success}, message=${result.message}`);
    restoreFetch();
  });

  // --- Client GET Contract ---
  await test("Client: GET requests include correct headers", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("mygames.asp", { status: 200, body: "<html><body>Games</body></html>" });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await client.get("mygames.asp");

    const gameReq = capturedRequests.find(r => r.url.includes("mygames.asp"));
    assert(!!gameReq, "Should have fetched mygames.asp");
    assert(gameReq!.headers["User-Agent"]?.includes("Chrome"), "Should include Chrome User-Agent");
    assert(gameReq!.headers["Accept"]?.includes("text/html"), "Should accept text/html");
    assert(gameReq!.redirectMode === "manual", "Should use manual redirect handling");
    restoreFetch();
  });

  await test("Client: GET builds URL with query params correctly", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("games.asp", { status: 200, body: "<html><body>Games</body></html>" });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await client.get("games.asp", { openonly: "1", Zone: "5" });

    const gameReq = capturedRequests.find(r => r.url.includes("games.asp") && r.url.includes("openonly"));
    assert(!!gameReq, "Should have fetched games.asp with params");
    assert(gameReq!.url.includes("openonly=1"), `URL should include openonly=1, got ${gameReq!.url}`);
    assert(gameReq!.url.includes("Zone=5"), `URL should include Zone=5, got ${gameReq!.url}`);
    restoreFetch();
  });

  await test("Client: POST sends form-encoded body", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("somepage.asp", { status: 200, body: "<html><body>OK</body></html>" });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await client.post("somepage.asp", { field1: "value1", field2: "value2" });

    const postReq = capturedRequests.find(r => r.url.includes("somepage.asp") && r.method === "POST");
    assert(!!postReq, "Should have POSTed to somepage.asp");
    assert(postReq!.headers["Content-Type"] === "application/x-www-form-urlencoded", "Should use form-urlencoded");
    assert(postReq!.body?.includes("field1=value1"), "Body should include field1");
    assert(postReq!.body?.includes("field2=value2"), "Body should include field2");
    restoreFetch();
  });

  await test("Client: Session expiry triggers re-auth on login redirect", async () => {
    let callCount = 0;
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });

    // First call to mygames.asp returns redirect to login, second returns OK
    mockFetch(responses);
    const origMock = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("mygames.asp")) {
        callCount++;
        if (callCount === 1) {
          return new Response("", {
            status: 302,
            headers: { Location: "/login.asp" },
          });
        }
        return new Response("<html><body>Games Page</body></html>", { status: 200 });
      }
      return origMock(input, init);
    };

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    const $ = await client.get("mygames.asp");
    const bodyText = $("body").text();

    assert(bodyText.includes("Games Page"), "Should have retried and gotten the real page");
    assert(callCount === 2, `Should have called mygames.asp twice (retry), got ${callCount}`);
    restoreFetch();
  });

  // --- Endpoint URL Contract ---
  await test("Schedule tool fetches mygames.asp", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("mygames.asp", { status: 200, body: GAME_TABLE_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await getScheduleTool(client, {});

    const req = capturedRequests.find(r => r.url.includes("mygames.asp"));
    assert(!!req, "Should fetch mygames.asp");
    restoreFetch();
  });

  await test("Open games tool fetches games.asp with openonly=1", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("games.asp", { status: 200, body: GAME_TABLE_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await searchOpenGamesTool(client, { zone: "3", dateQualifier: "Next 7 Days" });

    const req = capturedRequests.find(r => r.url.includes("games.asp") && r.url.includes("openonly=1"));
    assert(!!req, "Should fetch games.asp?openonly=1");
    assert(req!.url.includes("Zone=3"), "Should include Zone param");
    assert(req!.url.includes("DateQual=Next+7+Days") || req!.url.includes("DateQual=Next%207%20Days"), `Should include DateQual param, got ${req!.url}`);
    assert(req!.url.includes("AltSort="), "Should include AltSort param");
    restoreFetch();
  });

  await test("Availability tool fetches availability.asp with month/year", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("availability.asp", { status: 200, body: AVAILABILITY_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await getAvailabilityTool(client, { month: 3, year: 2026 });

    const req = capturedRequests.find(r => r.url.includes("availability.asp"));
    assert(!!req, "Should fetch availability.asp");
    assert(req!.url.includes("month=3"), `Should include month param, got ${req!.url}`);
    assert(req!.url.includes("year=2026"), `Should include year param, got ${req!.url}`);
    restoreFetch();
  });

  await test("Contacts tool fetches contacts.asp", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("contacts.asp", { status: 200, body: CONTACTS_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await getContactsTool(client, {});

    const req = capturedRequests.find(r => r.url.includes("contacts.asp"));
    assert(!!req, "Should fetch contacts.asp");
    restoreFetch();
  });

  await test("Profile tool fetches profile.asp", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: PROFILE_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await getProfileTool(client);

    const req = capturedRequests.find(r => r.url.includes("profile.asp") && !r.url.includes("Focus"));
    assert(!!req, "Should fetch profile.asp (without Focus param)");
    restoreFetch();
  });

  await test("Calendar feed tool fetches profile.asp?Focus=ShowPAK", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: CALENDAR_FEED_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await getCalendarFeedUrlTool(client);

    const req = capturedRequests.find(r => r.url.includes("profile.asp") && r.url.includes("Focus=ShowPAK"));
    assert(!!req, "Should fetch profile.asp?Focus=ShowPAK");
    restoreFetch();
  });

  // --- Accept Game Contract ---
  await test("Accept game: GETs game detail page then POSTs accept form", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    // GET games.asp?RID=49811 returns detail with finance link
    responses.set("games.asp", { status: 200, body: GAME_DETAIL_ACCEPT_HTML });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await acceptGameTool(client, { gameId: "49811" });

    // Should GET game page first
    const getReq = capturedRequests.find(r => r.url.includes("games.asp") && r.url.includes("RID=49811") && r.method === "GET");
    assert(!!getReq, "Should GET games.asp?RID=49811");

    // Should POST accept form
    const postReq = capturedRequests.find(r => r.url.includes("games.asp") && r.method === "POST");
    assert(!!postReq, "Should POST to games.asp");
    assert(postReq!.body?.includes("272767=Y"), `POST body should include assignment RID=Y, got ${postReq!.body}`);
    assert(postReq!.body?.includes("Accept=1"), "POST body should include Accept=1");
    assert(postReq!.body?.includes("Official=681"), "POST body should include Official=681");
    assert(postReq!.body?.includes("hRID=49811"), "POST body should include hRID=49811");
    restoreFetch();
  });

  // --- Decline Game Contract ---
  await test("Decline game: POSTs decline with reason", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    responses.set("games.asp", { status: 200, body: GAME_DETAIL_ACCEPT_HTML });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    await declineGameTool(client, { gameId: "49811", reason: "Schedule conflict" });

    const postReq = capturedRequests.find(r => r.url.includes("games.asp") && r.method === "POST");
    assert(!!postReq, "Should POST to games.asp");
    assert(postReq!.body?.includes("272767=N"), `POST body should include assignment RID=N, got ${postReq!.body}`);
    assert(postReq!.body?.includes("R272767=Schedule+conflict") || postReq!.body?.includes("R272767=Schedule%20conflict"),
      `POST body should include reason in R{RID} field, got ${postReq!.body}`);
    restoreFetch();
  });

  // --- Request Game Contract ---
  await test("Request game: GETs detail, then selfassign confirmation, then submits", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    responses.set("games.asp", { status: 200, body: GAME_DETAIL_OPEN_HTML });
    responses.set("games_selfassign.asp", { status: 200, body: SELFASSIGN_CONFIRM_HTML });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    const result = await requestGameTool(client, { gameId: "59382" });

    // Should GET game detail page first
    const detailReq = capturedRequests.find(r => r.url.includes("games.asp") && r.url.includes("RID=59382"));
    assert(!!detailReq, "Should GET games.asp?RID=59382");

    // Should GET selfassign confirmation page (with hash)
    const confirmReq = capturedRequests.find(r => r.url.includes("games_selfassign.asp") && r.url.includes("hash="));
    assert(!!confirmReq, "Should GET games_selfassign.asp with hash");

    // Should GET selfassign submission (with OGAct=1 and ConfirmLinkSet)
    const submitReq = capturedRequests.find(r => r.url.includes("games_selfassign.asp") && r.url.includes("OGAct=1"));
    assert(!!submitReq, "Should GET games_selfassign.asp with OGAct=1");
    assert(submitReq!.url.includes("ConfirmLinkSet=Continue"), `Should include ConfirmLinkSet, got ${submitReq!.url}`);
    assert(submitReq!.url.includes("SelDuty_59382=1"), `Should include SelDuty_59382=1, got ${submitReq!.url}`);

    assert(result.success === true, `Request should succeed, got: ${result.message}`);
    restoreFetch();
  });

  await test("Accept game: fails gracefully when user not assigned", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    // Open game page has no finance link (user not assigned)
    responses.set("games.asp", { status: 200, body: GAME_DETAIL_OPEN_HTML });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    const result = await acceptGameTool(client, { gameId: "59382" });

    assert(result.success === false, "Should fail when user not assigned");
    assert(result.message.includes("No assignment"), `Message should mention no assignment, got: ${result.message}`);
    restoreFetch();
  });

  await test("Request game: fails gracefully when no open positions", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    // Accept page has no selfassign links (all filled or not self-assignable)
    responses.set("games.asp", { status: 200, body: GAME_DETAIL_ACCEPT_HTML });
    mockFetch(responses);

    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);
    const result = await requestGameTool(client, { gameId: "49811" });

    assert(result.success === false, "Should fail when no open positions");
    assert(result.message.includes("No open positions"), `Message should mention no open positions, got: ${result.message}`);
    restoreFetch();
  });
}

// ─── Layer 2: HTML Parser Tests ───────────────────────────────────────────────

async function htmlParserTests(): Promise<void> {
  section("Layer 2: HTML Parser Tests");

  // --- Game Table Parser ---
  await test("Game table: parses game IDs from RID links", () => {
    const $ = cheerio.load(GAME_TABLE_HTML);
    const games = parseGameTable($);
    assert(games.length === 2, `Expected 2 games, got ${games.length}`);
    assert(games[0].id === "98765", `First game ID should be 98765, got ${games[0].id}`);
    assert(games[1].id === "11111", `Second game ID should be 11111, got ${games[1].id}`);
  });

  await test("Game table: parses date/time from BR-separated columns", () => {
    const $ = cheerio.load(GAME_TABLE_HTML);
    const games = parseGameTable($);
    assert(games[0].day === "Sun", `Day should be Sun, got ${games[0].day}`);
    assert(games[0].date === "2/15/2026", `Date should be 2/15/2026, got ${games[0].date}`);
    assert(games[0].time === "1:00 PM", `Time should be 1:00 PM, got ${games[0].time}`);
  });

  await test("Game table: parses sport/league/level", () => {
    const $ = cheerio.load(GAME_TABLE_HTML);
    const games = parseGameTable($);
    assert(games[0].sport === "Ice Hockey", `Sport should be Ice Hockey, got ${games[0].sport}`);
    assert(games[0].league === "Bantam AA", `League should be Bantam AA, got ${games[0].league}`);
    assert(games[0].level === "U15", `Level should be U15, got ${games[0].level}`);
  });

  await test("Game table: parses location (venue, home, away)", () => {
    const $ = cheerio.load(GAME_TABLE_HTML);
    const games = parseGameTable($);
    assert(games[0].venue === "Centennial Arena", `Venue should be Centennial Arena, got ${games[0].venue}`);
    assert(games[0].homeTeam === "Home Hawks", `Home should be Home Hawks, got ${games[0].homeTeam}`);
    assert(games[0].awayTeam === "Visitor Eagles", `Away should be Visitor Eagles, got ${games[0].awayTeam}`);
  });

  await test("Game table: parses crew members with position", () => {
    const $ = cheerio.load(GAME_TABLE_HTML);
    const games = parseGameTable($);
    assert(games[0].crew.length >= 1, `Should have crew members, got ${games[0].crew.length}`);
    const referee = games[0].crew.find(c => c.position.includes("Referee"));
    assert(!!referee, "Should have a Referee in crew");
  });

  await test("Game table: detects current user via span.ongame", () => {
    const $ = cheerio.load(GAME_TABLE_HTML);
    const games = parseGameTable($);
    const currentUser = games[0].crew.find(c => c.isCurrentUser);
    assert(!!currentUser, "Should detect current user via ongame span");
    assert(currentUser!.name === "John Doe", `Current user should be John Doe, got ${currentUser!.name}`);
  });

  await test("Game table: parses organization name", () => {
    const $ = cheerio.load(GAME_TABLE_HTML);
    const games = parseGameTable($);
    assert(games[0].organization === "CHOA", `Org should be CHOA, got ${games[0].organization}`);
    assert(games[1].organization === "CMHA", `Org should be CMHA, got ${games[1].organization}`);
  });

  await test("Game table: parses comments and distance", () => {
    const $ = cheerio.load(GAME_TABLE_HTML);
    const games = parseGameTable($);
    assert(games[0].comments === "Bring black jersey", `Comments should be 'Bring black jersey', got '${games[0].comments}'`);
    assert(games[0].distance === "15.2 km", `Distance should be '15.2 km', got '${games[0].distance}'`);
  });

  await test("Game table: parses assignment status", () => {
    const $ = cheerio.load(GAME_TABLE_HTML);
    const games = parseGameTable($);
    assert(games[0].assignmentStatus === "Accepted", `Status should be Accepted, got ${games[0].assignmentStatus}`);
  });

  await test("Game table: handles empty table gracefully", () => {
    const $ = cheerio.load("<html><body><table class='subtable floatheader'></table></body></html>");
    const games = parseGameTable($);
    assert(games.length === 0, `Should return empty array for empty table, got ${games.length}`);
  });

  // --- Availability Parser ---
  await test("Availability: parses day numbers and dates", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("availability.asp", { status: 200, body: AVAILABILITY_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getAvailabilityTool(client, { month: 2, year: 2026 });

    assert(result.days.length === 3, `Expected 3 days, got ${result.days.length}`);
    assert(result.days[0].date === "2026-02-01", `First day should be 2026-02-01, got ${result.days[0].date}`);
    assert(result.days[1].date === "2026-02-02", `Second day should be 2026-02-02, got ${result.days[1].date}`);
    restoreFetch();
  });

  await test("Availability: detects available status from green background", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("availability.asp", { status: 200, body: AVAILABILITY_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getAvailabilityTool(client, { month: 2, year: 2026 });

    assert(result.days[0].available === true, "Day 1 should be available (green bg)");
    assert(result.days[2].available === false, "Day 3 should not be available (no details)");
    restoreFetch();
  });

  await test("Availability: detects game on day via div.working", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("availability.asp", { status: 200, body: AVAILABILITY_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getAvailabilityTool(client, { month: 2, year: 2026 });

    assert(result.days[1].hasGame === true, "Day 2 should have a game");
    assert(result.days[1].gameLink === "games.asp?RID=555", `Game link should be games.asp?RID=555, got ${result.days[1].gameLink}`);
    restoreFetch();
  });

  await test("Availability: parses time restrictions", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("availability.asp", { status: 200, body: AVAILABILITY_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getAvailabilityTool(client, { month: 2, year: 2026 });

    assert(!!result.days[0].timeRestriction, "Day 1 should have time restriction");
    assert(result.days[0].timeRestriction!.includes("From"), "Should include From time");
    assert(result.days[0].timeRestriction!.includes("To"), "Should include To time");
    restoreFetch();
  });

  // --- Contacts Parser ---
  await test("Contacts: parses names and titles", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("contacts.asp", { status: 200, body: CONTACTS_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getContactsTool(client, {});

    assert(result.contacts.length === 2, `Expected 2 contacts, got ${result.contacts.length}`);
    assert(result.contacts[0].name === "Alice Johnson", `First name should be Alice Johnson, got ${result.contacts[0].name}`);
    assert(result.contacts[0].title === "Referee", `First title should be Referee, got ${result.contacts[0].title}`);
    assert(result.contacts[1].name === "Bob Smith", `Second name should be Bob Smith, got ${result.contacts[1].name}`);
    restoreFetch();
  });

  await test("Contacts: de-obfuscates email from JS variables", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("contacts.asp", { status: 200, body: CONTACTS_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getContactsTool(client, {});

    assert(result.contacts[0].email === "alice@example.com", `Email should be alice@example.com, got ${result.contacts[0].email}`);
    assert(result.contacts[1].email === "bobsmith@gmail.com", `Email should be bobsmith@gmail.com, got ${result.contacts[1].email}`);
    restoreFetch();
  });

  await test("Contacts: parses phone from tel:// links", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("contacts.asp", { status: 200, body: CONTACTS_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getContactsTool(client, {});

    assert(result.contacts[0].phone === "555-1234", `Phone should be 555-1234, got ${result.contacts[0].phone}`);
    assert(result.contacts[1].phone === undefined, "Bob should have no phone");
    restoreFetch();
  });

  await test("Contacts: client-side search filter works", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("contacts.asp", { status: 200, body: CONTACTS_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getContactsTool(client, { search: "alice" });

    assert(result.contacts.length === 1, `Should find 1 contact, got ${result.contacts.length}`);
    assert(result.contacts[0].name === "Alice Johnson", "Should find Alice");
    restoreFetch();
  });

  // --- Profile Parser ---
  await test("Profile: parses name from head1md", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: PROFILE_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const profile = await getProfileTool(client);

    assert(profile.name === "Test User", `Name should be Test User, got ${profile.name}`);
    restoreFetch();
  });

  await test("Profile: extracts OffRID from links", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: PROFILE_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const profile = await getProfileTool(client);

    assert(profile.id === "42", `ID should be 42, got ${profile.id}`);
    restoreFetch();
  });

  await test("Profile: parses registration status", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: PROFILE_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const profile = await getProfileTool(client);

    assert(profile.registrationStatus === "Registered", `Status should be Registered, got ${profile.registrationStatus}`);
    restoreFetch();
  });

  await test("Profile: parses zones list", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: PROFILE_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const profile = await getProfileTool(client);

    assert(profile.zones?.length === 2, `Should have 2 zones, got ${profile.zones?.length}`);
    assert(profile.zones![0] === "Zone A - Calgary", `First zone should be Zone A - Calgary, got ${profile.zones![0]}`);
    restoreFetch();
  });

  await test("Profile: parses organizations", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: PROFILE_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const profile = await getProfileTool(client);

    assert(profile.organizations?.length === 2, `Should have 2 orgs, got ${profile.organizations?.length}`);
    assert(profile.organizations![0] === "Calgary Hockey Association", `First org wrong: ${profile.organizations![0]}`);
    restoreFetch();
  });

  await test("Profile: parses custom fields (text and icon)", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: PROFILE_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const profile = await getProfileTool(client);

    assert(!!profile.customFields, "Should have custom fields");
    assert(profile.customFields!["Shirt Size"] === "Large", `Shirt Size should be Large, got ${profile.customFields!["Shirt Size"]}`);
    assert(profile.customFields!["Car"] === "Yes", `Car should be Yes (checkmark icon), got ${profile.customFields!["Car"]}`);
    restoreFetch();
  });

  // --- Calendar Feed Parser ---
  await test("Calendar feed: parses 3 feed scopes from tabs", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: CALENDAR_FEED_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getCalendarFeedUrlTool(client);

    assert(result.feeds.length === 3, `Expected 3 feeds, got ${result.feeds.length}`);
    assert(result.feeds[0].scope === "games+events", `First scope should be games+events, got ${result.feeds[0].scope}`);
    assert(result.feeds[1].scope === "games", `Second scope should be games, got ${result.feeds[1].scope}`);
    assert(result.feeds[2].scope === "events", `Third scope should be events, got ${result.feeds[2].scope}`);
    restoreFetch();
  });

  await test("Calendar feed: extracts webcal and https URLs", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("profile.asp", { status: 200, body: CALENDAR_FEED_HTML });
    responses.set("default.asp", { status: 200, body: "<html><body>Home</body></html>" });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await getCalendarFeedUrlTool(client);

    assert(result.feeds[0].url.startsWith("webcal://"), `Primary URL should be webcal://, got ${result.feeds[0].url}`);
    assert(result.feeds[0].httpsUrl?.startsWith("https://"), `HTTPS URL should start with https://, got ${result.feeds[0].httpsUrl}`);
    restoreFetch();
  });

  // --- Login Tool Parser ---
  await test("Login tool: extracts user name from nav dropdown", async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();
    responses.set("login.asp", { status: 200, body: "<html><body>Welcome</body></html>" });
    responses.set("default.asp", { status: 200, body: LOGIN_SUCCESS_HTML });
    mockFetch(responses);

    const auth = new AuthManager({ ...testConfig, requestDelayMs: 0 });
    const client = new RefTownClient({ ...testConfig, requestDelayMs: 0 }, auth);
    const result = await loginTool(client);

    assert(result.success === true, "Login should succeed");
    assert(result.name === "Test User", `Name should be Test User, got ${result.name}`);
    restoreFetch();
  });

  // --- Game Detail Parser ---
  await test("Game detail: extracts Official ID from hidden form field", () => {
    const $ = cheerio.load(GAME_DETAIL_ACCEPT_HTML);
    const detail = parseGameDetailPage($, "49811");
    assert(detail.officialId === "681", `Official ID should be 681, got ${detail.officialId}`);
  });

  await test("Game detail: extracts assignment RID from finance link", () => {
    const $ = cheerio.load(GAME_DETAIL_ACCEPT_HTML);
    const detail = parseGameDetailPage($, "49811");
    assert(detail.assignmentRID === "272767", `Assignment RID should be 272767, got ${detail.assignmentRID}`);
  });

  await test("Game detail: parses self-assign links for open positions", () => {
    const $ = cheerio.load(GAME_DETAIL_OPEN_HTML);
    const detail = parseGameDetailPage($, "59382");
    assert(detail.selfAssignLinks.length === 1, `Should have 1 self-assign link, got ${detail.selfAssignLinks.length}`);
    assert(detail.selfAssignLinks[0].duty === "1", `Duty should be 1, got ${detail.selfAssignLinks[0].duty}`);
    assert(detail.selfAssignLinks[0].url.includes("hash=abc123def456"), "URL should contain hash");
    assert(detail.selfAssignLinks[0].url.includes("games_selfassign.asp"), "URL should point to games_selfassign.asp");
  });

  await test("Game detail: returns empty selfAssignLinks when no open positions", () => {
    const $ = cheerio.load(GAME_DETAIL_ACCEPT_HTML);
    const detail = parseGameDetailPage($, "49811");
    assert(detail.selfAssignLinks.length === 0, `Should have 0 self-assign links, got ${detail.selfAssignLinks.length}`);
  });

  await test("Game detail: returns no assignmentRID when user not assigned", () => {
    const $ = cheerio.load(GAME_DETAIL_OPEN_HTML);
    const detail = parseGameDetailPage($, "59382");
    assert(!detail.assignmentRID, `Should have no assignment RID, got ${detail.assignmentRID}`);
  });
}

// ─── Layer 3: Live Integration Tests ──────────────────────────────────────────

async function liveIntegrationTests(): Promise<void> {
  section("Layer 3: Live Integration Tests");

  const username = process.env.REFTOWN_USERNAME;
  const password = process.env.REFTOWN_PASSWORD;

  if (!username || !password) {
    console.log("  ⊘ Skipped (REFTOWN_USERNAME/PASSWORD not set)");
    return;
  }

  const config: Config = {
    username,
    password,
    baseUrl: process.env.REFTOWN_BASE_URL ?? "https://reftown.com",
    requestDelayMs: Number(process.env.REFTOWN_DELAY_MS ?? "2000"),
  };

  await test("Live: reftown.com is reachable", async () => {
    const response = await fetch("https://reftown.com/login.asp", {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    assert(response.status < 500, `Expected non-5xx status, got ${response.status}`);
  });

  await test("Live: login.asp returns HTML with login form", async () => {
    const response = await fetch("https://reftown.com/login.asp", {
      signal: AbortSignal.timeout(10000),
    });
    const html = await response.text();
    assert(html.includes("Username") || html.includes("username"), "Login page should contain Username field");
    assert(html.includes("Password") || html.includes("password"), "Login page should contain Password field");
  });

  await test("Live: successful authentication", async () => {
    const auth = new AuthManager(config);
    const result = await auth.login();
    assert(result.success === true, `Login should succeed, got: ${result.message}`);
    assert(auth.isAuthenticated(), "Should be marked authenticated after login");
  });

  await test("Live: login tool returns name", async () => {
    const auth = new AuthManager(config);
    const client = new RefTownClient(config, auth);
    const result = await loginTool(client);
    assert(result.success === true, `Login tool should succeed, got: ${result.message}`);
    assert(!!result.name, `Should extract user name, got: ${result.name}`);
  });

  await test("Live: get_schedule returns valid structure", async () => {
    const auth = new AuthManager(config);
    const client = new RefTownClient(config, auth);
    const result = await getScheduleTool(client, { period: "upcoming" });
    assert(Array.isArray(result.games), "Should return games array");
    // Games may be empty if no upcoming assignments, that's OK
    if (result.games.length > 0) {
      const game = result.games[0];
      assert(!!game.id, "Game should have an ID");
      assert(!!game.date, "Game should have a date");
      assert(!!game.sport, "Game should have a sport");
    }
  });

  await test("Live: get_availability returns days for current month", async () => {
    const auth = new AuthManager(config);
    const client = new RefTownClient(config, auth);
    const now = new Date();
    const result = await getAvailabilityTool(client, {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
    assert(Array.isArray(result.days), "Should return days array");
    // Should have days for the current month
    if (result.days.length > 0) {
      assert(!!result.days[0].date, "Day should have a date string");
      assert(typeof result.days[0].available === "boolean", "Day should have available boolean");
    }
  });

  await test("Live: get_contacts returns valid structure", async () => {
    const auth = new AuthManager(config);
    const client = new RefTownClient(config, auth);
    const result = await getContactsTool(client, {});
    assert(Array.isArray(result.contacts), "Should return contacts array");
    if (result.contacts.length > 0) {
      assert(!!result.contacts[0].name, "Contact should have a name");
    }
  });

  await test("Live: get_profile returns name and ID", async () => {
    const auth = new AuthManager(config);
    const client = new RefTownClient(config, auth);
    const profile = await getProfileTool(client);
    assert(!!profile.name, `Should have a name, got: ${profile.name}`);
    assert(!profile.name.startsWith("[Could not parse"), `Name should not be error fallback, got: ${profile.name}`);
    assert(!!profile.id, `Should have an ID, got: ${profile.id}`);
  });

  await test("Live: get_calendar_feed_url returns feeds", async () => {
    const auth = new AuthManager(config);
    const client = new RefTownClient(config, auth);
    const result = await getCalendarFeedUrlTool(client);
    assert(Array.isArray(result.feeds), "Should return feeds array");
    assert(result.feeds.length > 0, "Should have at least one feed");
    assert(result.feeds[0].url.includes("webcal") || result.feeds[0].url.includes("vsend"), "Feed URL should be webcal or vsend");
  });

  await test("Live: search_open_games returns valid structure", async () => {
    const auth = new AuthManager(config);
    const client = new RefTownClient(config, auth);
    const result = await searchOpenGamesTool(client, {});
    assert(Array.isArray(result.games), "Should return games array");
    assert(typeof result.totalFound === "number", "Should have totalFound count");
  });
}

// ─── Layer 4: MCP Server Tests ────────────────────────────────────────────────

async function mcpServerTests(): Promise<void> {
  section("Layer 4: MCP Server Protocol Tests");

  await test("MCP: Server module imports without errors", async () => {
    // Just verify the server module can be imported
    // (it will throw on loadConfig if env vars missing, but we test import path)
    try {
      // We test that all tool modules are importable
      const schedule = await import("./tools/schedule.js");
      assert(typeof schedule.getScheduleTool === "function", "getScheduleTool should be a function");
      assert(typeof schedule.getGameDetailsTool === "function", "getGameDetailsTool should be a function");
      assert(typeof schedule.acceptGameTool === "function", "acceptGameTool should be a function");
      assert(typeof schedule.declineGameTool === "function", "declineGameTool should be a function");
    } catch (e) {
      throw new Error(`Import failed: ${e}`);
    }
  });

  await test("MCP: All tool schemas validate correctly", async () => {
    const { getScheduleSchema, getGameDetailsSchema, acceptGameSchema, declineGameSchema } = await import("./tools/schedule.js");
    const { getAvailabilitySchema, setAvailabilitySchema } = await import("./tools/availability.js");
    const { getContactsSchema } = await import("./tools/contacts.js");
    const { searchOpenGamesSchema } = await import("./tools/open-games.js");

    // Valid inputs should parse
    assert(!!getScheduleSchema.parse({}), "Empty schedule args should be valid");
    assert(!!getScheduleSchema.parse({ period: "upcoming" }), "upcoming period should be valid");
    assert(!!getGameDetailsSchema.parse({ gameId: "123" }), "gameId string should be valid");
    assert(!!acceptGameSchema.parse({ gameId: "123" }), "acceptGame should accept gameId");
    assert(!!declineGameSchema.parse({ gameId: "123", reason: "conflict" }), "declineGame should accept reason");
    assert(!!getAvailabilitySchema.parse({}), "Empty availability args should be valid");
    assert(!!getAvailabilitySchema.parse({ month: 6, year: 2026 }), "Availability with month/year should be valid");
    assert(!!setAvailabilitySchema.parse({ dates: [{ date: "2026-01-01", available: true }] }), "setAvailability should accept dates array");
    assert(!!getContactsSchema.parse({}), "Empty contacts args should be valid");
    assert(!!getContactsSchema.parse({ search: "john" }), "Contacts with search should be valid");
    assert(!!searchOpenGamesSchema.parse({}), "Empty open games args should be valid");
    assert(!!searchOpenGamesSchema.parse({ zone: "5", dateQualifier: "Next 7 Days", sport: "Hockey" }), "Full open games args should be valid");
  });

  await test("MCP: Invalid schema inputs are rejected", async () => {
    const { getScheduleSchema } = await import("./tools/schedule.js");
    const { getAvailabilitySchema } = await import("./tools/availability.js");

    let threw = false;
    try { getScheduleSchema.parse({ period: "invalid" }); } catch { threw = true; }
    assert(threw, "Invalid period should be rejected");

    threw = false;
    try { getAvailabilitySchema.parse({ month: 13 }); } catch { threw = true; }
    assert(threw, "Month > 12 should be rejected");

    threw = false;
    try { getAvailabilitySchema.parse({ month: 0 }); } catch { threw = true; }
    assert(threw, "Month < 1 should be rejected");
  });

  await test("MCP: Remaining stub tools return structured not-implemented response", async () => {
    const { setAvailabilityTool } = await import("./tools/availability.js");

    const testConfig: Config = { username: "", password: "", baseUrl: "", requestDelayMs: 0 };
    const auth = new AuthManager(testConfig);
    const client = new RefTownClient(testConfig, auth);

    const setAvail = await setAvailabilityTool(client, { dates: [] });
    assert(setAvail.success === false, "Stub setAvailability should return success=false");
  });

  await test("MCP: requestGameSchema validates correctly", async () => {
    const { requestGameSchema } = await import("./tools/open-games.js");
    assert(!!requestGameSchema.parse({ gameId: "59382" }), "gameId string should be valid");
    assert(!!requestGameSchema.parse({ gameId: "59382", duty: "1" }), "gameId with duty should be valid");
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("ReftownMCP Integration Test Suite\n");

  await httpContractTests();
  await htmlParserTests();
  await liveIntegrationTests();
  await mcpServerTests();

  // Summary
  console.log("\n" + "═".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  ✗ ${f.name}`);
      console.log(`    ${f.error}`);
    }
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  restoreFetch();
  process.exit(1);
});
