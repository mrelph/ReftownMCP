import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { CalendarFeed } from "../types.js";

export const getCalendarFeedUrlSchema = z.object({});

export async function getCalendarFeedUrlTool(
  client: RefTownClient
): Promise<CalendarFeed> {
  // The iCal feed URL is available at profile.asp?Focus=ShowPAK
  const $ = await client.get("profile.asp", { Focus: "ShowPAK" });

  // Look for iCal/webcal URLs on the page
  let url = "";

  // Pattern 1: Link element with webcal/ical href
  $("a[href*='webcal'], a[href*='ical'], a[href*='.ics']").each((_, el) => {
    if (!url) {
      url = $(el).attr("href") ?? "";
    }
  });

  // Pattern 2: Input field containing the URL
  if (!url) {
    $("input[value*='webcal'], input[value*='ical'], input[value*='.ics']").each(
      (_, el) => {
        if (!url) {
          url = ($(el).val() as string) ?? "";
        }
      }
    );
  }

  // Pattern 3: Text content containing URL
  if (!url) {
    const bodyText = $("body").text();
    const urlMatch = bodyText.match(
      /(webcal:\/\/[^\s<"']+|https?:\/\/[^\s<"']*\.ics[^\s<"']*)/i
    );
    if (urlMatch) {
      url = urlMatch[1];
    }
  }

  // Pattern 4: Look for PAK (Personal Access Key) and construct URL
  if (!url) {
    const pakMatch = $("body").text().match(/PAK[:\s]*([A-Za-z0-9_-]+)/i);
    const pakInput = $('input[name*="PAK"], input[name*="pak"]').val() as string;
    const pak = pakInput ?? pakMatch?.[1];
    if (pak) {
      url = `webcal://www.reftown.com/ical.asp?pak=${pak}`;
    }
  }

  if (!url) {
    const bodyPreview = $("body").text().replace(/\s+/g, " ").trim().slice(0, 500);
    return {
      url: "",
      description: `Could not find calendar feed URL. Page preview: ${bodyPreview}`,
    };
  }

  return {
    url,
    description:
      "iCal subscription URL for your RefTown schedule. Add this to Google Calendar, Apple Calendar, or Outlook.",
  };
}
