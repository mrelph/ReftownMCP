import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { Game, ScheduleResult } from "../types.js";
import { parseGameTable } from "../parsers/game-table.js";
import { parseGameDetailPage } from "../parsers/game-detail.js";

export const getScheduleSchema = z.object({
  period: z
    .enum(["upcoming", "past", "all"])
    .optional()
    .describe("Which games to fetch: upcoming (default), past, or all"),
});

export const getGameDetailsSchema = z.object({
  gameId: z.string().describe("The game RID (e.g. '12345' from games.asp?RID=12345)"),
});

export const acceptGameSchema = z.object({
  gameId: z.string().describe("The game RID to accept"),
});

export const declineGameSchema = z.object({
  gameId: z.string().describe("The game RID to decline"),
  reason: z.string().optional().describe("Optional reason for declining"),
});

export async function getScheduleTool(
  client: RefTownClient,
  args: z.infer<typeof getScheduleSchema>
): Promise<ScheduleResult> {
  const $ = await client.get("mygames.asp");
  const games = parseGameTable($);

  if (games.length === 0) {
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    return {
      games: [],
      period: `No games parsed. Page content preview: ${bodyText.slice(0, 500)}`,
    };
  }

  return { games, period: args.period ?? "upcoming" };
}

export async function getGameDetailsTool(
  client: RefTownClient,
  args: z.infer<typeof getGameDetailsSchema>
): Promise<Game> {
  // TODO: games.asp detail page HTML structure not yet discovered.
  // Fetching games.asp?RID=X and extracting what we can.
  const $ = await client.get("games.asp", { RID: args.gameId });

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  const game: Game = {
    id: args.gameId,
    date: "",
    time: "",
    sport: "",
    level: "",
    homeTeam: "",
    awayTeam: "",
    venue: "",
    position: "",
    status: "",
    crew: [],
    comments: bodyText.slice(0, 1000) || undefined,
  };

  // Try to extract basic info from whatever structure games.asp provides
  const head = $("div.head1md, div.head1, h1, h2").first().text().trim();
  if (head) {
    game.comments = `Page heading: ${head}. ${game.comments}`;
  }

  return game;
}

export async function acceptGameTool(
  client: RefTownClient,
  args: z.infer<typeof acceptGameSchema>
): Promise<{ success: boolean; message: string }> {
  // Step 1: Load the game detail page to extract form fields
  const $ = await client.get("games.asp", { RID: args.gameId });
  const detail = parseGameDetailPage($, args.gameId);

  if (!detail.officialId) {
    return { success: false, message: "Could not find Official ID on game page. Are you logged in?" };
  }
  if (!detail.assignmentRID) {
    return { success: false, message: `No assignment found for you on game ${args.gameId}. You may not be assigned to this game.` };
  }

  // Step 2: POST the accept form
  const formData: Record<string, string> = {
    Official: detail.officialId,
    Accept: "1",
    NoMenu: "0",
    MapEn: "0",
    NumGames: "25",
    xAction: "",
    hRID: args.gameId,
    [detail.assignmentRID]: "Y",
  };

  const result$ = await client.post("games.asp", formData);
  const bodyText = result$("body").text().replace(/\s+/g, " ").trim();

  // Check for success indicators
  if (bodyText.includes("No games found") || bodyText.includes(args.gameId)) {
    return { success: true, message: `Game ${args.gameId} accepted successfully.` };
  }
  if (bodyText.includes("error") || bodyText.includes("Error")) {
    return { success: false, message: `Accept may have failed. Response: ${bodyText.slice(0, 300)}` };
  }

  return { success: true, message: `Accept submitted for game ${args.gameId}.` };
}

export async function declineGameTool(
  client: RefTownClient,
  args: z.infer<typeof declineGameSchema>
): Promise<{ success: boolean; message: string }> {
  // Step 1: Load the game detail page to extract form fields
  const $ = await client.get("games.asp", { RID: args.gameId });
  const detail = parseGameDetailPage($, args.gameId);

  if (!detail.officialId) {
    return { success: false, message: "Could not find Official ID on game page. Are you logged in?" };
  }
  if (!detail.assignmentRID) {
    return { success: false, message: `No assignment found for you on game ${args.gameId}. You may not be assigned to this game.` };
  }

  const reason = args.reason ?? "Declining assignment";

  // Step 2: POST the decline form
  const formData: Record<string, string> = {
    Official: detail.officialId,
    Accept: "1",
    NoMenu: "0",
    MapEn: "0",
    NumGames: "25",
    xAction: "",
    hRID: args.gameId,
    [detail.assignmentRID]: "N",
    [`R${detail.assignmentRID}`]: reason,
  };

  const result$ = await client.post("games.asp", formData);
  const bodyText = result$("body").text().replace(/\s+/g, " ").trim();

  if (bodyText.includes("error") || bodyText.includes("Error")) {
    return { success: false, message: `Decline may have failed. Response: ${bodyText.slice(0, 300)}` };
  }

  return { success: true, message: `Game ${args.gameId} declined.` };
}
