// ===============================================================================
// 🎙️ VAD (Voice Activity Detection) Asset Loader
// ===============================================================================
// Handles loading of VAD worklets and models for voice functionality
// Works in both development (webpack-dev-server) and production (file://) modes
// ===============================================================================

/**
 * Load VAD worklet into AudioContext for voice activity detection
 * @param audioContext - Web Audio API AudioContext
 * @returns Promise that resolves when worklet is loaded
 */
export async function loadVadWorklet(
  audioContext: AudioContext,
): Promise<void> {
  try {
    // Path is relative to index.html in both dev and prod
    const workletPath = "./assets/vad.worklet.bundle.min.js";
    await audioContext.audioWorklet.addModule(workletPath);
    console.log("✅ VAD worklet loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load VAD worklet:", error);
    throw new Error(
      `VAD worklet loading failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get the path to VAD ONNX model (for loading via fetch or similar)
 * @param legacy - Whether to use the legacy model (default: false)
 * @returns Relative path to the model file
 */
export function getVadModelPath(legacy: boolean = false): string {
  // Paths are relative to index.html in both dev and prod
  return legacy
    ? "./assets/silero_vad_legacy.onnx"
    : "./assets/silero_vad.onnx";
}

/**
 * Verify that VAD assets are available
 * @returns Promise<boolean> - true if all assets are accessible
 */
export async function verifyVadAssets(): Promise<boolean> {
  const assetsToCheck = [
    "./assets/vad.worklet.bundle.min.js",
    "./assets/silero_vad.onnx",
    "./assets/silero_vad_legacy.onnx",
  ];

  const results = await Promise.allSettled(
    assetsToCheck.map(async (assetPath) => {
      const response = await fetch(assetPath, { method: "HEAD" });
      if (!response.ok) {
        throw new Error(`Asset not found: ${assetPath} (${response.status})`);
      }
      return assetPath;
    }),
  );

  const failed = results.filter((result) => result.status === "rejected");

  if (failed.length > 0) {
    console.error("❌ VAD asset verification failed:");
    failed.forEach((result) => {
      if (result.status === "rejected") {
        console.error("  ", result.reason);
      }
    });
    return false;
  }

  console.log("✅ All VAD assets verified successfully");
  return true;
}
