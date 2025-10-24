#!/usr/bin/env tsx

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { getDatabaseService } from "../app/renderer/services/DatabaseService";

/**
 * Luna Agent Backup Management System
 * Features: Automated backups, Incremental backups, Encryption, Compression, Recovery
 */

interface BackupConfig {
  enabled: boolean;
  schedule: string;
  retention: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  compression: boolean;
  encryption: boolean;
  destinations: BackupDestination[];
  includeConfig: boolean;
  includeLogs: boolean;
  excludePatterns: string[];
}

interface BackupDestination {
  type: "local" | "s3" | "ftp" | "ssh";
  path: string;
  credentials?: any;
  enabled: boolean;
}

interface BackupMetadata {
  id: string;
  timestamp: string;
  type: "full" | "incremental";
  size: number;
  checksum: string;
  compressed: boolean;
  encrypted: boolean;
  files: string[];
  version: string;
  duration: number;
}

class BackupManager {
  private databaseService: any;
  private backupDir: string;
  private tempDir: string;
  private config: BackupConfig;
  private encryptionKey: string;

  constructor() {
    this.databaseService = getDatabaseService();
    this.backupDir = path.join(process.cwd(), "backups");
    this.tempDir = path.join(process.cwd(), "temp", "backup");

    this.config = this.loadBackupConfig();
    this.encryptionKey =
      process.env.BACKUP_ENCRYPTION_KEY || this.generateEncryptionKey();
  }

  private loadBackupConfig(): BackupConfig {
    try {
      const configPath = path.join(process.cwd(), "config", "backup.json");
      const configContent = require(configPath);
      return configContent;
    } catch (error) {
      console.warn("No backup config found, using defaults");
      return this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): BackupConfig {
    return {
      enabled: true,
      schedule: "0 2 * * *", // Daily at 2 AM
      retention: {
        daily: 7,
        weekly: 4,
        monthly: 12,
      },
      compression: true,
      encryption: process.env.NODE_ENV === "production",
      destinations: [
        {
          type: "local",
          path: "./backups",
          enabled: true,
        },
      ],
      includeConfig: true,
      includeLogs: false,
      excludePatterns: [
        "node_modules/**",
        "dist/**",
        "temp/**",
        "*.tmp",
        "*.log",
      ],
    };
  }

  private generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  public async initialize(): Promise<void> {
    console.log("🔧 Initializing backup manager...");

    // Create backup directories
    await fs.mkdir(this.backupDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });

    // Initialize database service
    await this.databaseService.initialize();

    // Create backup tracking table
    await this.createBackupTable();

    console.log("✅ Backup manager initialized");
  }

  private async createBackupTable(): Promise<void> {
    await this.databaseService.run(`
      CREATE TABLE IF NOT EXISTS backup_history (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        compressed BOOLEAN DEFAULT FALSE,
        encrypted BOOLEAN DEFAULT FALSE,
        files TEXT NOT NULL,
        version TEXT,
        duration INTEGER,
        status TEXT DEFAULT 'completed',
        metadata TEXT DEFAULT '{}',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
  }

  public async createBackup(
    type: "full" | "incremental" = "full",
  ): Promise<string> {
    const startTime = Date.now();
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`📦 Creating ${type} backup: ${backupId}`);

    try {
      // Create backup metadata
      const metadata: Partial<BackupMetadata> = {
        id: backupId,
        timestamp: new Date().toISOString(),
        type,
        compressed: this.config.compression,
        encrypted: this.config.encryption,
        version: this.getVersion(),
        files: [],
      };

      // Create temporary backup directory
      const tempBackupDir = path.join(this.tempDir, backupId);
      await fs.mkdir(tempBackupDir, { recursive: true });

      // Backup database
      const dbBackupPath = await this.backupDatabase(tempBackupDir);
      metadata.files!.push(dbBackupPath);

      // Backup configuration
      if (this.config.includeConfig) {
        const configBackupPath = await this.backupConfiguration(tempBackupDir);
        metadata.files!.push(configBackupPath);
      }

      // Backup user data
      const userDataPath = await this.backupUserData(tempBackupDir, type);
      if (userDataPath) {
        metadata.files!.push(userDataPath);
      }

      // Backup logs
      if (this.config.includeLogs) {
        const logsBackupPath = await this.backupLogs(tempBackupDir);
        if (logsBackupPath) {
          metadata.files!.push(logsBackupPath);
        }
      }

      // Create backup archive
      const archivePath = await this.createArchive(tempBackupDir, backupId);

      // Calculate size and checksum
      const stats = await fs.stat(archivePath);
      metadata.size = stats.size;
      metadata.checksum = await this.calculateChecksum(archivePath);
      metadata.duration = Date.now() - startTime;

      // Store backup metadata
      await this.storeBackupMetadata(metadata as BackupMetadata);

      // Copy to destinations
      await this.copyToDestinations(archivePath, backupId);

      // Cleanup temporary files
      await fs.rm(tempBackupDir, { recursive: true, force: true });

      // Cleanup old backups
      await this.cleanupOldBackups();

      console.log(
        `✅ Backup completed: ${backupId} (${this.formatBytes(metadata.size!)})`,
      );
      return backupId;
    } catch (error) {
      console.error(
        `❌ Backup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      // Record failure
      await this.storeBackupMetadata(
        {
          id: backupId,
          timestamp: new Date().toISOString(),
          type,
          size: 0,
          checksum: "",
          compressed: false,
          encrypted: false,
          files: [],
          version: this.getVersion(),
          duration: Date.now() - startTime,
        },
        "failed",
      );

      throw error;
    }
  }

  private async backupDatabase(backupDir: string): Promise<string> {
    console.log("🗄️  Backing up database...");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dbBackupPath = path.join(backupDir, `database_${timestamp}.db`);

    // Get database file path
    const dbPath = path.join(process.cwd(), "data", "luna.db");

    try {
      // Create database backup
      if (await this.fileExists(dbPath)) {
        await fs.copyFile(dbPath, dbBackupPath);
        console.log(`✅ Database backup created: ${dbBackupPath}`);
      } else {
        console.warn("⚠️  Database file not found, creating empty backup");
        await fs.writeFile(dbBackupPath, "");
      }

      return path.relative(backupDir, dbBackupPath);
    } catch (error) {
      console.error("❌ Database backup failed:", error);
      throw error;
    }
  }

  private async backupConfiguration(backupDir: string): Promise<string> {
    console.log("⚙️  Backing up configuration...");

    const configBackupDir = path.join(backupDir, "config");
    await fs.mkdir(configBackupDir, { recursive: true });

    const configFiles = [
      ".env",
      ".env.production",
      "package.json",
      "tsconfig.json",
      "config/backup.json",
      "config/reasoning.json",
      "config/policy.json",
    ];

    let copiedFiles = 0;

    for (const configFile of configFiles) {
      const sourcePath = path.join(process.cwd(), configFile);
      const destPath = path.join(configBackupDir, path.basename(configFile));

      try {
        if (await this.fileExists(sourcePath)) {
          await fs.copyFile(sourcePath, destPath);
          copiedFiles++;
        }
      } catch (error) {
        console.warn(`⚠️  Failed to backup ${configFile}:`, error);
      }
    }

    console.log(`✅ Configuration backup completed (${copiedFiles} files)`);
    return path.relative(backupDir, configBackupDir);
  }

  private async backupUserData(
    backupDir: string,
    type: "full" | "incremental",
  ): Promise<string | null> {
    console.log("📁 Backing up user data...");

    const userDataDir = path.join(process.cwd(), "data");
    const backupUserDataDir = path.join(backupDir, "data");

    try {
      if (await this.fileExists(userDataDir)) {
        await fs.mkdir(backupUserDataDir, { recursive: true });

        if (type === "full") {
          await this.copyDirectory(userDataDir, backupUserDataDir);
        } else {
          // Incremental backup - only files changed in last 24 hours
          await this.copyRecentFiles(
            userDataDir,
            backupUserDataDir,
            24 * 60 * 60 * 1000,
          );
        }

        console.log("✅ User data backup completed");
        return path.relative(backupDir, backupUserDataDir);
      }
    } catch (error) {
      console.warn("⚠️  User data backup failed:", error);
    }

    return null;
  }

  private async backupLogs(backupDir: string): Promise<string | null> {
    console.log("📊 Backing up logs...");

    const logsDir = path.join(process.cwd(), "logs");
    const backupLogsDir = path.join(backupDir, "logs");

    try {
      if (await this.fileExists(logsDir)) {
        await fs.mkdir(backupLogsDir, { recursive: true });

        // Only backup logs from last 7 days
        await this.copyRecentFiles(
          logsDir,
          backupLogsDir,
          7 * 24 * 60 * 60 * 1000,
        );

        console.log("✅ Logs backup completed");
        return path.relative(backupDir, backupLogsDir);
      }
    } catch (error) {
      console.warn("⚠️  Logs backup failed:", error);
    }

    return null;
  }

  private async createArchive(
    sourceDir: string,
    backupId: string,
  ): Promise<string> {
    console.log("🗜️  Creating backup archive...");

    const archiveName = `${backupId}.tar${this.config.compression ? ".gz" : ""}`;
    const archivePath = path.join(this.backupDir, archiveName);

    try {
      if (this.config.compression) {
        // Create compressed tar archive
        execSync(`tar -czf "${archivePath}" -C "${sourceDir}" .`, {
          stdio: "pipe",
        });
      } else {
        // Create uncompressed tar archive
        execSync(`tar -cf "${archivePath}" -C "${sourceDir}" .`, {
          stdio: "pipe",
        });
      }

      // Encrypt if enabled
      if (this.config.encryption) {
        const encryptedPath = `${archivePath}.enc`;
        await this.encryptFile(archivePath, encryptedPath);
        await fs.unlink(archivePath);
        console.log("🔒 Backup encrypted");
        return encryptedPath;
      }

      console.log(`✅ Archive created: ${archivePath}`);
      return archivePath;
    } catch (error) {
      console.error("❌ Archive creation failed:", error);
      throw error;
    }
  }

  private async encryptFile(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    const algorithm = "aes-256-gcm";
    const key = Buffer.from(this.encryptionKey, "hex");
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, key);

    const input = await fs.readFile(inputPath);
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    const authTag = (cipher as any).getAuthTag();

    const result = Buffer.concat([iv, authTag, encrypted]);
    await fs.writeFile(outputPath, result);
  }

  private async decryptFile(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    const algorithm = "aes-256-gcm";
    const key = Buffer.from(this.encryptionKey, "hex");

    const input = await fs.readFile(inputPath);
    const iv = input.slice(0, 16);
    const authTag = input.slice(16, 32);
    const encrypted = input.slice(32);

    const decipher = crypto.createDecipher(algorithm, key);
    (decipher as any).setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    await fs.writeFile(outputPath, decrypted);
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    const data = await fs.readFile(filePath);
    hash.update(data);
    return hash.digest("hex");
  }

  private async storeBackupMetadata(
    metadata: BackupMetadata,
    status = "completed",
  ): Promise<void> {
    await this.databaseService.run(
      `
      INSERT OR REPLACE INTO backup_history 
      (id, timestamp, type, size, checksum, compressed, encrypted, files, version, duration, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        metadata.id,
        metadata.timestamp,
        metadata.type,
        metadata.size,
        metadata.checksum,
        metadata.compressed,
        metadata.encrypted,
        JSON.stringify(metadata.files),
        metadata.version,
        metadata.duration,
        status,
        JSON.stringify(metadata),
      ],
    );
  }

  private async copyToDestinations(
    archivePath: string,
    backupId: string,
  ): Promise<void> {
    console.log("📤 Copying to backup destinations...");

    for (const destination of this.config.destinations) {
      if (!destination.enabled) continue;

      try {
        switch (destination.type) {
          case "local":
            const localPath = path.resolve(destination.path);
            await fs.mkdir(localPath, { recursive: true });
            await fs.copyFile(
              archivePath,
              path.join(localPath, path.basename(archivePath)),
            );
            console.log(`✅ Copied to local: ${localPath}`);
            break;

          case "s3":
            // TODO: Implement S3 upload
            console.log("📡 S3 upload not implemented yet");
            break;

          case "ftp":
            // TODO: Implement FTP upload
            console.log("📡 FTP upload not implemented yet");
            break;

          case "ssh":
            // TODO: Implement SSH/SCP upload
            console.log("📡 SSH upload not implemented yet");
            break;
        }
      } catch (error) {
        console.error(`❌ Failed to copy to ${destination.type}:`, error);
      }
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    console.log("🧹 Cleaning up old backups...");

    try {
      const backups = await this.getBackupHistory();
      const now = new Date();
      const toDelete: string[] = [];

      // Group backups by age
      const daily: BackupMetadata[] = [];
      const weekly: BackupMetadata[] = [];
      const monthly: BackupMetadata[] = [];

      for (const backup of backups) {
        const backupDate = new Date(backup.timestamp);
        const ageInDays =
          (now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24);

        if (ageInDays <= 7) {
          daily.push(backup);
        } else if (ageInDays <= 30) {
          weekly.push(backup);
        } else {
          monthly.push(backup);
        }
      }

      // Keep only the configured number of backups in each category
      if (daily.length > this.config.retention.daily) {
        const excess = daily.slice(this.config.retention.daily);
        toDelete.push(...excess.map((b) => b.id));
      }

      if (weekly.length > this.config.retention.weekly) {
        const excess = weekly.slice(this.config.retention.weekly);
        toDelete.push(...excess.map((b) => b.id));
      }

      if (monthly.length > this.config.retention.monthly) {
        const excess = monthly.slice(this.config.retention.monthly);
        toDelete.push(...excess.map((b) => b.id));
      }

      // Delete old backups
      for (const backupId of toDelete) {
        await this.deleteBackup(backupId);
      }

      if (toDelete.length > 0) {
        console.log(`✅ Cleaned up ${toDelete.length} old backups`);
      }
    } catch (error) {
      console.error("❌ Cleanup failed:", error);
    }
  }

  private async deleteBackup(backupId: string): Promise<void> {
    try {
      // Remove from database
      await this.databaseService.run(
        "DELETE FROM backup_history WHERE id = ?",
        [backupId],
      );

      // Remove backup files
      const backupFiles = [
        path.join(this.backupDir, `${backupId}.tar`),
        path.join(this.backupDir, `${backupId}.tar.gz`),
        path.join(this.backupDir, `${backupId}.tar.enc`),
        path.join(this.backupDir, `${backupId}.tar.gz.enc`),
      ];

      for (const filePath of backupFiles) {
        try {
          if (await this.fileExists(filePath)) {
            await fs.unlink(filePath);
          }
        } catch (error) {
          // Ignore file not found errors
        }
      }

      console.log(`🗑️  Deleted backup: ${backupId}`);
    } catch (error) {
      console.error(`❌ Failed to delete backup ${backupId}:`, error);
    }
  }

  public async restoreBackup(backupId: string): Promise<void> {
    console.log(`🔄 Restoring backup: ${backupId}`);

    try {
      // Get backup metadata
      const metadata = await this.getBackupMetadata(backupId);
      if (!metadata) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Find backup file
      const backupFile = await this.findBackupFile(backupId);
      if (!backupFile) {
        throw new Error(`Backup file not found: ${backupId}`);
      }

      // Create temporary restore directory
      const restoreDir = path.join(this.tempDir, `restore_${backupId}`);
      await fs.mkdir(restoreDir, { recursive: true });

      let archivePath = backupFile;

      // Decrypt if encrypted
      if (metadata.encrypted) {
        const decryptedPath = path.join(restoreDir, "decrypted.tar");
        await this.decryptFile(backupFile, decryptedPath);
        archivePath = decryptedPath;
      }

      // Extract archive
      const extractDir = path.join(restoreDir, "extracted");
      await fs.mkdir(extractDir, { recursive: true });

      if (metadata.compressed) {
        execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, {
          stdio: "pipe",
        });
      } else {
        execSync(`tar -xf "${archivePath}" -C "${extractDir}"`, {
          stdio: "pipe",
        });
      }

      // Restore database
      await this.restoreDatabase(extractDir);

      // Restore configuration (if requested)
      // await this.restoreConfiguration(extractDir);

      // Restore user data
      await this.restoreUserData(extractDir);

      // Cleanup
      await fs.rm(restoreDir, { recursive: true, force: true });

      console.log(`✅ Backup restored successfully: ${backupId}`);
    } catch (error) {
      console.error(
        `❌ Restore failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }
  }

  private async findBackupFile(backupId: string): Promise<string | null> {
    const possibleFiles = [
      path.join(this.backupDir, `${backupId}.tar.gz.enc`),
      path.join(this.backupDir, `${backupId}.tar.enc`),
      path.join(this.backupDir, `${backupId}.tar.gz`),
      path.join(this.backupDir, `${backupId}.tar`),
    ];

    for (const filePath of possibleFiles) {
      if (await this.fileExists(filePath)) {
        return filePath;
      }
    }

    return null;
  }

  private async restoreDatabase(extractDir: string): Promise<void> {
    const dbBackupFiles = await this.findFiles(extractDir, "database_*.db");

    if (dbBackupFiles.length > 0) {
      const latestDb = dbBackupFiles.sort().pop()!;
      const targetPath = path.join(process.cwd(), "data", "luna.db");

      // Ensure data directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      // Copy database
      await fs.copyFile(latestDb, targetPath);
      console.log("✅ Database restored");
    }
  }

  private async restoreUserData(extractDir: string): Promise<void> {
    const dataDir = path.join(extractDir, "data");

    if (await this.fileExists(dataDir)) {
      const targetDir = path.join(process.cwd(), "data");
      await fs.mkdir(targetDir, { recursive: true });

      // Copy user data (excluding database)
      await this.copyDirectory(dataDir, targetDir, ["*.db"]);
      console.log("✅ User data restored");
    }
  }

  public async getBackupHistory(): Promise<BackupMetadata[]> {
    const result = await this.databaseService.query(`
      SELECT * FROM backup_history 
      WHERE status = 'completed'
      ORDER BY timestamp DESC
    `);

    if (result.success && result.data) {
      return result.data.map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        type: row.type,
        size: row.size,
        checksum: row.checksum,
        compressed: row.compressed,
        encrypted: row.encrypted,
        files: JSON.parse(row.files),
        version: row.version,
        duration: row.duration,
      }));
    }

    return [];
  }

  private async getBackupMetadata(
    backupId: string,
  ): Promise<BackupMetadata | null> {
    const result = await this.databaseService.get(
      "SELECT * FROM backup_history WHERE id = ?",
      [backupId],
    );

    if (result.success && result.data) {
      const row = result.data;
      return {
        id: row.id,
        timestamp: row.timestamp,
        type: row.type,
        size: row.size,
        checksum: row.checksum,
        compressed: row.compressed,
        encrypted: row.encrypted,
        files: JSON.parse(row.files),
        version: row.version,
        duration: row.duration,
      };
    }

    return null;
  }

  // Utility methods
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async copyDirectory(
    source: string,
    dest: string,
    excludePatterns: string[] = [],
  ): Promise<void> {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(dest, entry.name);

      // Check exclude patterns
      if (
        excludePatterns.some((pattern) =>
          this.matchPattern(entry.name, pattern),
        )
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath, excludePatterns);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  private async copyRecentFiles(
    source: string,
    dest: string,
    maxAge: number,
  ): Promise<void> {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(source, { withFileTypes: true });
    const cutoff = Date.now() - maxAge;

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(dest, entry.name);

      const stat = await fs.stat(sourcePath);

      if (stat.mtime.getTime() > cutoff) {
        if (entry.isDirectory()) {
          await this.copyRecentFiles(sourcePath, destPath, maxAge);
        } else {
          await fs.copyFile(sourcePath, destPath);
        }
      }
    }
  }

  private async findFiles(dir: string, pattern: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.findFiles(fullPath, pattern);
        files.push(...subFiles);
      } else if (this.matchPattern(entry.name, pattern)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private matchPattern(filename: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    return regex.test(filename);
  }

  private getVersion(): string {
    try {
      const packageJson = require(path.join(process.cwd(), "package.json"));
      return packageJson.version;
    } catch {
      return "1.0.0";
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  public async displayStatus(): Promise<void> {
    console.log("\n📊 Backup Manager Status:");
    console.log("=".repeat(50));

    const backups = await this.getBackupHistory();

    console.log(`📦 Total backups: ${backups.length}`);
    console.log(`📁 Backup directory: ${this.backupDir}`);
    console.log(
      `🗜️  Compression: ${this.config.compression ? "Enabled" : "Disabled"}`,
    );
    console.log(
      `🔒 Encryption: ${this.config.encryption ? "Enabled" : "Disabled"}`,
    );

    if (backups.length > 0) {
      const latest = backups[0];
      console.log(`📅 Latest backup: ${latest.timestamp} (${latest.type})`);
      console.log(`📏 Latest size: ${this.formatBytes(latest.size)}`);

      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      console.log(`💾 Total size: ${this.formatBytes(totalSize)}`);
    } else {
      console.log("📭 No backups found");
    }

    console.log(`\n🎯 Retention policy:`);
    console.log(`   Daily: ${this.config.retention.daily} backups`);
    console.log(`   Weekly: ${this.config.retention.weekly} backups`);
    console.log(`   Monthly: ${this.config.retention.monthly} backups`);
  }

  public async close(): Promise<void> {
    await this.databaseService.close();
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const backupManager = new BackupManager();

  try {
    await backupManager.initialize();

    switch (command) {
      case "create":
        const type = (args[1] as "full" | "incremental") || "full";
        const backupId = await backupManager.createBackup(type);
        console.log(`📦 Backup created: ${backupId}`);
        break;

      case "restore":
        const restoreId = args[1];
        if (!restoreId) {
          console.error("❌ Backup ID required for restore");
          process.exit(1);
        }
        await backupManager.restoreBackup(restoreId);
        break;

      case "list":
        const backups = await backupManager.getBackupHistory();
        console.log("\n📋 Backup History:");
        console.log("=".repeat(80));
        console.log(
          `${"ID".padEnd(30)} ${"Date".padEnd(20)} ${"Type".padEnd(12)} ${"Size".padEnd(10)} ${"Duration".padEnd(10)}`,
        );
        console.log("-".repeat(80));

        for (const backup of backups) {
          const id = backup.id.padEnd(30);
          const date = new Date(backup.timestamp).toLocaleString().padEnd(20);
          const type = backup.type.padEnd(12);
          const size = backupManager["formatBytes"](backup.size).padEnd(10);
          const duration = `${backup.duration}ms`.padEnd(10);

          console.log(`${id} ${date} ${type} ${size} ${duration}`);
        }
        break;

      case "status":
        await backupManager.displayStatus();
        break;

      default:
        console.log("Luna Agent Backup Manager\n");
        console.log("Usage:");
        console.log(
          "  tsx scripts/backup-database.ts create [full|incremental] - Create backup",
        );
        console.log(
          "  tsx scripts/backup-database.ts restore <backup-id>        - Restore backup",
        );
        console.log(
          "  tsx scripts/backup-database.ts list                       - List backups",
        );
        console.log(
          "  tsx scripts/backup-database.ts status                     - Show status",
        );
        console.log("");
        console.log("Examples:");
        console.log("  tsx scripts/backup-database.ts create full");
        console.log(
          "  tsx scripts/backup-database.ts restore backup_1234567890_abc123",
        );
        console.log("  tsx scripts/backup-database.ts list");
        break;
    }
  } catch (error) {
    console.error("💥 Backup operation failed:", error);
    process.exit(1);
  } finally {
    await backupManager.close();
  }
}

// Run CLI if this script is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { BackupManager };
