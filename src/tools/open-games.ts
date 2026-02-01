import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { OpenGamesResult } from "../types.js";
import { parseGameTable } from "../parsers/game-table.js";

export const searchOpenGamesSchema = z.object({
  zone: z
    .string()
    .optional()
    .describe("Comma-separated zone IDs for server-side filtering"),
  dateQualifier: z
    .enum([
      "From Today",
      "Next 7 Days",
      "Next 14 Days",
      "Next 30 Days",
      "This Month",
      "Next Month",
      "All Dates",
    ])
    .optional()
    .describe("Date range filter (default: server default, typically 'From Today')"),
  sport: z
    .string()
    .optional()
    .describe("Client-side substring filter on sport/league fields"),
});

export async function searchOpenGamesTool(
  client: RefTownClient,
  args: z.infer<typeof searchOpenGamesSchema>
): Promise<OpenGamesResult> {
  const params: Record<string, string> = {
    openonly: "1",
    AltSort: "Date/Location/Time",
  };

  if (args.zone) {
    params.Zone = args.zone;
  }
  if (args.dateQualifier) {
    params.DateQual = args.dateQualifier;
  }

  const $ = await client.get("games.asp", params);
  let games = parseGameTable($);

  const totalFound = games.length;

  // Client-side sport/league filter
  if (args.sport) {
    const filter = args.sport.toLowerCase();
    games = games.filter(
      (g) =>
        g.sport.toLowerCase().includes(filter) ||
        (g.league?.toLowerCase().includes(filter) ?? false)
    );
  }

  return {
    games,
    totalFound,
    filters: {
      zone: args.zone,
      dateQualifier: args.dateQualifier,
      sport: args.sport,
    },
  };
}
