import { z } from "zod";
import { RefTownClient } from "../client.js";
import type { Game, ScheduleResult } from "../types.js";

export const getScheduleSchema = z.object({
  period: z
    .enum(["upcoming", "past", "all"])
    .optional()
    .describe("Which games to fetch: upcoming (default), past, or all"),
});

export const getGameDetailsSchema = z.object({
  gameId: z.string().describe("The game/event ID to get details for"),
});

export const acceptGameSchema = z.object({
  gameId: z.string().describe("The game/event ID to accept"),
});

export const declineGameSchema = z.object({
  gameId: z.string().describe("The game/event ID to decline"),
  reason: z.string().optional().describe("Optional reason for declining"),
});

export async function getScheduleTool(
  client: RefTownClient,
  args: z.infer<typeof getScheduleSchema>
): Promise<ScheduleResult> {
  // RefTown schedule page - the exact URL/params need discovery
  // Common patterns: events.asp, schedule.asp, or default.asp with schedule focus
  const $ = await client.get("events.asp");

  const games: Game[] = [];

  // Attempt to parse schedule table - structure will need adjustment after discovery
  $("table.schedule tr, table.grid tr, table tr").each((i, row) => {
    if (i === 0) return; // Skip header row

    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const game: Game = {
      id: $(row).attr("data-id") ?? $(cells[0]).find("a").attr("href")?.match(/id=(\d+)/i)?.[1] ?? `row-${i}`,
      date: $(cells[0]).text().trim(),
      time: $(cells[1]).text().trim(),
      sport: $(cells[2]).text().trim(),
      level: cells.length > 3 ? $(cells[3]).text().trim() : "",
      homeTeam: cells.length > 4 ? $(cells[4]).text().trim() : "",
      awayTeam: cells.length > 5 ? $(cells[5]).text().trim() : "",
      venue: cells.length > 6 ? $(cells[6]).text().trim() : "",
      position: cells.length > 7 ? $(cells[7]).text().trim() : "",
      status: cells.length > 8 ? $(cells[8]).text().trim() : "",
      crew: [],
    };

    games.push(game);
  });

  // If table parsing didn't find games, try alternative parsing
  if (games.length === 0) {
    // Some schedules use div-based layouts
    $(".event, .game, .assignment").each((i, el) => {
      const game: Game = {
        id: $(el).attr("data-id") ?? $(el).attr("id") ?? `item-${i}`,
        date: $(el).find(".date").text().trim(),
        time: $(el).find(".time").text().trim(),
        sport: $(el).find(".sport").text().trim(),
        level: $(el).find(".level").text().trim(),
        homeTeam: $(el).find(".home").text().trim(),
        awayTeam: $(el).find(".away, .visitor").text().trim(),
        venue: $(el).find(".venue, .location").text().trim(),
        position: $(el).find(".position, .role").text().trim(),
        status: $(el).find(".status").text().trim(),
        crew: [],
      };
      if (game.date || game.homeTeam) {
        games.push(game);
      }
    });
  }

  // If still no games found, return the page text for debugging
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
  // Exact endpoint needs discovery - likely events.asp?id=X or similar
  const $ = await client.get("events.asp", { id: args.gameId });

  const game: Game = {
    id: args.gameId,
    date: $(".date, [class*=date]").first().text().trim(),
    time: $(".time, [class*=time]").first().text().trim(),
    sport: $(".sport, [class*=sport]").first().text().trim(),
    level: $(".level, [class*=level]").first().text().trim(),
    homeTeam: $(".home, [class*=home]").first().text().trim(),
    awayTeam: $(".away, .visitor, [class*=away], [class*=visitor]").first().text().trim(),
    venue: $(".venue, .location, [class*=venue], [class*=location]").first().text().trim(),
    position: $(".position, .role, [class*=position]").first().text().trim(),
    status: $(".status, [class*=status]").first().text().trim(),
    crew: [],
    notes: $(".notes, [class*=notes]").first().text().trim() || undefined,
  };

  // Try to extract crew list
  $(".crew tr, .officials tr, table tr").each((i, row) => {
    if (i === 0) return;
    const cells = $(row).find("td");
    if (cells.length >= 2) {
      game.crew.push({
        name: $(cells[0]).text().trim(),
        position: $(cells[1]).text().trim(),
        phone: cells.length > 2 ? $(cells[2]).text().trim() : undefined,
        email: cells.length > 3 ? $(cells[3]).text().trim() : undefined,
      });
    }
  });

  return game;
}

export async function acceptGameTool(
  client: RefTownClient,
  args: z.infer<typeof acceptGameSchema>
): Promise<{ success: boolean; message: string }> {
  try {
    // First, get the game page to find the accept form/hidden fields
    const $ = await client.get("events.asp", { id: args.gameId });
    const hiddenFields = client.extractHiddenFields($);

    // POST the acceptance - exact field names need discovery
    const formData: Record<string, string> = {
      ...hiddenFields,
      EventID: args.gameId,
      Action: "Accept",
    };

    const result$ = await client.post("events.asp", formData);
    const responseText = result$("body").text();

    if (
      responseText.includes("accepted") ||
      responseText.includes("confirmed") ||
      responseText.includes("success")
    ) {
      return { success: true, message: `Game ${args.gameId} accepted` };
    }

    return {
      success: false,
      message: `Accept may not have worked. Page content: ${responseText.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to accept game: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function declineGameTool(
  client: RefTownClient,
  args: z.infer<typeof declineGameSchema>
): Promise<{ success: boolean; message: string }> {
  try {
    const $ = await client.get("events.asp", { id: args.gameId });
    const hiddenFields = client.extractHiddenFields($);

    const formData: Record<string, string> = {
      ...hiddenFields,
      EventID: args.gameId,
      Action: "Decline",
    };
    if (args.reason) {
      formData["Reason"] = args.reason;
      formData["DeclineReason"] = args.reason;
    }

    const result$ = await client.post("events.asp", formData);
    const responseText = result$("body").text();

    if (
      responseText.includes("declined") ||
      responseText.includes("success") ||
      responseText.includes("removed")
    ) {
      return { success: true, message: `Game ${args.gameId} declined` };
    }

    return {
      success: false,
      message: `Decline may not have worked. Page content: ${responseText.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to decline game: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
