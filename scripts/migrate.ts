#!/usr/bin/env tsx

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getDatabaseService } from "../app/renderer/services/DatabaseService";

/**
 * Luna Agent Database Migration Manager
 * Features: Migration execution, rollback, status tracking, integrity checks
 */

interface Migration {
  version: number;
  name: string;
  filename: string;
  upSql: string;
  downSql: string;
  checksum: string;
  applied: boolean;
  appliedAt?: string;
  executionTime?: number;
}

class MigrationManager {
  private databaseService: any;
  private migrationsDir: string;
  private migrations: Migration[] = [];

  constructor() {
    this.databaseService = getDatabaseService();
    this.migrationsDir = path.join(__dirname, "..", "migrations");
  }

  public async initialize(): Promise<void> {
    console.log("🔧 Initializing Migration Manager...");

    // Initialize database service
    await this.databaseService.initialize();

    // Load all migrations
    await this.loadMigrations();

    console.log(`✅ Loaded ${this.migrations.length} migrations`);
  }

  private async loadMigrations(): Promise<void> {
    try {
      const files = await fs.readdir(this.migrationsDir);
      const migrationFiles = files
        .filter((file) => file.endsWith(".sql"))
        .sort(); // Ensure chronological order

      for (const file of migrationFiles) {
        const migration = await this.parseMigrationFile(file);
        if (migration) {
          this.migrations.push(migration);
        }
      }

      // Check which migrations have been applied
      await this.checkAppliedMigrations();
    } catch (error) {
      console.error("❌ Failed to load migrations:", error);
      throw error;
    }
  }

  private async parseMigrationFile(
    filename: string,
  ): Promise<Migration | null> {
    try {
      const filePath = path.join(this.migrationsDir, filename);
      const content = await fs.readFile(filePath, "utf8");

      // Parse version and name from filename (e.g., "001_initial_schema.sql")
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        console.warn(`⚠️  Skipping invalid migration filename: ${filename}`);
        return null;
      }

      const version = parseInt(match[1], 10);
      const name = match[2];

      // Split UP and DOWN sections
      const sections = content.split("-- DOWN");
      const upSql = sections[0].replace("-- UP", "").trim();
      const downSql = sections[1] ? sections[1].trim() : "";

      // Generate checksum
      const checksum = crypto
        .createHash("sha256")
        .update(content)
        .digest("hex");

      return {
        version,
        name,
        filename,
        upSql,
        downSql,
        checksum,
        applied: false,
      };
    } catch (error) {
      console.error(`❌ Failed to parse migration ${filename}:`, error);
      return null;
    }
  }

  private async checkAppliedMigrations(): Promise<void> {
    try {
      const result = await this.databaseService.query(`
        SELECT version, name, applied_at, checksum, execution_time 
        FROM schema_migrations 
        ORDER BY version ASC
      `);

      if (result.success && result.data) {
        const appliedMigrations = new Map(
          result.data.map((row: any) => [row.version, row]),
        );

        for (const migration of this.migrations) {
          const applied = appliedMigrations.get(migration.version);
          if (applied) {
            migration.applied = true;
            migration.appliedAt = applied.applied_at;
            migration.executionTime = applied.execution_time;

            // Check integrity
            if (applied.checksum && applied.checksum !== migration.checksum) {
              console.warn(
                `⚠️  Migration ${migration.version} checksum mismatch - file may have been modified`,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("❌ Failed to check applied migrations:", error);
      throw error;
    }
  }

  public async migrate(targetVersion?: number): Promise<void> {
    console.log("🚀 Running database migrations...");

    const pendingMigrations = this.migrations.filter(
      (m) =>
        !m.applied &&
        (targetVersion === undefined || m.version <= targetVersion),
    );

    if (pendingMigrations.length === 0) {
      console.log("✅ No pending migrations");
      return;
    }

    console.log(`📋 Found ${pendingMigrations.length} pending migrations`);

    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }

    console.log("🎉 All migrations completed successfully!");
  }

  private async runMigration(migration: Migration): Promise<void> {
    const startTime = Date.now();

    console.log(
      `⬆️  Applying migration ${migration.version}: ${migration.name}`,
    );

    try {
      // Run migration in transaction
      await this.databaseService.transaction(async (db: any) => {
        // Execute the migration SQL
        db.exec(migration.upSql);

        // Record migration in schema_migrations table
        const executionTime = Date.now() - startTime;

        db.prepare(
          `
          INSERT INTO schema_migrations (version, name, applied_at, checksum, execution_time)
          VALUES (?, ?, ?, ?, ?)
        `,
        ).run(
          migration.version,
          migration.name,
          new Date().toISOString(),
          migration.checksum,
          executionTime,
        );

        console.log(
          `✅ Migration ${migration.version} applied successfully (${executionTime}ms)`,
        );
      });

      migration.applied = true;
      migration.appliedAt = new Date().toISOString();
      migration.executionTime = Date.now() - startTime;
    } catch (error) {
      console.error(`❌ Migration ${migration.version} failed:`, error);
      throw new Error(
        `Migration ${migration.version} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async rollback(targetVersion: number): Promise<void> {
    console.log(`⬇️  Rolling back to migration ${targetVersion}...`);

    const migrationsToRollback = this.migrations
      .filter((m) => m.applied && m.version > targetVersion)
      .sort((a, b) => b.version - a.version); // Reverse order for rollback

    if (migrationsToRollback.length === 0) {
      console.log("✅ No migrations to rollback");
      return;
    }

    console.log(`📋 Rolling back ${migrationsToRollback.length} migrations`);

    for (const migration of migrationsToRollback) {
      await this.rollbackMigration(migration);
    }

    console.log("🎉 Rollback completed successfully!");
  }

  private async rollbackMigration(migration: Migration): Promise<void> {
    console.log(
      `⬇️  Rolling back migration ${migration.version}: ${migration.name}`,
    );

    if (!migration.downSql) {
      throw new Error(`Migration ${migration.version} has no rollback SQL`);
    }

    try {
      await this.databaseService.transaction(async (db: any) => {
        // Execute rollback SQL
        db.exec(migration.downSql);

        // Remove migration record
        db.prepare(
          `
          DELETE FROM schema_migrations WHERE version = ?
        `,
        ).run(migration.version);

        console.log(
          `✅ Migration ${migration.version} rolled back successfully`,
        );
      });

      migration.applied = false;
      migration.appliedAt = undefined;
      migration.executionTime = undefined;
    } catch (error) {
      console.error(
        `❌ Rollback of migration ${migration.version} failed:`,
        error,
      );
      throw new Error(
        `Rollback failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async status(): Promise<void> {
    console.log("\n📊 Migration Status:");
    console.log("=".repeat(80));

    if (this.migrations.length === 0) {
      console.log("No migrations found");
      return;
    }

    console.log(
      `${"Version".padEnd(8)} ${"Name".padEnd(30)} ${"Status".padEnd(10)} ${"Applied At".padEnd(20)} ${"Time (ms)".padEnd(10)}`,
    );
    console.log("-".repeat(80));

    for (const migration of this.migrations) {
      const version = migration.version.toString().padEnd(8);
      const name = migration.name.padEnd(30).substring(0, 30);
      const status = (migration.applied ? "✅ Applied" : "❌ Pending").padEnd(
        10,
      );
      const appliedAt = (migration.appliedAt || "N/A").padEnd(20);
      const execTime = (migration.executionTime?.toString() || "N/A").padEnd(
        10,
      );

      console.log(`${version} ${name} ${status} ${appliedAt} ${execTime}`);
    }

    // Summary
    const appliedCount = this.migrations.filter((m) => m.applied).length;
    const pendingCount = this.migrations.length - appliedCount;

    console.log("-".repeat(80));
    console.log(
      `Total: ${this.migrations.length} | Applied: ${appliedCount} | Pending: ${pendingCount}`,
    );

    if (pendingCount > 0) {
      console.log(
        `\n⚠️  ${pendingCount} pending migrations need to be applied`,
      );
    } else {
      console.log("\n✅ Database is up to date");
    }
  }

  public async create(name: string): Promise<void> {
    console.log(`📝 Creating new migration: ${name}`);

    // Find next version number
    const maxVersion = this.migrations.reduce(
      (max, m) => Math.max(max, m.version),
      0,
    );
    const nextVersion = maxVersion + 1;

    // Create migration filename
    const filename = `${nextVersion.toString().padStart(3, "0")}_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}.sql`;
    const filepath = path.join(this.migrationsDir, filename);

    // Template migration content
    const template = `-- UP
-- Migration: ${name}
-- Version: ${nextVersion}
-- Created: ${new Date().toISOString()}

-- Add your migration SQL here



-- DOWN
-- Rollback SQL for migration: ${name}

-- Add your rollback SQL here

`;

    try {
      await fs.writeFile(filepath, template, "utf8");
      console.log(`✅ Migration created: ${filename}`);
      console.log(`📁 Path: ${filepath}`);
      console.log("\n💡 Next steps:");
      console.log("   1. Edit the migration file and add your SQL");
      console.log("   2. Run: npm run migrate");
    } catch (error) {
      console.error("❌ Failed to create migration:", error);
      throw error;
    }
  }

  public async validate(): Promise<boolean> {
    console.log("🔍 Validating migrations...");

    let isValid = true;
    const issues: string[] = [];

    // Check for version conflicts
    const versions = this.migrations.map((m) => m.version);
    const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i);

    if (duplicates.length > 0) {
      issues.push(`Duplicate version numbers: ${duplicates.join(", ")}`);
      isValid = false;
    }

    // Check for missing versions
    for (let i = 1; i <= Math.max(...versions); i++) {
      if (!versions.includes(i)) {
        issues.push(`Missing migration version: ${i}`);
        isValid = false;
      }
    }

    // Check applied migrations for integrity
    for (const migration of this.migrations.filter((m) => m.applied)) {
      try {
        const result = await this.databaseService.get(
          "SELECT checksum FROM schema_migrations WHERE version = ?",
          [migration.version],
        );

        if (
          result.success &&
          result.data &&
          result.data.checksum !== migration.checksum
        ) {
          issues.push(`Migration ${migration.version} checksum mismatch`);
          isValid = false;
        }
      } catch (error) {
        issues.push(
          `Failed to validate migration ${migration.version}: ${error}`,
        );
        isValid = false;
      }
    }

    // Report results
    if (isValid) {
      console.log("✅ All migrations are valid");
    } else {
      console.log("❌ Migration validation failed:");
      issues.forEach((issue) => console.log(`   - ${issue}`));
    }

    return isValid;
  }

  public async reset(): Promise<void> {
    console.log("⚠️  DANGER: This will reset the entire database!");

    // In a real implementation, you might want to add confirmation
    console.log("🗑️  Dropping all tables...");

    try {
      // Get list of all tables
      const tablesResult = await this.databaseService.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      if (tablesResult.success && tablesResult.data) {
        for (const table of tablesResult.data) {
          await this.databaseService.run(`DROP TABLE IF EXISTS ${table.name}`);
          console.log(`   Dropped table: ${table.name}`);
        }
      }

      // Reset migration tracking
      this.migrations.forEach((m) => {
        m.applied = false;
        m.appliedAt = undefined;
        m.executionTime = undefined;
      });

      console.log("✅ Database reset complete");
      console.log('💡 Run "npm run migrate" to recreate the database');
    } catch (error) {
      console.error("❌ Database reset failed:", error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.databaseService.close();
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const migrationManager = new MigrationManager();

  try {
    await migrationManager.initialize();

    switch (command) {
      case "migrate":
      case "up":
        const targetVersion = args[1] ? parseInt(args[1], 10) : undefined;
        await migrationManager.migrate(targetVersion);
        break;

      case "rollback":
      case "down":
        const rollbackTarget = parseInt(args[1], 10);
        if (isNaN(rollbackTarget)) {
          console.error("❌ Rollback target version required");
          process.exit(1);
        }
        await migrationManager.rollback(rollbackTarget);
        break;

      case "status":
        await migrationManager.status();
        break;

      case "create":
        const migrationName = args[1];
        if (!migrationName) {
          console.error("❌ Migration name required");
          process.exit(1);
        }
        await migrationManager.create(migrationName);
        break;

      case "validate":
        const isValid = await migrationManager.validate();
        process.exit(isValid ? 0 : 1);
        break;

      case "reset":
        await migrationManager.reset();
        break;

      default:
        console.log("Luna Agent Database Migration Manager\n");
        console.log("Usage:");
        console.log(
          "  npm run migrate                    - Run all pending migrations",
        );
        console.log(
          "  npm run migrate <version>          - Migrate to specific version",
        );
        console.log(
          "  npm run migrate rollback <version> - Rollback to specific version",
        );
        console.log(
          "  npm run migrate status             - Show migration status",
        );
        console.log(
          "  npm run migrate create <name>      - Create new migration",
        );
        console.log(
          "  npm run migrate validate           - Validate migrations",
        );
        console.log(
          "  npm run migrate reset              - Reset database (DANGER)",
        );
        console.log("");
        console.log("Examples:");
        console.log("  npm run migrate");
        console.log("  npm run migrate rollback 1");
        console.log("  npm run migrate create add_user_preferences");
        console.log("  npm run migrate status");
        break;
    }
  } catch (error) {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  } finally {
    await migrationManager.close();
  }
}

// Run CLI if this script is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { MigrationManager };
