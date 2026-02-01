import { RefTownClient } from "../client.js";
import type { CalendarFeedEntry, CalendarFeedResult } from "../types.js";

export async function getCalendarFeedUrlTool(
  client: RefTownClient
): Promise<CalendarFeedResult> {
  const $ = await client.get("profile.asp", { Focus: "ShowPAK" });

  const feeds: CalendarFeedEntry[] = [];

  // Real RefTown HTML has 3 tab panes with different feed scopes:
  //   div#TabsX-1-0 → Games + Events
  //   div#TabsX-1-2 → Games only
  //   div#TabsX-1-4 → Events only
  const tabScopes: { selector: string; scope: CalendarFeedEntry["scope"] }[] = [
    { selector: "div#TabsX-1-0", scope: "games+events" },
    { selector: "div#TabsX-1-2", scope: "games" },
    { selector: "div#TabsX-1-4", scope: "events" },
  ];

  for (const { selector, scope } of tabScopes) {
    const tab = $(selector);
    if (tab.length === 0) continue;

    // webcal:// link
    const webcalLink = tab.find('a[href*="webcal"]').first().attr("href") ?? "";
    // HTTPS variant (vsend.asp link)
    const httpsLink = tab.find('a[href^="https"][href*="vsend.asp"]').first().attr("href") ??
      tab.find('a[href*="vsend.asp"]').first().attr("href") ?? "";

    if (webcalLink || httpsLink) {
      feeds.push({
        url: webcalLink || httpsLink,
        httpsUrl: httpsLink || undefined,
        scope,
      });
    }
  }

  // Fallback: if tab-based extraction found nothing, try any webcal link on the page
  if (feeds.length === 0) {
    const anyWebcal = $('a[href*="webcal"]').first().attr("href") ?? "";
    const anyHttps = $('a[href*="vsend.asp"]').first().attr("href") ?? "";
    if (anyWebcal || anyHttps) {
      feeds.push({
        url: anyWebcal || anyHttps,
        httpsUrl: anyHttps || undefined,
        scope: "games+events",
      });
    }
  }

  if (feeds.length === 0) {
    return { feeds: [] };
  }

  return { feeds };
}
