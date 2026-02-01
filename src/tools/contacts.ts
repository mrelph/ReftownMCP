import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { Contact } from "../types.js";

export const getContactsSchema = z.object({
  search: z
    .string()
    .optional()
    .describe("Optional search term to filter contacts by name"),
});

export async function getContactsTool(
  client: RefTownClient,
  args: z.infer<typeof getContactsSchema>
): Promise<{ contacts: Contact[]; rawPreview?: string }> {
  const params: Record<string, string> = {};
  if (args.search) {
    params["Search"] = args.search;
    params["q"] = args.search;
  }

  const $ = await client.get("contacts.asp", params);
  const contacts: Contact[] = [];

  // Parse contacts table
  $("table tr").each((i, row) => {
    if (i === 0) return; // Skip header

    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const contact: Contact = {
      name: $(cells[0]).text().trim(),
      email: cells.length > 1 ? $(cells[1]).text().trim() || $(cells[1]).find("a[href^='mailto']").attr("href")?.replace("mailto:", "") : undefined,
      phone: cells.length > 2 ? $(cells[2]).text().trim() : undefined,
      role: cells.length > 3 ? $(cells[3]).text().trim() : undefined,
      organization: cells.length > 4 ? $(cells[4]).text().trim() : undefined,
    };

    if (contact.name) {
      contacts.push(contact);
    }
  });

  // Try alternative parsing if table approach found nothing
  if (contacts.length === 0) {
    $(".contact, .official, .person").each((_, el) => {
      const contact: Contact = {
        name: $(el).find(".name, a").first().text().trim(),
        email: ($(el).find("a[href^='mailto']").attr("href")?.replace("mailto:", "")) ??
          ($(el).find(".email").text().trim() || undefined),
        phone: $(el).find(".phone, .tel").text().trim() || undefined,
        role: $(el).find(".role, .position").text().trim() || undefined,
        organization: $(el).find(".org, .organization").text().trim() || undefined,
      };
      if (contact.name) {
        contacts.push(contact);
      }
    });
  }

  // Filter by search term if provided and contacts were found
  let filtered = contacts;
  if (args.search && contacts.length > 0) {
    const term = args.search.toLowerCase();
    filtered = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.role?.toLowerCase().includes(term)
    );
  }

  const rawPreview =
    filtered.length === 0
      ? $("body").text().replace(/\s+/g, " ").trim().slice(0, 500)
      : undefined;

  return { contacts: filtered, rawPreview };
}
