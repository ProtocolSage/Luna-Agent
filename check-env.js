#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Luna Agent Environment Configuration Manager
 * Features: Environment validation, Secret management, Configuration templates, Security checks
 */

class EnvironmentManager {
  constructor() {
    this.configPath = process.cwd();
    this.envFiles = [
      ".env",
      ".env.local",
      ".env.production",
      ".env.development",
    ];
    this.config = new Map();
    this.secrets = new Set();
    this.warnings = [];
    this.errors = [];
  }

  // Configuration schema with validation rules
  getConfigSchema() {
    return {
      // Core Application Settings
      NODE_ENV: {
        type: "enum",
        values: ["development", "production", "test"],
        default: "production",
        description: "Application environment mode",
        required: true,
      },
      PORT: {
        type: "number",
        min: 1024,
        max: 65535,
        default: 3000,
        description: "Server port number",
        required: false,
      },
      HOST: {
        type: "string",
        default: "localhost",
        description: "Server host address",
        required: false,
      },

      // Security Configuration
      JWT_SECRET: {
        type: "string",
        minLength: 32,
        description: "JWT signing secret (auto-generated if not provided)",
        required: false,
        secret: true,
        generate: () => crypto.randomBytes(64).toString("hex"),
      },
      SESSION_SECRET: {
        type: "string",
        minLength: 32,
        description: "Session signing secret (auto-generated if not provided)",
        required: false,
        secret: true,
        generate: () => crypto.randomBytes(64).toString("hex"),
      },
      ENCRYPTION_KEY: {
        type: "string",
        minLength: 32,
        description: "Data encryption key (auto-generated if not provided)",
        required: false,
        secret: true,
        generate: () => crypto.randomBytes(32).toString("hex"),
      },
      SECURITY_LEVEL: {
        type: "enum",
        values: ["low", "medium", "high"],
        default: "high",
        description: "Security enforcement level",
        required: false,
      },

      // Rate Limiting
      RATE_LIMIT_REQUESTS_PER_MINUTE: {
        type: "number",
        min: 1,
        max: 10000,
        default: 60,
        description: "Rate limit: requests per minute",
        required: false,
      },
      RATE_LIMIT_REQUESTS_PER_HOUR: {
        type: "number",
        min: 1,
        max: 100000,
        default: 1000,
        description: "Rate limit: requests per hour",
        required: false,
      },

      // AI Provider API Keys
      OPENAI_API_KEY: {
        type: "string",
        pattern: /^sk-[a-zA-Z0-9]{20,}$/,
        description: "OpenAI API key for GPT models",
        required: false,
        secret: true,
        provider: "openai",
      },
      ANTHROPIC_API_KEY: {
        type: "string",
        pattern: /^sk-ant-[a-zA-Z0-9-_]{20,}$/,
        description: "Anthropic API key for Claude models",
        required: false,
        secret: true,
        provider: "anthropic",
      },
      ELEVENLABS_API_KEY: {
        type: "string",
        description: "ElevenLabs API key for TTS",
        required: false,
        secret: true,
        provider: "elevenlabs",
      },

      // Database Configuration
      DATABASE_URL: {
        type: "string",
        description: "Database connection URL",
        required: false,
        default: "sqlite://./data/luna.db",
      },
      DATABASE_MAX_CONNECTIONS: {
        type: "number",
        min: 1,
        max: 100,
        default: 10,
        description: "Maximum database connections",
        required: false,
      },

      // Voice Configuration
      VOICE_ENABLED: {
        type: "boolean",
        default: true,
        description: "Enable voice recognition and synthesis",
        required: false,
      },
      WAKE_WORD_ENABLED: {
        type: "boolean",
        default: false,
        description: "Enable wake word detection",
        required: false,
      },
      PICOVOICE_ACCESS_KEY: {
        type: "string",
        description: "Picovoice access key for wake word detection",
        required: false,
        secret: true,
        provider: "picovoice",
      },

      // Feature Flags
      ENABLE_STREAMING: {
        type: "boolean",
        default: true,
        description: "Enable streaming responses",
        required: false,
      },
      ENABLE_TOOLS: {
        type: "boolean",
        default: true,
        description: "Enable AI tools execution",
        required: false,
      },
      ENABLE_MEMORY: {
        type: "boolean",
        default: true,
        description: "Enable persistent memory",
        required: false,
      },
      ENABLE_ANALYTICS: {
        type: "boolean",
        default: true,
        description: "Enable usage analytics",
        required: false,
      },

      // Logging Configuration
      LOG_LEVEL: {
        type: "enum",
        values: ["error", "warn", "info", "debug"],
        default: "info",
        description: "Logging level",
        required: false,
      },
      LOG_FILE: {
        type: "string",
        default: "./logs/luna.log",
        description: "Log file path",
        required: false,
      },

      // Performance Settings
      MAX_REQUEST_SIZE: {
        type: "string",
        default: "10mb",
        description: "Maximum request body size",
        required: false,
      },
      MAX_FILE_SIZE: {
        type: "string",
        default: "25mb",
        description: "Maximum file upload size",
        required: false,
      },

      // External Services
      SENTRY_DSN: {
        type: "string",
        description: "Sentry DSN for error reporting",
        required: false,
        secret: true,
      },
      ERROR_REPORTING_ENDPOINT: {
        type: "url",
        description: "Custom error reporting endpoint",
        required: false,
      },

      // Development Settings
      DEBUG_MODE: {
        type: "boolean",
        default: false,
        description: "Enable debug mode (development only)",
        required: false,
      },
      HOT_RELOAD: {
        type: "boolean",
        default: false,
        description: "Enable hot reload (development only)",
        required: false,
      },
    };
  }

  async loadConfiguration() {
    console.log("🔧 Loading environment configuration...");

    // Load environment files in order
    for (const envFile of this.envFiles) {
      await this.loadEnvFile(envFile);
    }

    // Load system environment variables (highest priority)
    this.loadSystemEnv();

    // Validate configuration
    await this.validateConfiguration();

    // Generate missing secrets
    await this.generateSecrets();

    // Check for warnings and errors
    this.checkConfigurationHealth();

    console.log("✅ Environment configuration loaded");
    return this.config;
  }

  async loadEnvFile(filename) {
    const filepath = path.join(this.configPath, filename);

    try {
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, "utf8");
        const lines = content.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            const [key, ...valueParts] = trimmed.split("=");
            if (key && valueParts.length > 0) {
              const value = valueParts.join("=").replace(/^["']|["']$/g, ""); // Remove quotes
              if (!this.config.has(key)) {
                // Don't override existing values
                this.config.set(key, value);
              }
            }
          }
        }

        console.log(`📁 Loaded ${filename}`);
      }
    } catch (error) {
      this.warnings.push(`Failed to load ${filename}: ${error.message}`);
    }
  }

  loadSystemEnv() {
    const schema = this.getConfigSchema();

    for (const key of Object.keys(schema)) {
      if (process.env[key] && !this.config.has(key)) {
        this.config.set(key, process.env[key]);
      }
    }

    console.log("🌍 Loaded system environment variables");
  }

  async validateConfiguration() {
    const schema = this.getConfigSchema();

    for (const [key, rules] of Object.entries(schema)) {
      const value = this.config.get(key) || rules.default;

      // Set default if not provided and default exists
      if (!this.config.has(key) && rules.default !== undefined) {
        this.config.set(key, rules.default.toString());
      }

      // Check required fields
      if (rules.required && !this.config.has(key)) {
        this.errors.push(`Required configuration missing: ${key}`);
        continue;
      }

      // Skip validation if value is not provided and not required
      if (!this.config.has(key)) {
        continue;
      }

      const currentValue = this.config.get(key);

      // Type validation
      if (!this.validateType(currentValue, rules)) {
        this.errors.push(`Invalid type for ${key}: expected ${rules.type}`);
      }

      // Pattern validation
      if (rules.pattern && !rules.pattern.test(currentValue)) {
        this.errors.push(`Invalid format for ${key}`);
      }

      // Range validation
      if (rules.type === "number") {
        const numValue = parseInt(currentValue, 10);
        if (rules.min !== undefined && numValue < rules.min) {
          this.errors.push(`${key} below minimum value (${rules.min})`);
        }
        if (rules.max !== undefined && numValue > rules.max) {
          this.errors.push(`${key} above maximum value (${rules.max})`);
        }
      }

      // String length validation
      if (
        rules.type === "string" &&
        rules.minLength &&
        currentValue.length < rules.minLength
      ) {
        this.errors.push(
          `${key} too short (minimum ${rules.minLength} characters)`,
        );
      }

      // Track secrets
      if (rules.secret) {
        this.secrets.add(key);
      }
    }
  }

  validateType(value, rules) {
    switch (rules.type) {
      case "string":
        return typeof value === "string";
      case "number":
        return !isNaN(parseInt(value, 10));
      case "boolean":
        return ["true", "false", "1", "0", "yes", "no"].includes(
          value.toLowerCase(),
        );
      case "enum":
        return rules.values.includes(value);
      case "url":
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      default:
        return true;
    }
  }

  async generateSecrets() {
    const schema = this.getConfigSchema();
    let secretsGenerated = false;

    for (const [key, rules] of Object.entries(schema)) {
      if (rules.secret && rules.generate && !this.config.has(key)) {
        const generatedValue = rules.generate();
        this.config.set(key, generatedValue);
        this.secrets.add(key);
        secretsGenerated = true;
        console.log(`🔑 Generated secret: ${key}`);
      }
    }

    if (secretsGenerated) {
      await this.updateEnvFile(
        ".env",
        Array.from(this.config.entries()).filter(([key]) =>
          this.secrets.has(key),
        ),
      );
    }
  }

  async updateEnvFile(filename, newEntries) {
    const filepath = path.join(this.configPath, filename);

    try {
      let content = "";

      // Read existing content
      if (fs.existsSync(filepath)) {
        content = fs.readFileSync(filepath, "utf8");
      }

      // Add new entries
      for (const [key, value] of newEntries) {
        if (!content.includes(`${key}=`)) {
          content += `\n# Auto-generated secret\n${key}="${value}"\n`;
        }
      }

      fs.writeFileSync(filepath, content);
      console.log(`📝 Updated ${filename}`);
    } catch (error) {
      this.errors.push(`Failed to update ${filename}: ${error.message}`);
    }
  }

  checkConfigurationHealth() {
    // Check for missing AI providers
    const providers = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
    const availableProviders = providers.filter((key) => this.config.has(key));

    if (availableProviders.length === 0) {
      this.warnings.push(
        "No AI provider API keys configured - AI features will be limited",
      );
    } else {
      console.log(
        `🤖 Available AI providers: ${availableProviders.length}/${providers.length}`,
      );
    }

    // Check voice configuration
    if (
      this.config.get("VOICE_ENABLED") === "true" &&
      !this.config.has("ELEVENLABS_API_KEY") &&
      !this.config.has("OPENAI_API_KEY")
    ) {
      this.warnings.push("Voice enabled but no TTS provider configured");
    }

    // Check wake word configuration
    if (
      this.config.get("WAKE_WORD_ENABLED") === "true" &&
      !this.config.has("PICOVOICE_ACCESS_KEY")
    ) {
      this.warnings.push(
        "Wake word enabled but PICOVOICE_ACCESS_KEY not configured",
      );
    }

    // Security checks
    if (this.config.get("SECURITY_LEVEL") === "low") {
      this.warnings.push(
        "Security level set to LOW - consider using MEDIUM or HIGH for production",
      );
    }

    // Development vs Production checks
    const nodeEnv = this.config.get("NODE_ENV");
    if (nodeEnv === "production") {
      if (this.config.get("DEBUG_MODE") === "true") {
        this.warnings.push("DEBUG_MODE enabled in production environment");
      }
      if (this.config.get("LOG_LEVEL") === "debug") {
        this.warnings.push("LOG_LEVEL set to debug in production environment");
      }
    }
  }

  generateConfigTemplate() {
    const schema = this.getConfigSchema();
    let template = `# Luna Agent Environment Configuration
# Generated on ${new Date().toISOString()}
# Copy this to .env and customize as needed

`;

    const categories = {};

    // Group by category
    for (const [key, rules] of Object.entries(schema)) {
      const category = this.getCategoryFromKey(key);
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push([key, rules]);
    }

    // Generate template sections
    for (const [category, entries] of Object.entries(categories)) {
      template += `# ${category}\n`;

      for (const [key, rules] of entries) {
        template += `# ${rules.description}\n`;
        if (rules.required) {
          template += `# REQUIRED\n`;
        }
        if (rules.type === "enum") {
          template += `# Options: ${rules.values.join(", ")}\n`;
        }
        if (rules.default !== undefined) {
          template += `# Default: ${rules.default}\n`;
        }

        const defaultValue = rules.secret
          ? "# SET_YOUR_SECRET_HERE"
          : rules.default || "";
        template += `${rules.required ? "" : "# "}${key}=${defaultValue}\n\n`;
      }
    }

    return template;
  }

  getCategoryFromKey(key) {
    if (
      key.includes("API_KEY") ||
      key.includes("SECRET") ||
      key.includes("TOKEN")
    ) {
      return "API Keys & Secrets";
    }
    if (key.includes("RATE_LIMIT")) {
      return "Rate Limiting";
    }
    if (key.includes("DATABASE")) {
      return "Database";
    }
    if (
      key.includes("VOICE") ||
      key.includes("WAKE_WORD") ||
      key.includes("PICOVOICE")
    ) {
      return "Voice & Audio";
    }
    if (key.includes("LOG") || key.includes("DEBUG")) {
      return "Logging & Debug";
    }
    if (key.includes("ENABLE_") || key.includes("_ENABLED")) {
      return "Feature Flags";
    }
    if (key.includes("MAX_") || key.includes("SIZE")) {
      return "Performance";
    }
    if (
      key.includes("HOST") ||
      key.includes("PORT") ||
      key.includes("NODE_ENV")
    ) {
      return "Server Configuration";
    }
    if (key.includes("SECURITY")) {
      return "Security";
    }
    return "Other Settings";
  }

  displayConfiguration() {
    console.log("\n📋 Configuration Summary:");
    console.log("=".repeat(50));

    const safeConfig = new Map();
    for (const [key, value] of this.config.entries()) {
      if (this.secrets.has(key)) {
        safeConfig.set(key, this.maskSecret(value));
      } else {
        safeConfig.set(key, value);
      }
    }

    // Display by category
    const categories = {};
    for (const [key, value] of safeConfig.entries()) {
      const category = this.getCategoryFromKey(key);
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push([key, value]);
    }

    for (const [category, entries] of Object.entries(categories)) {
      console.log(`\n📂 ${category}:`);
      for (const [key, value] of entries) {
        const status = this.secrets.has(key) ? "🔒" : "📝";
        console.log(`   ${status} ${key}=${value}`);
      }
    }

    // Display warnings and errors
    if (this.warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      this.warnings.forEach((warning) => console.log(`   - ${warning}`));
    }

    if (this.errors.length > 0) {
      console.log("\n❌ Errors:");
      this.errors.forEach((error) => console.log(`   - ${error}`));
    }

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log("\n✅ Configuration is healthy");
    }
  }

  maskSecret(value) {
    if (value.length <= 8) {
      return "*".repeat(value.length);
    }
    return value.substr(0, 4) + "*".repeat(value.length - 8) + value.substr(-4);
  }

  async exportConfiguration(format = "env") {
    const timestamp = new Date().toISOString().split("T")[0];

    switch (format) {
      case "env":
        const envContent = Array.from(this.config.entries())
          .map(([key, value]) => `${key}="${value}"`)
          .join("\n");
        const envPath = `./config-export-${timestamp}.env`;
        fs.writeFileSync(envPath, envContent);
        console.log(`📤 Configuration exported to: ${envPath}`);
        break;

      case "json":
        const jsonContent = JSON.stringify(
          Object.fromEntries(this.config),
          null,
          2,
        );
        const jsonPath = `./config-export-${timestamp}.json`;
        fs.writeFileSync(jsonPath, jsonContent);
        console.log(`📤 Configuration exported to: ${jsonPath}`);
        break;

      case "yaml":
        const yaml = require("js-yaml");
        const yamlContent = yaml.dump(Object.fromEntries(this.config));
        const yamlPath = `./config-export-${timestamp}.yaml`;
        fs.writeFileSync(yamlPath, yamlContent);
        console.log(`📤 Configuration exported to: ${yamlPath}`);
        break;

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  getValidationReport() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      configCount: this.config.size,
      secretCount: this.secrets.size,
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const envManager = new EnvironmentManager();

  try {
    switch (command) {
      case "check":
        await envManager.loadConfiguration();
        envManager.displayConfiguration();
        const report = envManager.getValidationReport();
        process.exit(report.valid ? 0 : 1);
        break;

      case "template":
        const template = envManager.generateConfigTemplate();
        fs.writeFileSync(".env.template", template);
        console.log("📝 Configuration template generated: .env.template");
        break;

      case "export":
        const format = args[1] || "env";
        await envManager.loadConfiguration();
        await envManager.exportConfiguration(format);
        break;

      case "validate":
        await envManager.loadConfiguration();
        const validationReport = envManager.getValidationReport();
        console.log(`\n🔍 Validation Report:`);
        console.log(`   Valid: ${validationReport.valid ? "✅" : "❌"}`);
        console.log(`   Errors: ${validationReport.errors.length}`);
        console.log(`   Warnings: ${validationReport.warnings.length}`);
        console.log(
          `   Configuration entries: ${validationReport.configCount}`,
        );
        console.log(`   Secrets: ${validationReport.secretCount}`);
        process.exit(validationReport.valid ? 0 : 1);
        break;

      default:
        console.log("Luna Agent Environment Configuration Manager\n");
        console.log("Usage:");
        console.log(
          "  node check-env.js check        - Check and display current configuration",
        );
        console.log(
          "  node check-env.js template     - Generate .env.template file",
        );
        console.log(
          "  node check-env.js export [fmt] - Export configuration (env, json, yaml)",
        );
        console.log(
          "  node check-env.js validate     - Validate configuration and exit",
        );
        console.log("");
        console.log("Examples:");
        console.log("  node check-env.js check");
        console.log("  node check-env.js template");
        console.log("  node check-env.js export json");
        break;
    }
  } catch (error) {
    console.error("❌ Environment configuration error:", error.message);
    process.exit(1);
  }
}

// Run CLI if this script is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = EnvironmentManager;
