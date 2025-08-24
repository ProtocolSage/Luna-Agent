import { existsSync, readFileSync } from "fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const outFile = pkg.main || "dist/bootstrap.cjs";

// Adjust these if your entry lives elsewhere
const candidates = [
  "src/bootstrap.ts",
  "src/bootstrap.js",
  "src/main.ts",
  "src/main.js"
];
const entry = candidates.find((f) => existsSync(f));
if (!entry) {
  console.error("No main entry found (tried: " + candidates.join(", ") + ").");
  process.exit(1);
}

await build({
  entryPoints: [entry],
  outfile: outFile,        // -> dist/bootstrap.cjs
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["electron", "@electron/*"],
});

console.log(`Built ${outFile} from ${entry}`);
