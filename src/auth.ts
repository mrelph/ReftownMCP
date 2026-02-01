import { CookieJar, Cookie } from "tough-cookie";
import { Config } from "./config.js";

export class AuthManager {
  private cookieJar: CookieJar;
  private authenticated = false;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.cookieJar = new CookieJar();
  }

  getCookieJar(): CookieJar {
    return this.cookieJar;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  async login(): Promise<{ success: boolean; message: string }> {
    const loginUrl = `${this.config.baseUrl}/login.asp`;

    // First, GET the login page to pick up any initial cookies or hidden fields
    const getResponse = await fetch(loginUrl, {
      redirect: "manual",
    });
    await this.storeCookiesFromResponse(getResponse, loginUrl);

    // POST credentials to the login form
    const formData = new URLSearchParams({
      Username: this.config.username,
      Password: this.config.password,
      Submit: "Login",
    });

    const cookieHeader = await this.getCookieHeader(loginUrl);
    const postResponse = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: formData.toString(),
      redirect: "manual",
    });

    await this.storeCookiesFromResponse(postResponse, loginUrl);

    // RefTown typically redirects to default.asp on successful login
    const location = postResponse.headers.get("location");
    const status = postResponse.status;

    if (status === 301 || status === 302 || status === 307 || status === 308) {
      if (location && !location.toLowerCase().includes("login")) {
        // Follow the redirect to complete the session setup
        const redirectUrl = new URL(location, this.config.baseUrl).href;
        const redirectCookie = await this.getCookieHeader(redirectUrl);
        const redirectResponse = await fetch(redirectUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            ...(redirectCookie ? { Cookie: redirectCookie } : {}),
          },
          redirect: "manual",
        });
        await this.storeCookiesFromResponse(redirectResponse, redirectUrl);
        this.authenticated = true;
        return { success: true, message: "Logged in successfully" };
      }
    }

    // If no redirect, check if the response body indicates success
    const body = await postResponse.text();
    if (
      body.includes("default.asp") ||
      body.includes("Welcome") ||
      body.includes("My Schedule")
    ) {
      this.authenticated = true;
      return { success: true, message: "Logged in successfully" };
    }

    // Check for error messages in the response
    if (
      body.includes("Invalid") ||
      body.includes("incorrect") ||
      body.includes("failed")
    ) {
      this.authenticated = false;
      return { success: false, message: "Login failed: invalid credentials" };
    }

    this.authenticated = false;
    return {
      success: false,
      message: `Login failed with status ${status}. Check credentials.`,
    };
  }

  async ensureAuthenticated(): Promise<void> {
    if (!this.authenticated) {
      const result = await this.login();
      if (!result.success) {
        throw new Error(result.message);
      }
    }
  }

  async getCookieHeader(url: string): Promise<string> {
    const cookies = await this.cookieJar.getCookies(url);
    return cookies.map((c) => c.cookieString()).join("; ");
  }

  private async storeCookiesFromResponse(
    response: Response,
    url: string
  ): Promise<void> {
    const setCookieHeaders = response.headers.getSetCookie();
    for (const header of setCookieHeaders) {
      try {
        const cookie = Cookie.parse(header);
        if (cookie) {
          await this.cookieJar.setCookie(cookie, url);
        }
      } catch {
        // Skip malformed cookies
      }
    }
  }

  handleSessionExpiry(): void {
    this.authenticated = false;
    this.cookieJar = new CookieJar();
  }
}
