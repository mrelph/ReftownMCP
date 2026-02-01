import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { Profile } from "../types.js";

export const getProfileSchema = z.object({});

export async function getProfileTool(
  client: RefTownClient
): Promise<Profile> {
  const $ = await client.get("profile.asp");

  const profile: Profile = {
    name: "",
  };

  // Try to extract profile fields - structure needs discovery
  // Pattern 1: Form-based profile page (common in ASP apps)
  const nameField = $('input[name*="Name"], input[name*="name"]');
  if (nameField.length > 0) {
    const first = $('input[name*="First"]').val() as string ?? "";
    const last = $('input[name*="Last"]').val() as string ?? "";
    profile.name = `${first} ${last}`.trim();
  }

  if (!profile.name) {
    // Pattern 2: Display-only fields
    profile.name = $(".name, .fullName, h1, h2").first().text().trim();
  }

  // Email
  profile.email =
    ($('input[name*="Email"], input[name*="email"]').val() as string) ??
    ($(".email, a[href^='mailto']").first().text().trim() || undefined);

  // Phone
  profile.phone =
    ($('input[name*="Phone"], input[name*="phone"]').val() as string) ??
    ($(".phone, .tel").first().text().trim() || undefined);

  // Address
  const addr1 = ($('input[name*="Address"], input[name*="address"]').val() as string) ?? "";
  const city = ($('input[name*="City"], input[name*="city"]').val() as string) ?? "";
  const state = ($('input[name*="State"], input[name*="state"], select[name*="State"]').val() as string) ?? "";
  const zip = ($('input[name*="Zip"], input[name*="zip"]').val() as string) ?? "";
  const addressParts = [addr1, city, state, zip].filter(Boolean);
  profile.address = addressParts.length > 0 ? addressParts.join(", ") : undefined;

  // Organizations
  const orgs: string[] = [];
  $(".organization, .org, select[name*='Org'] option[selected]").each((_, el) => {
    const text = $(el).text().trim();
    if (text) orgs.push(text);
  });
  if (orgs.length > 0) profile.organizations = orgs;

  // Sports
  const sports: string[] = [];
  $(".sport, select[name*='Sport'] option[selected], input[name*='Sport']:checked").each(
    (_, el) => {
      const text = $(el).text().trim() || ($(el).val() as string);
      if (text) sports.push(text);
    }
  );
  if (sports.length > 0) profile.sports = sports;

  // If we got no name, include raw text for debugging
  if (!profile.name) {
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    profile.name = `[Could not parse name. Page preview: ${bodyText.slice(0, 300)}]`;
  }

  return profile;
}
