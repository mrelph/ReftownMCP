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

      let name: string | undefined;

      // Name is in the nav dropdown: <UL class="dropdown ... redgrad"><LI><A>Massey Relph ...</A>
      // The link text contains the name followed by a menu arrow image.
      const dropdownLink = $("ul.dropdown.redgrad > li > a").first();
      if (dropdownLink.length > 0) {
        // Get only the text content, stripping any child elements (IMG tags)
        name = dropdownLink.contents().filter(function () {
          return this.type === "text";
        }).text().trim().replace(/\s+/g, " ") || undefined;
      }

      // Fallback: get name from the accountlinktable data row (tr.aclink)
      if (!name) {
        const nameCell = $("table.subtable.accountlinktable tr.aclink td").eq(3);
        if (nameCell.length > 0) {
          name = nameCell.text().trim() || undefined;
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
