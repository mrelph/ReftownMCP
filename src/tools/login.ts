import { RefTownClient } from "../client.js";
import type { LoginResult } from "../types.js";

export async function loginTool(
  client: RefTownClient
): Promise<LoginResult> {
  const auth = client.getAuth();
  const result = await auth.login();

  if (result.success) {
    try {
      const $ = await client.get("default.asp");

      // RefTown shows the user's name as a bracketed link in the nav bar,
      // e.g. [Massey Relph]. Also available in table.subtable.accountlinktable.
      let name: string | undefined;

      // Try nav bar: look for link text matching [Name]
      $("a").each((_, el) => {
        if (name) return;
        const text = $(el).text().trim();
        const bracketMatch = text.match(/^\[(.+)\]$/);
        if (bracketMatch) {
          name = bracketMatch[1].trim();
        }
      });

      // Fallback: try accountlinktable
      if (!name) {
        const accountTable = $("table.subtable.accountlinktable");
        if (accountTable.length > 0) {
          name = accountTable.find("tr").first().text().trim() || undefined;
        }
      }

      return {
        success: true,
        message: result.message,
        name,
      };
    } catch {
      return { success: true, message: result.message };
    }
  }

  return { success: false, message: result.message };
}
