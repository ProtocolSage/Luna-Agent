#!/usr/bin/env node
/**
 * Security Scanner for Build Artifacts
 *
 * Scans bundled files for:
 * - API keys and secrets
 * - Environment variables
 * - Private keys
 * - Sensitive patterns
 *
 * Exit codes:
 * 0 - No secrets found (pass)
 * 1 - Secrets detected (fail)
 * 2 - Scanner error
 */

const fs = require("fs");
const path = require("path");

// Secret patterns to detect
const SECRET_PATTERNS = [
  // API Keys
  {
    name: "OpenAI API Key",
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    severity: "CRITICAL",
  },
  {
    name: "Anthropic API Key",
    pattern: /sk-ant-[a-zA-Z0-9-]{20,}/g,
    severity: "CRITICAL",
  },
  {
    name: "ElevenLabs API Key",
    pattern: /[a-f0-9]{32}/g,
    severity: "HIGH",
    context: "ELEVEN",
  },
  {
    name: "Picovoice Access Key",
    pattern: /[A-Za-z0-9+/]{88}==/g,
    severity: "HIGH",
    context: "PICOVOICE",
  },

  // Generic secret patterns
  {
    name: "Generic API Key",
    pattern: /api[_-]?key["\s:=]+["']?[a-zA-Z0-9_-]{20,}["']?/gi,
    severity: "HIGH",
  },
  {
    name: "Bearer Token",
    pattern: /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
    severity: "HIGH",
  },
  { name: "AWS Key", pattern: /AKIA[0-9A-Z]{16}/g, severity: "CRITICAL" },
  {
    name: "GitHub Token",
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    severity: "CRITICAL",
  },

  // Private keys
  {
    name: "RSA Private Key",
    pattern: /-----BEGIN (RSA )?PRIVATE KEY-----/g,
    severity: "CRITICAL",
  },
  {
    name: "SSH Key",
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: "CRITICAL",
  },

  // Environment variable leaks
  {
    name: "Hardcoded Password",
    pattern: /password["\s:=]+["'][^"'\s]{8,}["']/gi,
    severity: "HIGH",
  },
  {
    name: "Database URL",
    pattern: /postgres(ql)?:\/\/[^"'\s]+/gi,
    severity: "HIGH",
  },
  {
    name: "MongoDB URL",
    pattern: /mongodb(\+srv)?:\/\/[^"'\s]+/gi,
    severity: "HIGH",
  },
  { name: "Redis URL", pattern: /redis:\/\/[^"'\s]+/gi, severity: "MEDIUM" },
];

// Allowlist patterns (known safe occurrences)
const ALLOWLIST = [
  /\/\/\s*Example:/i, // Comments with examples
  /\/\/\s*Bearer\s+TOKEN/i, // Documented bearer token example
  /process\.env\.[A-Z_]+/, // Environment variable references
  /YOUR_API_KEY_HERE/, // Placeholder text
  /sk-\.\.\./, // Truncated examples
  /\*{8,}/, // Masked secrets
  /REDACTED/i, // Redacted text
  /test[_-]?key/i, // Test keys
  /mock[_-]?key/i, // Mock keys
  /dummy[_-]?key/i, // Dummy keys
  /example\.com/i, // Example domains
];

// Files/directories to exclude from scanning
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /coverage/,
  /test\/fixtures/,
  /\.map$/, // Source maps
  /package-lock\.json$/,
  /yarn\.lock$/,
];

class SecretScanner {
  constructor() {
    this.findings = [];
    this.filesScanned = 0;
    this.verbose =
      process.argv.includes("--verbose") || process.argv.includes("-v");
  }

  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  shouldExclude(filePath) {
    return EXCLUDE_PATTERNS.some((pattern) => pattern.test(filePath));
  }

  isAllowlisted(match, context) {
    return ALLOWLIST.some(
      (pattern) => pattern.test(match) || pattern.test(context),
    );
  }

  scanFile(filePath) {
    if (this.shouldExclude(filePath)) {
      this.log(`Skipping excluded: ${filePath}`);
      return;
    }

    try {
      const content = fs.readFileSync(filePath, "utf8");
      this.filesScanned++;

      SECRET_PATTERNS.forEach(
        ({ name, pattern, severity, context: requiredContext }) => {
          const matches = content.matchAll(pattern);

          for (const match of matches) {
            const matchText = match[0];
            const startPos = match.index;
            const endPos = startPos + matchText.length;

            // Get context around the match
            const contextStart = Math.max(0, startPos - 50);
            const contextEnd = Math.min(content.length, endPos + 50);
            const context = content.slice(contextStart, contextEnd);

            // Skip if allowlisted
            if (this.isAllowlisted(matchText, context)) {
              this.log(`Allowlisted: ${name} in ${filePath}`);
              continue;
            }

            // For context-sensitive patterns, verify context
            if (
              requiredContext &&
              !context.toUpperCase().includes(requiredContext)
            ) {
              continue;
            }

            // Calculate line number
            const lineNumber = content.slice(0, startPos).split("\n").length;

            this.findings.push({
              file: filePath,
              line: lineNumber,
              type: name,
              severity,
              match: matchText.slice(0, 20) + "...", // Truncate for safety
              context: context.replace(/\n/g, " ").trim().slice(0, 80),
            });
          }
        },
      );
    } catch (error) {
      if (error.code !== "EISDIR") {
        console.error(`Error scanning ${filePath}:`, error.message);
      }
    }
  }

  scanDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        this.scanDirectory(fullPath);
      } else if (entry.isFile()) {
        this.scanFile(fullPath);
      }
    }
  }

  printReport() {
    console.log("\n" + "=".repeat(80));
    console.log("Security Scan Report");
    console.log("=".repeat(80));
    console.log(`Files scanned: ${this.filesScanned}`);
    console.log(`Findings: ${this.findings.length}`);

    if (this.findings.length === 0) {
      console.log("\n✅ No secrets detected in build artifacts\n");
      return 0;
    }

    console.log("\n❌ SECURITY ALERT: Secrets detected in build artifacts!\n");

    // Group by severity
    const bySeverity = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
    };

    this.findings.forEach((finding) => {
      bySeverity[finding.severity].push(finding);
    });

    // Print findings by severity
    ["CRITICAL", "HIGH", "MEDIUM"].forEach((severity) => {
      const findings = bySeverity[severity];
      if (findings.length === 0) return;

      console.log(`\n${severity} (${findings.length}):`);
      console.log("-".repeat(80));

      findings.forEach(({ file, line, type, match, context }) => {
        console.log(`\n  ${type}`);
        console.log(`  File: ${file}:${line}`);
        console.log(`  Match: ${match}`);
        console.log(`  Context: ${context}`);
      });
    });

    console.log("\n" + "=".repeat(80));
    console.log("REMEDIATION STEPS:");
    console.log("1. Remove hardcoded secrets from source code");
    console.log("2. Use environment variables for sensitive data");
    console.log(
      "3. Add secrets to .gitignore and .env.example (with placeholders)",
    );
    console.log("4. Rotate any exposed credentials immediately");
    console.log("5. Review webpack/bundler externals configuration");
    console.log("=".repeat(80) + "\n");

    return 1; // Exit with error
  }

  run() {
    console.log("Starting security scan of build artifacts...\n");

    const distPath = path.join(process.cwd(), "dist");

    if (!fs.existsSync(distPath)) {
      console.error("Error: dist/ directory not found. Run build first.");
      return 2;
    }

    try {
      this.scanDirectory(distPath);
      return this.printReport();
    } catch (error) {
      console.error("Scanner error:", error);
      return 2;
    }
  }
}

// Run scanner
const scanner = new SecretScanner();
const exitCode = scanner.run();
process.exit(exitCode);
