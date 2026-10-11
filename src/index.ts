#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
