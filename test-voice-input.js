// Test script for VoiceInputService functionality
const {
  VoiceInputService,
} = require("./dist/backend/services/VoiceInputService.js");

console.log("🎤 Testing Luna Agent VoiceInputService...\n");

async function testVoiceInputService() {
  const voiceService = new VoiceInputService();

  // Test 1: Service Status
  console.log("=== SERVICE STATUS ===");
  const status = voiceService.getStatus();
  console.log("Status:", JSON.stringify(status, null, 2));
  console.log("");

  // Test 2: Event Listeners
  console.log("=== SETTING UP EVENT LISTENERS ===");

  voiceService.on("listening-started", () => {
    console.log("🟢 Listening started");
  });

  voiceService.on("listening-stopped", () => {
    console.log("🔴 Listening stopped");
  });

  voiceService.on("interim-result", (text) => {
    console.log("💬 Interim:", text);
  });

  voiceService.on("final-result", (text) => {
    console.log("✅ Final result:", text);
  });

  voiceService.on("wakeword", () => {
    console.log("🔔 Wake word detected!");
  });

  voiceService.on("no-match", () => {
    console.log("❌ No speech detected");
  });

  voiceService.on("error", (error) => {
    console.log("🚨 Error:", error);
  });

  voiceService.on("request-browser-speech", () => {
    console.log("🌐 Fallback to browser speech requested");
  });

  voiceService.on("fallback-mode", (mode) => {
    console.log("⚡ Using fallback mode:", mode);
  });

  console.log("Event listeners registered\n");

  // Test 3: Configuration Tests
  console.log("=== CONFIGURATION TESTS ===");

  // Test continuous mode
  voiceService.setContinuousMode(true);
  console.log("✅ Continuous mode enabled");

  voiceService.setContinuousMode(false);
  console.log("✅ Continuous mode disabled");

  // Test wake word
  voiceService.setWakeWordEnabled(true);
  console.log("✅ Wake word enabled");

  voiceService.setWakeWordEnabled(false);
  console.log("✅ Wake word disabled");

  console.log("");

  // Test 4: Basic Functionality
  console.log("=== BASIC FUNCTIONALITY TESTS ===");

  console.log("Is listening:", voiceService.isCurrentlyListening());

  // Test start/stop without actual audio
  console.log("Testing start listening...");
  try {
    await voiceService.startListening();
    console.log("✅ Start listening succeeded");
  } catch (error) {
    console.log(
      "⚠️  Start listening error (expected without OpenAI key):",
      error.message,
    );
  }

  // Small delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("Testing stop listening...");
  try {
    await voiceService.stopListening();
    console.log("✅ Stop listening succeeded");
  } catch (error) {
    console.log("🚨 Stop listening error:", error.message);
  }

  console.log("");

  // Test 5: Cleanup
  console.log("=== CLEANUP TEST ===");
  try {
    await voiceService.cleanup();
    console.log("✅ Cleanup succeeded");
  } catch (error) {
    console.log("🚨 Cleanup error:", error.message);
  }

  console.log("\n🎤 VoiceInputService test completed!");

  // Show final status
  const finalStatus = voiceService.getStatus();
  console.log("\nFinal Status:", JSON.stringify(finalStatus, null, 2));
}

// Run the test
testVoiceInputService().catch(console.error);
