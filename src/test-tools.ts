import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  console.log("Starting MCP server and connecting...\n");

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/server.ts"],
    env: {
      ...process.env,
    } as Record<string, string>,
  });

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  console.log("Connected. Listing tools...\n");
  const tools = await client.listTools();
  console.log(`Available tools: ${tools.tools.map((t) => t.name).join(", ")}\n`);

  // Test each read-only tool
  const tests: { name: string; args?: Record<string, unknown> }[] = [
    { name: "login" },
    { name: "get_schedule", args: { period: "upcoming" } },
    { name: "get_availability" },
    { name: "get_contacts" },
    { name: "get_profile" },
    { name: "get_calendar_feed_url" },
    { name: "search_open_games", args: { sport: "CDN" } },
  ];

  for (const test of tests) {
    console.log(`--- ${test.name} ---`);
    try {
      const result = await client.callTool({
        name: test.name,
        arguments: test.args ?? {},
      });
      for (const content of result.content as Array<{ type: string; text: string }>) {
        if (content.type === "text") {
          // Truncate long output
          const text = content.text;
          if (text.length > 1500) {
            console.log(text.slice(0, 1500) + "\n... (truncated)");
          } else {
            console.log(text);
          }
        }
      }
      if (result.isError) {
        console.log("  ^ isError = true");
      }
    } catch (error) {
      console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log();
  }

  console.log("All tests complete.");
  await client.close();
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
