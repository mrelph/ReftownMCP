import * as cheerio from "cheerio";
import { Cookie } from "tough-cookie";
import { AuthManager } from "./auth.js";
import { Config } from "./config.js";

const MAX_AUTH_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 30_000;

export class RefTownClient {
  private auth: AuthManager;
  private config: Config;
  private lastRequestTime = 0;

  constructor(config: Config, auth: AuthManager) {
    this.config = config;
    this.auth = auth;
  }

  getAuth(): AuthManager {
    return this.auth;
  }

  async get(
    path: string,
    params?: Record<string, string>,
    _retryDepth = 0
  ): Promise<cheerio.CheerioAPI> {
    await this.auth.ensureAuthenticated();
    await this.rateLimit();

    let url = `${this.config.baseUrl}/${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const cookieHeader = await this.auth.getCookieHeader(url);
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // Detect session expiry (redirect back to login)
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get("location") ?? "";
      if (location.toLowerCase().includes("login")) {
        if (_retryDepth >= MAX_AUTH_RETRIES) {
          throw new Error(`Session expired fetching ${path} and re-auth failed after ${MAX_AUTH_RETRIES} retries`);
        }
        this.auth.handleSessionExpiry();
        await this.auth.ensureAuthenticated();
        return this.get(path, params, _retryDepth + 1);
      }
    }

    if (!response.ok && response.status !== 302 && response.status !== 301) {
      throw new Error(
        `HTTP ${response.status} fetching ${path}: ${response.statusText}`
      );
    }

    const html = await response.text();

    // Check for login redirect in HTML meta refresh or inline login form
    if (
      html.includes("url=login.asp") ||
      html.includes("Log in to view") ||
      html.includes('id="Username"')
    ) {
      if (_retryDepth >= MAX_AUTH_RETRIES) {
        throw new Error(`Session expired fetching ${path} and re-auth failed after ${MAX_AUTH_RETRIES} retries`);
      }
      this.auth.handleSessionExpiry();
      await this.auth.ensureAuthenticated();
      return this.get(path, params, _retryDepth + 1);
    }

    return cheerio.load(html);
  }

  async post(
    path: string,
    formData: Record<string, string>,
    _retryDepth = 0
  ): Promise<cheerio.CheerioAPI> {
    await this.auth.ensureAuthenticated();
    await this.rateLimit();

    const url = `${this.config.baseUrl}/${path}`;
    const body = new URLSearchParams(formData);
    const cookieHeader = await this.auth.getCookieHeader(url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: body.toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // Store any new cookies from the response
    const setCookieHeaders = response.headers.getSetCookie();
    for (const header of setCookieHeaders) {
      try {
        const cookie = Cookie.parse(header);
        if (cookie) {
          await this.auth.getCookieJar().setCookie(cookie, url);
        }
      } catch {
        // Skip malformed cookies
      }
    }

    // Handle redirects after POST (common in form submissions)
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get("location");
      if (location) {
        if (location.toLowerCase().includes("login")) {
          if (_retryDepth >= MAX_AUTH_RETRIES) {
            throw new Error(`Session expired posting to ${path} and re-auth failed after ${MAX_AUTH_RETRIES} retries`);
          }
          this.auth.handleSessionExpiry();
          await this.auth.ensureAuthenticated();
          return this.post(path, formData, _retryDepth + 1);
        }
        // Follow the redirect
        const redirectPath = location.startsWith("http")
          ? new URL(location).pathname.slice(1)
          : location.replace(/^\//, "");
        return this.get(redirectPath);
      }
    }

    if (!response.ok && response.status !== 302 && response.status !== 301) {
      throw new Error(
        `HTTP ${response.status} posting to ${path}: ${response.statusText}`
      );
    }

    const html = await response.text();

    // Check for inline login form on POST responses
    if (
      html.includes("Log in to view") ||
      html.includes('id="Username"')
    ) {
      if (_retryDepth >= MAX_AUTH_RETRIES) {
        throw new Error(`Session expired posting to ${path} and re-auth failed after ${MAX_AUTH_RETRIES} retries`);
      }
      this.auth.handleSessionExpiry();
      await this.auth.ensureAuthenticated();
      return this.post(path, formData, _retryDepth + 1);
    }

    return cheerio.load(html);
  }

  async getRaw(path: string, params?: Record<string, string>): Promise<string> {
    await this.auth.ensureAuthenticated();
    await this.rateLimit();

    let url = `${this.config.baseUrl}/${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const cookieHeader = await this.auth.getCookieHeader(url);
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} fetching ${path}: ${response.statusText}`
      );
    }

    return response.text();
  }

  extractHiddenFields($: cheerio.CheerioAPI, formSelector?: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const selector = formSelector
      ? `${formSelector} input[type="hidden"]`
      : 'input[type="hidden"]';

    $(selector).each((_, el) => {
      const name = $(el).attr("name");
      const value = $(el).attr("value") ?? "";
      if (name) {
        fields[name] = value;
      }
    });

    return fields;
  }

  extractTable(
    $: cheerio.CheerioAPI,
    tableSelector: string
  ): Record<string, string>[][] {
    const rows: Record<string, string>[][] = [];
    const headers: string[] = [];

    $(`${tableSelector} thead th, ${tableSelector} tr:first-child th`).each(
      (_, el) => {
        headers.push($(el).text().trim());
      }
    );

    // If no th elements found, use first row td as headers
    if (headers.length === 0) {
      $(`${tableSelector} tr:first-child td`).each((_, el) => {
        headers.push($(el).text().trim());
      });
    }

    const dataRows =
      headers.length > 0
        ? $(`${tableSelector} tr`).slice(1)
        : $(`${tableSelector} tr`);

    dataRows.each((_, row) => {
      const cells: Record<string, string>[] = [];
      $(row)
        .find("td")
        .each((i, cell) => {
          const key = headers[i] ?? `col${i}`;
          cells.push({ [key]: $(cell).text().trim() });
        });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });

    return rows;
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.config.requestDelayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.requestDelayMs - elapsed)
      );
    }
    this.lastRequestTime = Date.now();
  }
}
