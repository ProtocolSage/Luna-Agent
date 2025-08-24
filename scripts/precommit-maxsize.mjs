import { statSync } from "fs";
import { execSync } from "child_process";

const MAX = 50 * 1024 * 1024; // 50 MB

let files = [];
try {
  files = execSync("git diff --cached --name-only", { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
} catch (e) {
  // If git isn't available for some reason, skip rather than breaking commits
  process.exit(0);
}

const tooBig = [];
for (const f of files) {
  try {
    const s = statSync(f);
    if (s.isFile() && s.size > MAX) tooBig.push([f, s.size]);
  } catch {
    // ignore missing files
  }
}

if (tooBig.length) {
  console.error(
    "\u274c Blocked large files (>50MB):\n" +
      tooBig.map(([f, s]) => ` - ${f} (${(s / 1048576).toFixed(1)} MB)`).join("\n")
  );
  process.exit(1);
}
