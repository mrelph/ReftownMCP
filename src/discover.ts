import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";
import { loadConfig } from "./config.js";
import { AuthManager } from "./auth.js";
import { RefTownClient } from "./client.js";

const DISCOVERY_DIR = path.resolve(import.meta.dirname ?? ".", "..", "discovery");

const PAGES_TO_FETCH = [
  { path: "mygames.asp", label: "Game Schedule" },
  { path: "availability.asp", label: "Availability Calendar" },
  { path: "profile.asp", label: "User Profile" },
  { path: "profile.asp?Focus=ShowPAK", label: "Calendar Feed / PAK" },
  { path: "contacts.asp", label: "Contacts" },
  { path: "default.asp", label: "Landing Page" },
  { path: "games.asp?openonly=1&AltSort=Date%2FLocation%2FTime", label: "Open Games" },
];

function summarizePage($: cheerio.CheerioAPI, label: string): string {
  const lines: string[] = [];
  lines.push(`=== ${label} ===`);

  // Form fields
  const forms = $("form");
  if (forms.length > 0) {
    lines.push(`\nForms (${forms.length}):`);
    forms.each((i, form) => {
      const action = $(form).attr("action") ?? "(none)";
      const method = $(form).attr("method") ?? "GET";
      const id = $(form).attr("id") ?? $(form).attr("name") ?? "(unnamed)";
      lines.push(`  Form #${i}: id=${id} method=${method} action=${action}`);

      $(form)
        .find("input, select, textarea")
        .each((_, el) => {
          const tag = el.tagName;
          const type = $(el).attr("type") ?? tag;
          const name = $(el).attr("name") ?? "(no name)";
          const id = $(el).attr("id") ?? "";
          const value = $(el).attr("value") ?? "";
          lines.push(`    <${tag}> type=${type} name=${name} id=${id} value=${value.slice(0, 80)}`);
        });
    });
  }

  // Hidden inputs (outside forms too)
  const hiddenInputs = $('input[type="hidden"]');
  if (hiddenInputs.length > 0) {
    lines.push(`\nHidden inputs (${hiddenInputs.length}):`);
    hiddenInputs.each((_, el) => {
      const name = $(el).attr("name") ?? "(no name)";
      const value = $(el).attr("value") ?? "";
      lines.push(`  ${name} = ${value.slice(0, 100)}`);
    });
  }

  // Tables
  const tables = $("table");
  if (tables.length > 0) {
    lines.push(`\nTables (${tables.length}):`);
    tables.each((i, table) => {
      const id = $(table).attr("id") ?? "";
      const cls = $(table).attr("class") ?? "";
      const rows = $(table).find("tr").length;
      const headers: string[] = [];
      $(table)
        .find("th")
        .each((_, th) => { headers.push($(th).text().trim()); });
      lines.push(`  Table #${i}: id="${id}" class="${cls}" rows=${rows}`);
      if (headers.length > 0) {
        lines.push(`    Headers: ${headers.join(" | ")}`);
      }
    });
  }

  // Links
  const links = $("a[href]");
  if (links.length > 0) {
    lines.push(`\nLinks (${links.length}):`);
    const seen = new Set<string>();
    links.each((_, a) => {
      const href = $(a).attr("href") ?? "";
      const text = $(a).text().trim().slice(0, 60);
      const key = `${href}|${text}`;
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(`  [${text}] -> ${href}`);
      }
    });
  }

  // CSS classes on body and major containers
  const bodyClass = $("body").attr("class") ?? "(none)";
  lines.push(`\nBody class: ${bodyClass}`);

  const divs = $("div[id], div[class]");
  if (divs.length > 0) {
    lines.push(`\nNamed divs (first 30):`);
    divs.slice(0, 30).each((_, div) => {
      const id = $(div).attr("id") ?? "";
      const cls = $(div).attr("class") ?? "";
      lines.push(`  div id="${id}" class="${cls}"`);
      return;
    });
  }

  // Script calls (look for InitPage and other JS patterns)
  const scripts = $("script");
  if (scripts.length > 0) {
    lines.push(`\nInline scripts (${scripts.length}):`);
    scripts.each((i, script) => {
      const src = $(script).attr("src") ?? "";
      const content = $(script).text().trim();
      if (src) {
        lines.push(`  Script #${i}: src=${src}`);
      } else if (content) {
        lines.push(`  Script #${i}: ${content.slice(0, 200)}`);
      }
    });
  }

  // Page title
  const title = $("title").text().trim();
  lines.push(`\nPage title: ${title}`);

  // Check if page appears to be an auth wall
  const bodyText = $("body").text();
  if (bodyText.includes("Log in to view") || bodyText.includes('id="Username"')) {
    lines.push("\n*** WARNING: Page appears to show a login form — session may not be authenticated ***");
  }

  return lines.join("\n");
}

async function main() {
  console.log("RefTown Discovery Script");
  console.log("========================\n");

  // Load config (reads REFTOWN_USERNAME / REFTOWN_PASSWORD from env)
  const config = loadConfig();
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Request delay: ${config.requestDelayMs}ms\n`);

  // Create discovery output directory
  fs.mkdirSync(DISCOVERY_DIR, { recursive: true });
  console.log(`Output directory: ${DISCOVERY_DIR}\n`);

  // Authenticate
  const auth = new AuthManager(config);
  const client = new RefTownClient(config, auth);

  console.log("Logging in...");
  const loginResult = await auth.login();
  if (!loginResult.success) {
    console.error(`Login failed: ${loginResult.message}`);
    process.exit(1);
  }
  console.log(`Login: ${loginResult.message}\n`);

  // Fetch each page
  for (const page of PAGES_TO_FETCH) {
    console.log(`Fetching ${page.label} (${page.path})...`);

    try {
      // Split path and query params for pages like profile.asp?Focus=ShowPAK
      const [pagePath, queryString] = page.path.split("?");
      const params: Record<string, string> | undefined = queryString
        ? Object.fromEntries(new URLSearchParams(queryString))
        : undefined;

      const html = await client.getRaw(pagePath, params);

      // Save raw HTML
      const safeName = page.path.replace(/[?&=]/g, "_").replace(/\.asp/, "");
      const htmlFile = path.join(DISCOVERY_DIR, `${safeName}.html`);
      fs.writeFileSync(htmlFile, html, "utf-8");
      console.log(`  Saved HTML: ${htmlFile} (${html.length} bytes)`);

      // Generate and save summary
      const $ = cheerio.load(html);
      const summary = summarizePage($, page.label);
      const summaryFile = path.join(DISCOVERY_DIR, `${safeName}.summary.txt`);
      fs.writeFileSync(summaryFile, summary, "utf-8");
      console.log(`  Saved summary: ${summaryFile}`);

      // Print summary to console
      console.log(`\n${summary}\n`);
      console.log("---\n");
    } catch (error) {
      console.error(`  Error fetching ${page.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("Discovery complete.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
