import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { AvailabilityDay } from "../types.js";

export const getAvailabilitySchema = z.object({
  month: z
    .number()
    .min(1)
    .max(12)
    .optional()
    .describe("Month (1-12). Defaults to current month."),
  year: z
    .number()
    .optional()
    .describe("Year (e.g. 2026). Defaults to current year."),
});

export const setAvailabilitySchema = z.object({
  dates: z
    .array(
      z.object({
        date: z
          .string()
          .describe("Date in YYYY-MM-DD format"),
        available: z.boolean().describe("true = available, false = unavailable"),
        note: z.string().optional().describe("Optional note for this date"),
      })
    )
    .describe("Array of date/availability entries to set"),
});

export async function getAvailabilityTool(
  client: RefTownClient,
  args: z.infer<typeof getAvailabilitySchema>
): Promise<{ days: AvailabilityDay[]; rawPreview?: string }> {
  const now = new Date();
  const month = args.month ?? now.getMonth() + 1;
  const year = args.year ?? now.getFullYear();

  // First fetch to discover OffRID from page links (needed for navigation)
  const params: Record<string, string> = {
    month: String(month),
    year: String(year),
  };

  // Try to get OffRID from the page if we don't have it yet
  let $ = await client.get("availability.asp", params);
  const offRidLink = $("a[href*='OffRID=']").first().attr("href") ?? "";
  const offRidMatch = offRidLink.match(/OffRID=(\d+)/i);
  if (offRidMatch) {
    params["OffRID"] = offRidMatch[1];
    $ = await client.get("availability.asp", params);
  }

  const days: AvailabilityDay[] = [];

  // Real RefTown HTML: table.subtable.availcal
  // Day cells: td.availcal or td.availcaltoday
  // Day number: div.availcal_date
  // Availability details: nested table.availdetails
  $("table.subtable.availcal td.availcal, table.subtable.availcal td.availcaltoday").each((_, cell) => {
    const dayNum = $(cell).find("div.availcal_date").text().trim();
    if (!dayNum || !/^\d{1,2}$/.test(dayNum)) return;

    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

    let available = false;
    let source: string | undefined;
    let timeRestriction: string | undefined;
    let hasGame = false;
    let gameLink: string | undefined;
    let note: string | undefined;

    // Check nested table.availdetails for availability info
    const detailsTable = $(cell).find("table.availdetails");
    if (detailsTable.length > 0) {
      detailsTable.find("tr").each((_, detailRow) => {
        const rowText = $(detailRow).text().trim();
        // Background color is in style attribute on the TR, e.g. style="background:#EEFFEE"
        const style = $(detailRow).attr("style") ?? "";
        const bgMatch = style.match(/background:\s*(#[0-9a-fA-F]+)/i);
        const bgColor = bgMatch?.[1]?.toUpperCase() ?? "";

        // #EEFFEE = fully available (green), #FFFFDD = restricted/partial (yellow)
        if (bgColor === "#EEFFEE" || bgColor === "#FFFFDD") {
          available = true;
        }

        if (rowText.toLowerCase().includes("available")) {
          available = true;
        }

        // Time restriction: TR rows with "From"/"To" + time value in separate TDs
        const tds = $(detailRow).find("td");
        const firstTd = tds.first().text().trim();
        const secondTd = tds.eq(1).text().trim();
        if (firstTd === "From" || firstTd === "To") {
          const parts: string[] = [];
          if (timeRestriction) parts.push(timeRestriction);
          parts.push(`${firstTd} ${secondTd}`);
          timeRestriction = parts.join(", ");
        }

        // Source: nested span.note_sm text like "Day-of-Week", "CHOA Date-Specific", "Global"
        if (rowText.includes("Source:")) {
          const sourceSpan = $(detailRow).find("span.note_sm").text().trim();
          if (sourceSpan) {
            source = sourceSpan;
          }
        }
      });
    }

    // Working indicator: div.working with game link
    const workingDiv = $(cell).find("div.working");
    if (workingDiv.length > 0) {
      hasGame = true;
      const workingLink = workingDiv.find("a").attr("href");
      if (workingLink) {
        gameLink = workingLink;
      }
    }

    days.push({
      date: dateStr,
      available,
      note,
      source,
      timeRestriction: timeRestriction || undefined,
      hasGame: hasGame || undefined,
      gameLink,
    });
  });

  const rawPreview =
    days.length === 0
      ? $("body").text().replace(/\s+/g, " ").trim().slice(0, 500)
      : undefined;

  return { days, rawPreview };
}

// TODO: setAvailability requires POSTing to jx_editavail.asp (AJAX endpoint).
// The form fields and expected parameters for that endpoint have not been
// discovered yet. This remains a stub until that page's structure is mapped.

export async function setAvailabilityTool(
  _client: RefTownClient,
  _args: z.infer<typeof setAvailabilitySchema>
): Promise<{ success: boolean; message: string; updated: string[] }> {
  return {
    success: false,
    message:
      "Stub: setAvailability not yet implemented. " +
      "The edit endpoint jx_editavail.asp form structure needs to be discovered first.",
    updated: [],
  };
}
