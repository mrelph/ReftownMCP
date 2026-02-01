import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { AuthManager } from "./auth.js";
import { RefTownClient } from "./client.js";
import { loginTool } from "./tools/login.js";
import {
  getScheduleTool,
  getScheduleSchema,
  getGameDetailsTool,
  getGameDetailsSchema,
  acceptGameTool,
  acceptGameSchema,
  declineGameTool,
  declineGameSchema,
} from "./tools/schedule.js";
import {
  getAvailabilityTool,
  getAvailabilitySchema,
  setAvailabilityTool,
  setAvailabilitySchema,
} from "./tools/availability.js";
import { getContactsTool, getContactsSchema } from "./tools/contacts.js";
import { getProfileTool } from "./tools/profile.js";
import { getCalendarFeedUrlTool } from "./tools/calendar.js";

const config = loadConfig();
const auth = new AuthManager(config);
const client = new RefTownClient(config, auth);

const server = new McpServer({
  name: "reftown",
  version: "0.1.0",
});

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

// --- Tool Registrations ---

server.registerTool("login", {
  description:
    "Log in to RefTown. Call this before using other tools, or it will auto-login as needed.",
}, async () => {
  try {
    const result = await loginTool(client);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool("get_schedule", {
  description:
    "Fetch your upcoming (or past) game assignments from RefTown.",
  inputSchema: getScheduleSchema.shape,
}, async (args) => {
  try {
    const result = await getScheduleTool(client, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool("get_game_details", {
  description: "Get detailed information about a specific game assignment.",
  inputSchema: getGameDetailsSchema.shape,
}, async (args) => {
  try {
    const result = await getGameDetailsTool(client, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool("accept_game", {
  description: "Accept a game assignment. (Not yet implemented — stub.)",
  inputSchema: acceptGameSchema.shape,
}, async (args) => {
  try {
    const result = await acceptGameTool(client, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool("decline_game", {
  description: "Decline a game assignment, with an optional reason. (Not yet implemented — stub.)",
  inputSchema: declineGameSchema.shape,
}, async (args) => {
  try {
    const result = await declineGameTool(client, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool("get_availability", {
  description:
    "View your availability calendar for a given month/year.",
  inputSchema: getAvailabilitySchema.shape,
}, async (args) => {
  try {
    const result = await getAvailabilityTool(client, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool("set_availability", {
  description:
    "Update your availability for one or more dates. (Not yet implemented — stub.)",
  inputSchema: setAvailabilitySchema.shape,
}, async (args) => {
  try {
    const result = await setAvailabilityTool(client, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool("get_contacts", {
  description:
    "Fetch official/crew contact information. Optionally filter by name.",
  inputSchema: getContactsSchema.shape,
}, async (args) => {
  try {
    const result = await getContactsTool(client, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool("get_profile", {
  description: "View your RefTown official profile.",
}, async () => {
  try {
    const result = await getProfileTool(client);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool("get_calendar_feed_url", {
  description:
    "Get your iCal calendar subscription URLs (games+events, games only, events only) for syncing RefTown to your calendar app.",
}, async () => {
  try {
    const result = await getCalendarFeedUrlTool(client);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return errorResult(error);
  }
});

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
