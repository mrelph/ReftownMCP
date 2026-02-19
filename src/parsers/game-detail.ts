import type { CheerioAPI } from "cheerio";

export interface GameDetailInfo {
  officialId?: string;
  assignmentRID?: string;
  selfAssignLinks: SelfAssignLink[];
}

export interface SelfAssignLink {
  url: string;
  duty: string;
  position: string;
}

/**
 * Parse the games.asp?RID=X detail page to extract:
 * - Official ID from the hidden form field
 * - Assignment RID from finance.asp links (user's assignment on this game)
 * - Self-assign (request) links for open positions
 */
export function parseGameDetailPage(
  $: CheerioAPI,
  _gameId: string
): GameDetailInfo {
  const result: GameDetailInfo = {
    selfAssignLinks: [],
  };

  // Extract Official ID from hidden form field
  const officialInput = $('input[name="Official"]');
  if (officialInput.length) {
    result.officialId = officialInput.attr("value");
  }

  // Extract assignment RID from finance.asp?Focus=FIA&RID=NNNNN links
  // These appear next to the current user's assignment row
  $('a[href*="finance.asp?Focus=FIA&RID="]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/RID=(\d+)/);
    if (match) {
      result.assignmentRID = match[1];
    }
  });

  // Extract self-assign (request) links for open game positions
  $('a[href*="games_selfassign.asp"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const dutyMatch = href.match(/Duty=(\d+)/);
    // Get position label from the closest row
    const row = $(el).closest("tr");
    const positionCell = row.find("td").first();
    const position = positionCell.text().trim().replace(/:$/, "");

    result.selfAssignLinks.push({
      url: href,
      duty: dutyMatch?.[1] ?? "1",
      position,
    });
  });

  return result;
}
