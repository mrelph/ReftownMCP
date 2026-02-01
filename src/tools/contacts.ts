import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { Contact } from "../types.js";

export const getContactsSchema = z.object({
  search: z
    .string()
    .optional()
    .describe("Optional search term to filter contacts by name (client-side filter)"),
});

export async function getContactsTool(
  client: RefTownClient,
  args: z.infer<typeof getContactsSchema>
): Promise<{ contacts: Contact[]; rawPreview?: string }> {
  // Server doesn't support search params — always fetch all contacts
  const $ = await client.get("contacts.asp");
  const contacts: Contact[] = [];

  // Real RefTown HTML: table.subtable.floatheader
  // Rows: tr (skip header row with th elements)
  // Per row (4 columns):
  //   Col 0: vCard link (a[href*="vcard.asp"]) — extract OID
  //   Col 1: Title in B tag, Name in a[href*="roster.asp"]
  //   Col 2: Address (usually empty)
  //   Col 3: Nested table with phone (a[href*="tel://"]) and email (JS obfuscation)
  $("table.subtable.floatheader tr").each((_, row) => {
    // Skip header rows
    if ($(row).find("th").length > 0) return;

    const cells = $(row).find("> td");
    if (cells.length < 4) return;

    // Column 0: vCard link
    const col0 = $(cells[0]);
    const vCardLink = col0.find('a[href*="vcard.asp"]').attr("href");
    const vCardUrl = vCardLink || undefined;

    // Column 1: Title (B tag) + Name (roster link)
    const col1 = $(cells[1]);
    const title = col1.find("B").first().text().trim() || undefined;
    const nameLink = col1.find('a[href*="roster.asp"]');
    const name = nameLink.text().trim() || col1.text().trim();

    // Column 2: Address (often empty)
    // Not extracted — usually blank in RefTown contacts

    // Column 3: Phone + Email (obfuscated)
    const col3 = $(cells[3]);

    // Phone: look for tel:// links
    const phoneLink = col3.find('a[href*="tel://"]');
    let phone: string | undefined;
    if (phoneLink.length > 0) {
      phone = phoneLink.text().trim() ||
        phoneLink.attr("href")?.replace("tel://", "") || undefined;
    }

    // Email: parse inline script for var sb_domain and var sb_user
    // RefTown obfuscates emails with JS: var sb_domain = 'example.com'; var sb_user = 'john';
    let email: string | undefined;
    const scripts = col3.find("script");
    scripts.each((_, script) => {
      const scriptText = $(script).text();
      const domainMatch = scriptText.match(/var\s+sb_domain\s*=\s*'([^']+)'/);
      const userMatch = scriptText.match(/var\s+sb_user\s*=\s*'([^']+)'/);
      if (domainMatch && userMatch) {
        email = `${userMatch[1]}@${domainMatch[1]}`;
      }
    });

    if (name) {
      contacts.push({
        name,
        title,
        email,
        phone,
        vCardUrl,
      });
    }
  });

  // Client-side filter by search term
  let filtered = contacts;
  if (args.search && contacts.length > 0) {
    const term = args.search.toLowerCase();
    filtered = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.title?.toLowerCase().includes(term)
    );
  }

  const rawPreview =
    filtered.length === 0
      ? $("body").text().replace(/\s+/g, " ").trim().slice(0, 500)
      : undefined;

  return { contacts: filtered, rawPreview };
}
