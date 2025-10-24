import { PorcupineWorker } from "@picovoice/porcupine-web";
import path from "path";
import { logger } from "../utils/logger";

export class WakeWordListener {
  private porcupine: PorcupineWorker | null = null;
  private enabled: boolean = false;
  private onDetectionCallback?: () => void;

  /**
   * Get the correct path to wake word assets based on environment
   */
  private getAssetPath(filename: string): string {
    const isDev = process.env.NODE_ENV === "development";

    if (isDev) {
      // Development: assets are in dist folder
      return path.join(__dirname, "../../dist/app/renderer/assets", filename);
    }

    // Production: assets are packaged in resources folder
    const resourcesPath =
      process.resourcesPath || path.join(process.cwd(), "resources");
    return path.join(resourcesPath, "assets", filename);
  }

  /**
   * Initialize the wake word listener
   * @param accessKey Picovoice access key
   * @param onDetection Callback when wake word is detected
   */
  async initialize(accessKey: string, onDetection: () => void) {
    this.onDetectionCallback = onDetection;

    try {
      const assetsPath = path.dirname(this.getAssetPath("pv_porcupine.wasm"));

      logger.info("Initializing wake word detection", {
        assetsPath,
        isDev: process.env.NODE_ENV === "development",
      });

      this.porcupine = await PorcupineWorker.create(
        accessKey,
        [{ builtin: "Porcupine" }], // Default wake word
        (detectionIndex) => {
          logger.info("Wake word detected", { detectionIndex });
          this.handleDetection();
        },
        {
          publicPath: assetsPath,
          forceWrite: true,
        },
      );

      this.enabled = true;
      logger.info("Wake word listener initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize wake word listener", {
        error: error.message,
        stack: error.stack,
      });
      this.enabled = false;
      throw error;
    }
  }

  /**
   * Start listening for wake word
   */
  async start() {
    if (!this.porcupine || !this.enabled) {
      logger.warn("Cannot start wake word: not initialized or disabled");
      return;
    }

    try {
      await this.porcupine.start();
      logger.info("Wake word listening started");
    } catch (error) {
      logger.error("Failed to start wake word listening", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Stop listening for wake word
   */
  stop() {
    if (this.porcupine) {
      this.porcupine.stop();
      logger.info("Wake word listening stopped");
    }
  }

  /**
   * Release resources
   */
  async release() {
    if (this.porcupine) {
      await this.porcupine.release();
      this.porcupine = null;
      this.enabled = false;
      logger.info("Wake word listener released");
    }
  }

  /**
   * Check if wake word detection is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Handle wake word detection
   */
  private handleDetection() {
    if (this.onDetectionCallback) {
      this.onDetectionCallback();
    }
  }

  /**
   * Toggle wake word detection on/off
   */
  toggle(enable: boolean) {
    if (enable && !this.porcupine) {
      logger.warn("Cannot enable wake word: not initialized");
      return;
    }

    if (enable) {
      this.start();
    } else {
      this.stop();
    }
  }
}
