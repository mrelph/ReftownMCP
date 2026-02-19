import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { OpenGamesResult } from "../types.js";
import { parseGameTable } from "../parsers/game-table.js";
import { parseGameDetailPage } from "../parsers/game-detail.js";

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

export const requestGameSchema = z.object({
  gameId: z.string().describe("The game RID to request assignment on"),
  duty: z
    .string()
    .optional()
    .describe(
      "The duty/position number to request (e.g. '1' for first open slot). " +
        "If omitted, requests the first available open position."
    ),
});

export async function requestGameTool(
  client: RefTownClient,
  args: z.infer<typeof requestGameSchema>
): Promise<{ success: boolean; message: string }> {
  // Step 1: Load the game detail page to find self-assign links
  const $ = await client.get("games.asp", { RID: args.gameId });
  const detail = parseGameDetailPage($, args.gameId);

  if (detail.selfAssignLinks.length === 0) {
    return {
      success: false,
      message: `No open positions available to request on game ${args.gameId}. ` +
        "The game may not be self-assignable or all positions are filled.",
    };
  }

  // Pick the requested duty or the first available
  let link = detail.selfAssignLinks[0];
  if (args.duty) {
    const match = detail.selfAssignLinks.find((l) => l.duty === args.duty);
    if (!match) {
      const available = detail.selfAssignLinks
        .map((l) => `${l.duty} (${l.position})`)
        .join(", ");
      return {
        success: false,
        message: `Duty ${args.duty} not available. Open positions: ${available}`,
      };
    }
    link = match;
  }

  // Step 2: GET the self-assign confirmation page (validates hash)
  const confirm$ = await client.get(link.url);
  const confirmBody = confirm$("body").text().replace(/\s+/g, " ").trim();

  // Check that we got the confirmation page
  if (!confirmBody.includes("Self-Assignment") && !confirmBody.includes("Continue")) {
    return {
      success: false,
      message: `Unexpected self-assign page. Response: ${confirmBody.slice(0, 300)}`,
    };
  }

  // Step 3: Submit the confirmation form
  // The form submits via GET with: RID, OGAct=1, SelDuty_{gameId}={duty}, NoMenu=1, ConfirmLinkSet=Continue
  const result$ = await client.get("games_selfassign.asp", {
    RID: args.gameId,
    OGAct: "1",
    [`SelDuty_${args.gameId}`]: link.duty,
    NoMenu: "1",
    ConfirmLinkSet: "Continue",
  });
  const resultBody = result$("body").text().replace(/\s+/g, " ").trim();

  if (
    resultBody.includes("error") ||
    resultBody.includes("Error") ||
    resultBody.includes("not available")
  ) {
    return {
      success: false,
      message: `Request may have failed. Response: ${resultBody.slice(0, 300)}`,
    };
  }

  return {
    success: true,
    message: `Requested ${link.position || "open position"} on game ${args.gameId}.`,
  };
}
