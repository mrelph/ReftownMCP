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
    .describe("Year (e.g. 2025). Defaults to current year."),
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

  // Availability is under Schedules -> Availability
  // Exact URL needs discovery, common patterns:
  const params: Record<string, string> = {
    Month: String(month),
    Year: String(year),
  };

  // Try the most likely paths
  let $;
  try {
    $ = await client.get("availability.asp", params);
  } catch {
    try {
      $ = await client.get("events.asp", { ...params, Focus: "Availability" });
    } catch {
      $ = await client.get("default.asp", { ...params, Focus: "Availability" });
    }
  }

  const days: AvailabilityDay[] = [];

  // Parse availability calendar - typically a calendar grid or table
  // The exact structure needs discovery, but common patterns:

  // Pattern 1: Calendar table with day cells
  $("td.day, td.calDay, td[class*=day]").each((_, el) => {
    const dayNum = $!(el).find(".dayNum, .dayNumber").text().trim() ||
      $!(el).text().trim().match(/^\d{1,2}/)?.[0];

    if (!dayNum) return;

    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const classes = $!(el).attr("class") ?? "";
    const available = !classes.includes("unavail") && !classes.includes("blocked");
    const note = $!(el).find(".note, .comment").text().trim() || undefined;

    days.push({ date: dateStr, available, note });
  });

  // Pattern 2: List-based availability
  if (days.length === 0) {
    $("tr[class*=avail], .availability-row, .avail-entry").each((_, el) => {
      const dateText = $!(el).find("td:first-child, .date").text().trim();
      const statusText = $!(el).find("td:nth-child(2), .status").text().trim();
      const note = $!(el).find("td:nth-child(3), .note").text().trim() || undefined;

      if (dateText) {
        days.push({
          date: dateText,
          available: statusText.toLowerCase().includes("avail") && !statusText.toLowerCase().includes("unavail"),
          note,
        });
      }
    });
  }

  const rawPreview =
    days.length === 0
      ? $!("body").text().replace(/\s+/g, " ").trim().slice(0, 500)
      : undefined;

  return { days, rawPreview };
}

export async function setAvailabilityTool(
  client: RefTownClient,
  args: z.infer<typeof setAvailabilitySchema>
): Promise<{ success: boolean; message: string; updated: string[] }> {
  const updated: string[] = [];
  const errors: string[] = [];

  for (const entry of args.dates) {
    try {
      // First, navigate to the availability page for the correct month
      const [year, month] = entry.date.split("-").map(Number);

      const params: Record<string, string> = {
        Month: String(month),
        Year: String(year),
      };

      let $;
      try {
        $ = await client.get("availability.asp", params);
      } catch {
        $ = await client.get("events.asp", { ...params, Focus: "Availability" });
      }

      const hiddenFields = client.extractHiddenFields($);

      // POST the availability update
      // Exact field names need discovery
      const formData: Record<string, string> = {
        ...hiddenFields,
        Date: entry.date,
        Available: entry.available ? "1" : "0",
        Action: "SetAvailability",
      };
      if (entry.note) {
        formData["Note"] = entry.note;
        formData["Comment"] = entry.note;
      }

      await client.post("availability.asp", formData);
      updated.push(entry.date);
    } catch (error) {
      errors.push(
        `${entry.date}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (errors.length > 0) {
    return {
      success: updated.length > 0,
      message: `Updated ${updated.length}/${args.dates.length} dates. Errors: ${errors.join("; ")}`,
      updated,
    };
  }

  return {
    success: true,
    message: `Updated availability for ${updated.length} dates`,
    updated,
  };
}
