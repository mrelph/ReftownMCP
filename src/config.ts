export const BASE_URL = "https://www.reftown.com";

export interface Config {
  username: string;
  password: string;
  baseUrl: string;
  requestDelayMs: number;
}

export function loadConfig(): Config {
  const username = process.env.REFTOWN_USERNAME;
  const password = process.env.REFTOWN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "REFTOWN_USERNAME and REFTOWN_PASSWORD environment variables are required"
    );
  }

  return {
    username,
    password,
    baseUrl: process.env.REFTOWN_BASE_URL ?? BASE_URL,
    requestDelayMs: Number(process.env.REFTOWN_DELAY_MS ?? "500"),
  };
}
