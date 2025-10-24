// cli.ts
import { ToolExecutive, ToolDefinition } from "./agent/tools/executive";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as fs from "fs";

// Initialize with no policy for development mode
const toolExec = new ToolExecutive();

(async () => {
  const argv = yargs(hideBin(process.argv))
    .command(
      "list",
      "List all available tools",
      () => {},
      async () => {
        const defs: ToolDefinition[] = toolExec.getToolDefinitions();
        console.log(`\n🔧 Available Tools (${defs.length} total):\n`);

        defs.forEach((def) => {
          const params =
            Object.keys(def.parameters).length > 0
              ? Object.keys(def.parameters).join(", ")
              : "none";
          console.log(`📌 ${def.name}:`);
          console.log(`   ${def.description}`);
          console.log(`   Parameters: ${params}\n`);
        });
      },
    )
    .command(
      "run <tool> [args..]",
      "Run a tool with arguments",
      (y) => {
        y.positional("tool", {
          type: "string",
          describe: "Tool name",
        });
        y.positional("args", {
          type: "string",
          describe: "Tool arguments (key=value)",
        });
      },
      async (argv) => {
        const toolName = argv.tool as string;
        const argsObj: Record<string, any> = {};

        // Parse key=value arguments
        ((argv.args as string[]) || []).forEach((arg: string) => {
          const [k, v] = arg.split("=");
          // Try to parse JSON values
          try {
            argsObj[k] = JSON.parse(v);
          } catch {
            argsObj[k] = v; // Keep as string if not valid JSON
          }
        });

        try {
          console.log(`\n🚀 Running tool: ${toolName}`);
          console.log(`📋 Arguments:`, JSON.stringify(argsObj, null, 2));

          const steps = [{ tool: toolName, args: argsObj }];
          const results = await toolExec.executePlan(steps, "cli_session");

          results.forEach((res) => {
            if (res.success) {
              console.log(`\n✅ ${res.tool} completed in ${res.latencyMs}ms:`);
              console.log(JSON.stringify(res.output, null, 2));
            } else {
              console.error(
                `\n❌ ${res.tool} failed after ${res.latencyMs}ms:`,
              );
              console.error(res.error);
            }
          });
        } catch (err: any) {
          console.error("\n💥 Fatal CLI error:", err?.message || err);
        }
      },
    )
    // Memory-specific commands for easier testing
    .command(
      "memory:add <content> <type>",
      "Add a new memory",
      (y) => {
        y.positional("content", { type: "string", describe: "Memory content" });
        y.positional("type", {
          type: "string",
          describe:
            "Memory type (conversation|document|goal|reminder|journal|note|task)",
        });
        y.option("metadata", {
          type: "string",
          describe: "JSON metadata object",
        });
      },
      async (argv) => {
        const metadata = argv.metadata
          ? JSON.parse(argv.metadata as string)
          : undefined;

        const result = await toolExec.executePlan(
          [
            {
              tool: "add_memory",
              args: { content: argv.content, type: argv.type, metadata },
            },
          ],
          "cli_memory",
        );

        if (result[0].success) {
          console.log(`\n📝 Memory added successfully:`);
          console.log(JSON.stringify(result[0].output, null, 2));
        } else {
          console.error(`\n❌ Failed to add memory: ${result[0].error}`);
        }
      },
    )
    .command(
      "memory:search <query>",
      "Search memories by content",
      (y) => {
        y.positional("query", { type: "string", describe: "Search query" });
        y.option("type", { type: "string", describe: "Filter by memory type" });
        y.option("limit", {
          type: "number",
          default: 10,
          describe: "Number of results",
        });
      },
      async (argv) => {
        const result = await toolExec.executePlan(
          [
            {
              tool: "search_memory",
              args: { query: argv.query, type: argv.type, limit: argv.limit },
            },
          ],
          "cli_memory",
        );

        if (result[0].success) {
          const memories = result[0].output;
          console.log(`\n🔍 Found ${memories.length} memories:`);
          memories.forEach((mem: any, i: number) => {
            console.log(`\n${i + 1}. [${mem.type}] ${mem.id}`);
            console.log(
              `   ${mem.content.substring(0, 100)}${mem.content.length > 100 ? "..." : ""}`,
            );
            console.log(`   📅 ${mem.timestamp}`);
            if (mem.similarity)
              console.log(
                `   🎯 Similarity: ${(mem.similarity * 100).toFixed(1)}%`,
              );
          });
        } else {
          console.error(`\n❌ Search failed: ${result[0].error}`);
        }
      },
    )
    .command(
      "memory:list",
      "List recent memories",
      (y) => {
        y.option("type", { type: "string", describe: "Filter by memory type" });
        y.option("limit", {
          type: "number",
          default: 20,
          describe: "Number of memories",
        });
      },
      async (argv) => {
        const result = await toolExec.executePlan(
          [
            {
              tool: "list_memories",
              args: { type: argv.type, limit: argv.limit },
            },
          ],
          "cli_memory",
        );

        if (result[0].success) {
          const memories = result[0].output;
          console.log(`\n📚 Recent memories (${memories.length} shown):`);
          memories.forEach((mem: any, i: number) => {
            console.log(`\n${i + 1}. [${mem.type}] ${mem.id}`);
            console.log(`   ${mem.content}`);
            console.log(
              `   📅 ${mem.timestamp} ${mem.hasEmbedding ? "🧠" : "📝"}`,
            );
          });
        } else {
          console.error(`\n❌ List failed: ${result[0].error}`);
        }
      },
    )
    .command(
      "memory:stats",
      "Show memory system statistics",
      () => {},
      async () => {
        const result = await toolExec.executePlan(
          [
            {
              tool: "memory_stats",
              args: {},
            },
          ],
          "cli_memory",
        );

        if (result[0].success) {
          const stats = result[0].output;
          console.log(`\n📊 Memory System Statistics:`);
          console.log(`   Total memories: ${stats.totalMemories}`);
          console.log(`   With embeddings: ${stats.memoriesWithEmbeddings}`);
          console.log(
            `   Embedding service: ${stats.embeddingServiceAvailable ? "✅ Available" : "❌ Unavailable"}`,
          );
          console.log(`\n📈 By Type:`);
          Object.entries(stats.memoriesByType).forEach(([type, count]) => {
            if ((count as number) > 0) console.log(`   ${type}: ${count}`);
          });
          if (stats.oldestMemory)
            console.log(`\n📅 Oldest: ${stats.oldestMemory}`);
          if (stats.newestMemory)
            console.log(`📅 Newest: ${stats.newestMemory}`);
        } else {
          console.error(`\n❌ Stats failed: ${result[0].error}`);
        }
      },
    )
    .command(
      "memory:delete <id>",
      "Delete a memory by ID",
      (y) => {
        y.positional("id", { type: "string", describe: "Memory ID to delete" });
      },
      async (argv) => {
        const result = await toolExec.executePlan(
          [
            {
              tool: "delete_memory",
              args: { id: argv.id },
            },
          ],
          "cli_memory",
        );

        if (result[0].success) {
          console.log(`\n🗑️ Memory deleted: ${argv.id}`);
        } else {
          console.error(`\n❌ Delete failed: ${result[0].error}`);
        }
      },
    )
    .demandCommand()
    .help()
    .strict().argv;
})();
