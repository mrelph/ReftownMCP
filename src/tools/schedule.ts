import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { Game, ScheduleResult } from "../types.js";
import { parseGameTable } from "../parsers/game-table.js";

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

// TODO: mygames.asp is read-only ("This page can only be used to view the games").
// Accept/decline must go through games.asp?RID=X which hasn't been fully discovered.
// These remain stubs until the games.asp form structure is mapped.

export async function acceptGameTool(
  _client: RefTownClient,
  args: z.infer<typeof acceptGameSchema>
): Promise<{ success: boolean; message: string }> {
  return {
    success: false,
    message: `Stub: accept for game ${args.gameId} not yet implemented. ` +
      "The accept form on games.asp?RID=X needs to be discovered first.",
  };
}

export async function declineGameTool(
  _client: RefTownClient,
  args: z.infer<typeof declineGameSchema>
): Promise<{ success: boolean; message: string }> {
  return {
    success: false,
    message: `Stub: decline for game ${args.gameId} not yet implemented. ` +
      "The decline form on games.asp?RID=X needs to be discovered first.",
  };
}
