import { VoiceService, initializeVoiceService } from "../services/voiceService";

(async () => {
  console.log("🚀 Testing Advanced Voice Engine Features...\n");

  // Initialize voice service
  const voiceService = initializeVoiceService();
  await voiceService.initialize();

  try {
    // Test 1: Basic speech with Nova (default)
    console.log("1️⃣ Testing basic speech with Nova (default)...");
    await voiceService.speak("Hello! I am Nova, your default AI assistant.");

    // Test 2: Voice switching
    console.log("2️⃣ Testing voice switching...");
    voiceService.switchVoice("Aria");
    await voiceService.speak("Now I am Aria - notice the voice change!");

    voiceService.switchVoice("Charlie");
    await voiceService.speak(
      "And now I am Charlie - a different voice entirely.",
    );

    // Test 3: Priority queue
    console.log("3️⃣ Testing priority queue...");
    voiceService.speak("This is a normal priority message.", { priority: 0 });
    voiceService.speak("This is HIGH PRIORITY and should play first!", {
      priority: 10,
    });
    voiceService.speak("This is also normal priority.", { priority: 0 });

    // Wait for queue to process
    await new Promise((r) => setTimeout(r, 8000));

    // Test 4: Phrase caching
    console.log("4️⃣ Testing phrase caching...");
    console.log("First time (network request):");
    await voiceService.speak("This phrase will be cached.");

    console.log("Second time (should be instant from cache):");
    await voiceService.speak("This phrase will be cached.");

    // Test 5: SSML support
    console.log("5️⃣ Testing SSML support...");
    await voiceService.speak(`
      <speak>
        Here's a normal sentence.
        <prosody rate="slow">This part is spoken slowly.</prosody>
        <prosody rate="fast">And this part is spoken quickly!</prosody>
        <break time="1s"/>
        After a one second pause.
      </speak>
    `);

    // Test 6: Interruption
    console.log("6️⃣ Testing interruption...");
    voiceService.speak(
      "This is a long message that will be interrupted in two seconds...",
      { priority: 1 },
    );

    setTimeout(() => {
      console.log("⏹️ Interrupting with high priority message!");
      voiceService.speak("INTERRUPT! This is an urgent message!", {
        interrupt: true,
        priority: 100,
      });
    }, 2000);

    // Wait for interruption test
    await new Promise((r) => setTimeout(r, 5000));

    // Test 7: Voice switching back to Nova
    console.log("7️⃣ Switching back to Nova...");
    voiceService.switchVoice("Nova", { interrupt: false });
    await voiceService.speak(
      "And we are back to Nova! All features tested successfully.",
    );

    // Test 8: Queue status
    console.log("8️⃣ Queue status:", voiceService.getQueueStatus());
    console.log(
      "Available voices:",
      Object.keys(voiceService.getAvailableVoices()),
    );
    console.log("Current voice ID:", voiceService.getCurrentVoiceId());

    console.log("\n✅ All advanced features tested successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    // Cleanup
    await new Promise((r) => setTimeout(r, 2000));
    await voiceService.destroy();
    process.exit(0);
  }
})();
