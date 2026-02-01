import { RefTownClient } from "../client.js";
import type { Profile } from "../types.js";

export async function getProfileTool(
  client: RefTownClient
): Promise<Profile> {
  const $ = await client.get("profile.asp");

  const profile: Profile = {
    name: "",
  };

  // Name: extract from div.head1md text matching "Preferences for (.+)"
  const headText = $("div.head1md").text().trim();
  const nameMatch = headText.match(/Preferences for\s+(.+)/i);
  if (nameMatch) {
    profile.name = nameMatch[1].trim();
  }

  // User ID: extract OffRID from any link containing OffRID=
  const offRidLink = $("a[href*='OffRID=']").first().attr("href") ?? "";
  const offRidMatch = offRidLink.match(/OffRID=(\d+)/i);
  if (offRidMatch) {
    profile.id = offRidMatch[1];
  }

  // Registration status: text near "Registration Status"
  const bodyText = $("body").text();
  const regMatch = bodyText.match(/Registration Status[:\s]*([^\n]+)/i);
  if (regMatch) {
    profile.registrationStatus = regMatch[1].trim();
  }

  // Zones: li.indentp20 elements under "Zones" heading
  const zones: string[] = [];
  $("li.indentp20").each((_, el) => {
    const text = $(el).text().trim();
    if (text) zones.push(text);
  });
  if (zones.length > 0) profile.zones = zones;

  // Organizations: from table.subtable.accountlinktable — org name in first row
  const orgs: string[] = [];
  $("table.subtable.accountlinktable").each((_, table) => {
    const orgName = $(table).find("tr").first().text().trim();
    if (orgName) orgs.push(orgName);
  });
  if (orgs.length > 0) profile.organizations = orgs;

  // Custom fields: table rows with B tag field names under "Custom Fields" heading
  const customFields: Record<string, string> = {};
  let inCustomFields = false;
  $("table tr, div, p").each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes("Custom Fields")) {
      inCustomFields = true;
      return;
    }
    if (inCustomFields) {
      const fieldName = $(el).find("B").first().text().trim();
      if (fieldName) {
        // Value is the remaining text after the B tag
        const fullText = $(el).text().trim();
        const value = fullText.replace(fieldName, "").trim().replace(/^[:\s]+/, "");
        customFields[fieldName] = value;
      }
    }
  });
  if (Object.keys(customFields).length > 0) profile.customFields = customFields;

  // If we got no name, include raw text for debugging
  if (!profile.name) {
    const preview = $("body").text().replace(/\s+/g, " ").trim();
    profile.name = `[Could not parse name. Page preview: ${preview.slice(0, 300)}]`;
  }

  return profile;
}
