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
  const headText = $("div.head1md").first().text().trim();
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

  // Registration status: <B>Registration Status</B> followed by <BR>value
  // The text "Registered" is on the line after "Registration Status"
  const bodyHtml = $("body").html() ?? "";
  const regHtmlMatch = bodyHtml.match(/Registration Status<\/B>\s*(?:<BR>|<br>)\s*([^<\n]+)/i);
  if (regHtmlMatch) {
    profile.registrationStatus = regHtmlMatch[1].trim();
  }

  // Zones: li.indentp20 elements under "Zones" heading
  const zones: string[] = [];
  $("li.indentp20").each((_, el) => {
    const text = $(el).text().trim();
    if (text) zones.push(text);
  });
  if (zones.length > 0) profile.zones = zones;

  // Organizations: from table.subtable.accountlinktable data rows (tr.aclink)
  // Each row has TDs: [0]=spacer, [1]=org name, [2]=sport icon, [3]=user name, [4]=account type
  const orgs: string[] = [];
  $("table.subtable.accountlinktable tr.aclink").each((_, row) => {
    const tds = $(row).find("td");
    const orgName = tds.eq(1).text().trim();
    if (orgName) orgs.push(orgName);
  });
  if (orgs.length > 0) profile.organizations = orgs;

  // Custom fields: after "Other Information/Custom Fields" heading
  // Structure: <LI><B>Field:</B> value within a table
  const customFields: Record<string, string> = {};
  const customFieldsHeading = $("div.head1wrap").filter((_, el) =>
    $(el).text().includes("Custom Fields")
  );
  if (customFieldsHeading.length > 0) {
    const customTable = customFieldsHeading.next("table");
    customTable.find("li").each((_, li) => {
      const bold = $(li).find("B").first();
      const fieldName = bold.text().trim().replace(/:$/, "");
      if (!fieldName) return;

      // Value: text after the B tag, or IMG alt text for checkmarks
      // Clone the li, remove the B and any edit links, get remaining text
      const clone = $(li).clone();
      clone.find("B").remove();
      clone.find("a").remove();
      const img = clone.find("img");
      let value: string;
      if (img.length > 0) {
        // Checkmark (_icons/c.gif) = yes, X (_icons/x.gif) = no
        const src = img.attr("src") ?? "";
        value = src.includes("/c.gif") ? "Yes" : src.includes("/x.gif") ? "No" : clone.text().trim();
      } else {
        value = clone.text().trim();
      }
      if (fieldName) {
        customFields[fieldName] = value;
      }
    });
  }
  if (Object.keys(customFields).length > 0) profile.customFields = customFields;

  // If we got no name, include raw text for debugging
  if (!profile.name) {
    const preview = $("body").text().replace(/\s+/g, " ").trim();
    profile.name = `[Could not parse name. Page preview: ${preview.slice(0, 300)}]`;
  }

  return profile;
}
