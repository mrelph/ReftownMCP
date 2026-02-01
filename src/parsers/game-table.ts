import type { CheerioAPI } from "cheerio";
import type { Game, CrewMember } from "../types.js";

/**
 * Parse game rows from a RefTown table.subtable.floatheader.
 * Shared between mygames.asp (schedule) and games.asp?openonly=1 (open games).
 */
export function parseGameTable($: CheerioAPI): Game[] {
  const games: Game[] = [];

  // Real RefTown HTML: table.subtable.floatheader with tr.game rows
  // Each row has 6 columns:
  //   0: Org (B tag) + Game ID (link games.asp?RID=NNNNN)
  //   1: Day/Date/Time (BR-separated: Sun, 2/1/2026, 1:00 PM)
  //   2: Sport/League/Type/Level (BR-separated)
  //   3: Location nested table (@: venue, H: home, V: visitor)
  //   4: Crew nested table.subtablec (header=crew type, tr.note=position+name)
  //   5: Comments (div.gamecom) + distance from nested table
  $("table.subtable.floatheader tr.game").each((_, row) => {
    const cells = $(row).find("> td");
    if (cells.length < 6) return;

    // Column 0: Organization + Game ID
    const col0 = $(cells[0]);
    const organization = col0.find("B").first().text().trim();
    const gameLink = col0.find("a[href*='games.asp']").attr("href") ?? "";
    const ridMatch = gameLink.match(/RID=(\d+)/i);
    const id = ridMatch?.[1] ?? "";

    // Column 1: Day / Date / Time (BR-separated text nodes)
    const col1 = $(cells[1]);
    const col1Html = col1.html() ?? "";
    const dateTimeParts = col1Html
      .split(/<br\s*\/?>/i)
      .map((s) => s.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);
    const day = dateTimeParts[0] ?? "";
    const date = dateTimeParts[1] ?? "";
    const time = dateTimeParts[2] ?? "";

    // Column 2: Sport / League / Type / Level (BR-separated)
    const col2 = $(cells[2]);
    const col2Html = col2.html() ?? "";
    const sportParts = col2Html
      .split(/<br\s*\/?>/i)
      .map((s) => s.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);
    const sport = sportParts[0] ?? "";
    const league = sportParts[1] ?? "";
    const type = sportParts[2] ?? "";
    const level = sportParts[3] ?? "";

    // Column 3: Location nested table — @: venue, H: home, V: visitor
    const col3 = $(cells[3]);
    let venue = "";
    let homeTeam = "";
    let awayTeam = "";
    col3.find("tr").each((_, locRow) => {
      const rowText = $(locRow).text().trim();
      if (rowText.startsWith("@:")) {
        venue = $(locRow).find("B").text().trim() || rowText.replace(/^@:\s*/, "");
      } else if (rowText.startsWith("H:")) {
        homeTeam = rowText.replace(/^H:\s*/, "").trim();
      } else if (rowText.startsWith("V:")) {
        awayTeam = rowText.replace(/^V:\s*/, "").trim();
      }
    });

    // Column 4: Crew nested table.subtablec
    const col4 = $(cells[4]);
    const crewType = col4.find("table.subtablec tr").first().text().trim();
    const crew: CrewMember[] = [];
    col4.find("table.subtablec tr.note").each((_, crewRow) => {
      const crewCells = $(crewRow).find("td");
      // Cells: [0]=spacer, [1]=position (e.g. "Lineprsn 1:"), [2]=name, [3]=status icon
      const position = $(crewCells[1]).text().trim().replace(/:$/, "");
      const nameEl = $(crewCells[2]);
      const name = nameEl.text().trim();
      const isCurrentUser = nameEl.find("span.ongame").length > 0;
      if (name) {
        crew.push({ name, position, isCurrentUser: isCurrentUser || undefined });
      }
    });

    // Assignment status from div.gameacc
    const assignmentStatus = col4.find("div.gameacc").text().trim() || undefined;

    // Column 5: Comments + distance
    const col5 = $(cells[5]);
    const comments = col5.find("div.gamecom").text().trim() || undefined;
    const distance = col5.find("table td.right").text().trim() || undefined;

    const game: Game = {
      id,
      date,
      time,
      day: day || undefined,
      sport,
      league: league || undefined,
      type: type || undefined,
      level,
      homeTeam,
      awayTeam,
      venue,
      position: crew.find((c) => c.isCurrentUser)?.position ?? "",
      status: assignmentStatus ?? "",
      organization: organization || undefined,
      crewType: crewType || undefined,
      distance: distance || undefined,
      assignmentStatus,
      crew,
      comments,
    };

    games.push(game);
  });

  return games;
}
