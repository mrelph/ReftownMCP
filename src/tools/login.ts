import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { LoginResult } from "../types.js";

export const loginSchema = z.object({});

export async function loginTool(
  client: RefTownClient
): Promise<LoginResult> {
  const auth = client.getAuth();
  const result = await auth.login();

  if (result.success) {
    // Try to fetch the landing page to confirm and extract the user's name
    try {
      const $ = await client.get("default.asp");
      const welcomeText = $("body").text();
      const nameMatch = welcomeText.match(/Welcome[,\s]+([^<\n]+)/i);
      return {
        success: true,
        message: result.message,
        name: nameMatch?.[1]?.trim(),
      };
    } catch {
      return { success: true, message: result.message };
    }
  }

  return { success: false, message: result.message };
}
