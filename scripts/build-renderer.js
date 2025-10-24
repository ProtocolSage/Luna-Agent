// ===============================================================================
// 🚀 PRODUCTION RENDERER BUILD - esbuild
// ===============================================================================
// This is the SINGLE SOURCE OF TRUTH for production renderer builds
// Used by: npm run build:renderer
// Outputs: dist/app/renderer/ (ESM format for Electron)
// Development builds use: webpack.dev.js (webpack-dev-server)
// ===============================================================================

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFileSync(src, dest) {
  ensureDirSync(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirSync(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  ensureDirSync(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      copyFileSync(srcPath, destPath);
    }
  }
}

async function buildRenderer() {
  try {
    console.log("🔨 Building renderer with esbuild (ESM format)...");

    const isProd = process.env.NODE_ENV === "production";

    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, "../app/renderer/renderer.tsx")],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2020",
      outfile: path.join(__dirname, "../dist/app/renderer/renderer.js"),
      loader: {
        ".ts": "ts",
        ".tsx": "tsx",
        ".js": "jsx",
        ".jsx": "jsx",
        ".css": "css",
      },
      define: {
        "process.env.NODE_ENV": '"production"',
        "process.env.REACT_APP_API_URL": '"http://localhost:3000"',
        "process.env.SENTRY_DSN": '""',
        "process.env.ERROR_REPORTING_ENDPOINT": '""',
        global: "window",
      },
      minify: process.env.NODE_ENV === "production",
      drop: isProd ? ["console", "debugger"] : [],
      legalComments: isProd ? "none" : "eof",
      sourcemap: !isProd,
      // Don't bundle electron and native modules - they're provided by Electron runtime
      external: ["electron", "better-sqlite3", "bindings"],
      logLevel: "info",
      metafile: false,
    });

    console.log("✅ Renderer built successfully with esbuild (ESM format)");

    // Copy static assets into dist/app/renderer
    const srcRoot = path.join(__dirname, "../app/renderer");
    const distRoot = path.join(__dirname, "../dist/app/renderer");

    // 1) index.html
    const srcIndex = path.join(srcRoot, "index.html");
    const distIndex = path.join(distRoot, "index.html");
    if (fs.existsSync(srcIndex)) {
      copyFileSync(srcIndex, distIndex);
      console.log("✅ Copied index.html");
    } else {
      console.warn("⚠️  app/renderer/index.html not found");
    }

    // 2) styles directory (optional)
    const srcStyles = path.join(srcRoot, "styles");
    const distStyles = path.join(distRoot, "styles");
    if (fs.existsSync(srcStyles)) {
      copyDirSync(srcStyles, distStyles);
      console.log("✅ Copied styles/ directory");
    }

    // 3) public/assets directory (optional)
    const srcAssets = path.join(srcRoot, "public/assets");
    const distAssets = path.join(distRoot, "assets");
    if (fs.existsSync(srcAssets)) {
      copyDirSync(srcAssets, distAssets);
      console.log("✅ Copied public assets");
    }

    // 4) Deterministic VAD assets - fail fast if missing
    console.log("🎙️  Copying VAD assets...");
    ensureDirSync(path.join(distRoot, "assets"));

    const requiredVadAssets = [
      [
        "@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
        "assets/vad.worklet.bundle.min.js",
      ],
      ["@ricky0123/vad-web/dist/silero_vad_v5.onnx", "assets/silero_vad.onnx"],
      [
        "@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
        "assets/silero_vad_legacy.onnx",
      ],
    ];

    for (const [srcRel, destRel] of requiredVadAssets) {
      const src = path.join(__dirname, "../node_modules", srcRel);
      const dest = path.join(distRoot, destRel);

      if (!fs.existsSync(src)) {
        throw new Error(
          `Missing VAD asset: ${src}\nTry: npm install @ricky0123/vad-web`,
        );
      }

      copyFileSync(src, dest);
      console.log(`✅ Copied VAD asset: ${path.basename(dest)}`);
    }

    // 5) Wake-word assets from project root assets/ (if they exist)
    const projectAssetsDir = path.join(__dirname, "../assets");
    if (fs.existsSync(projectAssetsDir)) {
      const wakeWordDest = path.join(distRoot, "assets");
      copyDirSync(projectAssetsDir, wakeWordDest);
      console.log("✅ Copied wake-word assets from project root");
    }

    // Ensure CSS is linked in copied index.html
    const indexPath = distIndex;
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, "utf8");
      if (!html.includes("renderer.css")) {
        // insert stylesheet link before closing head or after opening head
        html = html.replace(
          /<head>([\s\S]*?)<\/head>/i,
          (m, inner) =>
            `<head>${inner}\n    <link rel="stylesheet" href="renderer.css">\n  </head>`,
        );
        fs.writeFileSync(indexPath, html);
        console.log("✅ Ensured renderer.css is linked in index.html");
      }
    }

    // Ensure index.html uses ESM script loading
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, "utf8");
      // Update script tag to use type="module" for ESM (match opening and closing tags)
      html = html.replace(
        /<script([^>]*?)src="[^"]*renderer\.js"([^>]*?)>(<\/script>)?/g,
        '<script type="module" src="./renderer.js"></script>',
      );
      fs.writeFileSync(indexPath, html);
      console.log("✅ Ensured ESM script loading in index.html");
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

buildRenderer();
