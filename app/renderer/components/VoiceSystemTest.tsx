// VoiceSystemTest.tsx - Complete E2E voice testing component

import React, { useState, useRef, useEffect } from "react";
import { featureFlags } from "../services/FeatureFlags";
import { API_BASE, apiFetch } from "../services/config";
import { API } from "../config/endpoints";

interface TestResult {
  id: string;
  test: string;
  status: "pending" | "running" | "passed" | "failed";
  duration?: number;
  error?: string;
  details?: any;
}

interface VoiceTestSuite {
  [key: string]: any; // Index signature for dynamic key access
  sttTest: TestResult;
  ttsTest: TestResult;
  conversationTest: TestResult;
  memoryTest: TestResult;
  persistenceTest: TestResult;
  latencyTest: TestResult;
  providerTest: TestResult;
  e2eTest: TestResult;
}

export function VoiceSystemTest() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string>("");
  const [results, setResults] = useState<VoiceTestSuite>({
    sttTest: { id: "stt", test: "Speech-to-Text", status: "pending" },
    ttsTest: { id: "tts", test: "Text-to-Speech", status: "pending" },
    conversationTest: {
      id: "conv",
      test: "Conversation Flow",
      status: "pending",
    },
    memoryTest: { id: "memory", test: "Memory Integration", status: "pending" },
    persistenceTest: {
      id: "persist",
      test: "State Persistence",
      status: "pending",
    },
    latencyTest: { id: "latency", test: "Response Latency", status: "pending" },
    providerTest: {
      id: "provider",
      test: "Provider Switching",
      status: "pending",
    },
    e2eTest: { id: "e2e", test: "End-to-End Voice", status: "pending" },
  });

  const audioContext = useRef<AudioContext | null>(null);
  const testAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio context
    if ("webkitAudioContext" in window || "AudioContext" in window) {
      const AudioCtx: any =
        window.AudioContext || (window as any).webkitAudioContext;
      audioContext.current = new AudioCtx();
    }

    return () => {
      if (audioContext.current) {
        audioContext.current.close();
      }
    };
  }, []);

  const updateTestResult = (testId: string, updates: Partial<TestResult>) => {
    setResults((prev) => ({
      ...prev,
      [testId]: { ...prev[testId], ...updates },
    }));
  };

  const runTest = async (testId: string, testFn: () => Promise<any>) => {
    const startTime = Date.now();
    updateTestResult(testId, { status: "running" });
    setCurrentTest(testId);

    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      updateTestResult(testId, {
        status: "passed",
        duration,
        details: result,
      });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      updateTestResult(testId, {
        status: "failed",
        duration,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  };

  // Test Speech-to-Text
  const testSTT = async () => {
    return runTest("sttTest", async () => {
      if (!featureFlags.isVoiceFeatureEnabled("speechToText")) {
        throw new Error("Speech-to-Text is disabled in feature flags");
      }

      // Test microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      // Test OpenAI STT endpoint
      const testBlob = new Blob(["test audio data"], { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", testBlob, "test.wav");

      const response = await apiFetch(API.STT_TRANSCRIBE, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`STT endpoint failed: ${response.status}`);
      }

      return {
        microphoneAccess: true,
        endpointStatus: response.status,
        openaiSTT: featureFlags.isVoiceFeatureEnabled("openaiSTT"),
        webSpeechSTT: featureFlags.isVoiceFeatureEnabled("webSpeechSTT"),
      };
    });
  };

  // Test Text-to-Speech
  const testTTS = async () => {
    return runTest("ttsTest", async () => {
      if (!featureFlags.isVoiceFeatureEnabled("textToSpeech")) {
        throw new Error("Text-to-Speech is disabled in feature flags");
      }

      // Test TTS endpoint
      const response = await apiFetch(API.TTS_SYNTHESIZE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "This is a test of the text-to-speech system.",
          provider: "webSpeech",
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS endpoint failed: ${response.status}`);
      }

      // Test audio playback
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      return new Promise((resolve, reject) => {
        const audio = new Audio(audioUrl);
        audio.onloadeddata = () => {
          resolve({
            endpointStatus: response.status,
            audioSize: audioBlob.size,
            audioDuration: audio.duration || 0,
            elevenLabs: featureFlags.isVoiceFeatureEnabled("elevenLabsTTS"),
            openaiTTS: featureFlags.isVoiceFeatureEnabled("openaiTTS"),
            webSpeech: featureFlags.isVoiceFeatureEnabled("webSpeechTTS"),
          });
        };
        audio.onerror = () => reject(new Error("Audio playback failed"));
      });
    });
  };

  // Test Conversation Flow
  const testConversation = async () => {
    return runTest("conversationTest", async () => {
      if (!featureFlags.isVoiceFeatureEnabled("conversationHistory")) {
        throw new Error("Conversation history is disabled");
      }

      // Test agent endpoint
      const response = await apiFetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Hello, can you hear me? This is a test.",
          sessionId: "test-session-" + Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent chat failed: ${response.status}`);
      }

      const data = await response.json();

      return {
        endpointStatus: response.status,
        responseReceived: !!data.response,
        responseLength: data.response?.length || 0,
        contextAware: featureFlags.isVoiceFeatureEnabled("contextAwareness"),
        streaming: featureFlags.isVoiceFeatureEnabled("streamingResponse"),
      };
    });
  };

  // Test Memory Integration
  const testMemory = async () => {
    return runTest("memoryTest", async () => {
      if (!featureFlags.isVoiceFeatureEnabled("memoryIntegration")) {
        throw new Error("Memory integration is disabled");
      }

      const testMemory = {
        content: "Voice system test memory entry",
        type: "voice_test",
        metadata: { test: true, timestamp: Date.now() },
      };

      // Add memory
      const addResponse = await apiFetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testMemory),
      });

      if (!addResponse.ok) {
        throw new Error(`Memory add failed: ${addResponse.status}`);
      }

      const addData = await addResponse.json();

      // Retrieve memory
      const getResponse = await apiFetch(`/api/memory/${addData.id}`);

      if (!getResponse.ok) {
        throw new Error(`Memory retrieval failed: ${getResponse.status}`);
      }

      const retrievedMemory = await getResponse.json();

      return {
        memoryId: addData.id,
        contentMatches: retrievedMemory.content === testMemory.content,
        typeMatches: retrievedMemory.type === testMemory.type,
        hasMetadata: !!retrievedMemory.metadata,
      };
    });
  };

  // Test State Persistence
  const testPersistence = async () => {
    return runTest("persistenceTest", async () => {
      // Test localStorage persistence
      const testKey = "voice-test-" + Date.now();
      const testData = { test: true, timestamp: Date.now() };

      localStorage.setItem(testKey, JSON.stringify(testData));
      const retrieved = JSON.parse(localStorage.getItem(testKey) || "{}");
      localStorage.removeItem(testKey);

      // Test session persistence
      const sessionResponse = await apiFetch("/api/auth/session");

      return {
        localStorageWorks: retrieved.test === true,
        sessionEndpointWorks: sessionResponse.ok,
        conversationPersistence: featureFlags.isVoiceFeatureEnabled(
          "conversationHistory",
        ),
      };
    });
  };

  // Test Response Latency
  const testLatency = async () => {
    return runTest("latencyTest", async () => {
      const tests = [];

      // Test health endpoint latency
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        const response = await fetch(`${API_BASE}/health`);
        const end = performance.now();

        if (response.ok) {
          tests.push(end - start);
        }
      }

      const avgLatency = tests.reduce((a, b) => a + b, 0) / tests.length;

      return {
        averageLatency: avgLatency,
        samples: tests.length,
        optimizationEnabled: featureFlags.isVoiceFeatureEnabled(
          "latencyOptimization",
        ),
        bufferingEnabled: featureFlags.isVoiceFeatureEnabled("voiceBuffering"),
      };
    });
  };

  // Test Provider Switching
  const testProviders = async () => {
    return runTest("providerTest", async () => {
      // Test TTS provider check
      const providerResponse = await apiFetch(API.TTS_CHECK);

      if (!providerResponse.ok) {
        throw new Error(`Provider check failed: ${providerResponse.status}`);
      }

      const providerData = await providerResponse.json();

      return {
        availableProviders: providerData.availableProviders || [],
        recommendedProvider: providerData.recommended,
        elevenlabsReady: providerData.providers?.elevenlabs || false,
        openaiReady: providerData.providers?.openai || false,
        webSpeechReady: providerData.providers?.webSpeech || false,
      };
    });
  };

  // Test Complete E2E Flow
  const testE2E = async () => {
    return runTest("e2eTest", async () => {
      if (!featureFlags.isVoiceFeatureEnabled("voiceActivation")) {
        throw new Error("Voice activation is disabled");
      }

      const sessionId = "e2e-test-" + Date.now();

      // Simulate complete voice interaction
      // 1. Start conversation
      const chatResponse = await apiFetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Please respond with exactly: Voice system test complete.",
          sessionId,
        }),
      });

      if (!chatResponse.ok) {
        throw new Error(`E2E chat failed: ${chatResponse.status}`);
      }

      const chatData = await chatResponse.json();

      // 2. Convert response to speech
      const ttsResponse = await apiFetch(API.TTS_SYNTHESIZE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: chatData.response,
          provider: "webSpeech",
        }),
      });

      if (!ttsResponse.ok) {
        throw new Error(`E2E TTS failed: ${ttsResponse.status}`);
      }

      return {
        sessionId,
        chatSuccess: !!chatData.response,
        ttsSuccess: ttsResponse.ok,
        responseLength: chatData.response?.length || 0,
        fullFlowComplete: true,
      };
    });
  };

  const runAllTests = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setCurrentTest("");

    // Reset all test results
    setResults(
      (prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([key, test]) => [
            key,
            {
              ...test,
              status: "pending",
              duration: undefined,
              error: undefined,
              details: undefined,
            },
          ]),
        ) as VoiceTestSuite,
    );

    try {
      await testSTT();
      await testTTS();
      await testConversation();
      await testMemory();
      await testPersistence();
      await testLatency();
      await testProviders();
      await testE2E();
    } catch (error) {
      console.error("Test suite error:", error);
    } finally {
      setIsRunning(false);
      setCurrentTest("");
    }
  };

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "pending":
        return "⏳";
      case "running":
        return "🔄";
      case "passed":
        return "✅";
      case "failed":
        return "❌";
      default:
        return "❓";
    }
  };

  const getStatusColor = (status: TestResult["status"]) => {
    switch (status) {
      case "pending":
        return "#888";
      case "running":
        return "#00aaff";
      case "passed":
        return "#00ff41";
      case "failed":
        return "#ff4444";
      default:
        return "#888";
    }
  };

  const passedTests = Object.values(results).filter(
    (t) => t.status === "passed",
  ).length;
  const failedTests = Object.values(results).filter(
    (t) => t.status === "failed",
  ).length;
  const totalTests = Object.values(results).length;

  return (
    <div className="voice-system-test">
      <div className="test-header">
        <h2>🎤 Voice System Test Suite</h2>
        <div className="test-stats">
          <span className="stat passed">✅ {passedTests}</span>
          <span className="stat failed">❌ {failedTests}</span>
          <span className="stat total">
            📊 {passedTests + failedTests}/{totalTests}
          </span>
        </div>
      </div>

      <div className="test-controls">
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className="run-tests-button"
        >
          {isRunning ? "🔄 Running Tests..." : "▶️ Run All Tests"}
        </button>
        {currentTest && (
          <div className="current-test">
            Currently running: <strong>{results[currentTest]?.test}</strong>
          </div>
        )}
      </div>

      <div className="test-results">
        {Object.entries(results).map(([key, result]) => (
          <div key={key} className="test-result-item">
            <div className="test-info">
              <span className="test-icon">{getStatusIcon(result.status)}</span>
              <span className="test-name">{result.test}</span>
              <span
                className="test-status"
                style={{ color: getStatusColor(result.status) }}
              >
                {result.status.toUpperCase()}
              </span>
            </div>

            {result.duration && (
              <div className="test-duration">{result.duration}ms</div>
            )}

            {result.error && (
              <div className="test-error">
                <strong>Error:</strong> {result.error}
              </div>
            )}

            {result.details && (
              <div className="test-details">
                <details>
                  <summary>Details</summary>
                  <pre>{JSON.stringify(result.details, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
        ))}
      </div>

      {passedTests === totalTests && failedTests === 0 && (
        <div className="test-success">
          🎉 All voice system tests passed! Luna is fully operational.
        </div>
      )}

      {failedTests > 0 && (
        <div className="test-warnings">
          ⚠️ Some tests failed. Check the details above for troubleshooting.
        </div>
      )}

      <style>{`
        .voice-system-test {
          padding: 20px;
          background: #1a1a1a;
          border-radius: 12px;
          color: white;
          max-width: 800px;
          margin: 20px auto;
        }

        .test-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid #333;
        }

        .test-header h2 {
          margin: 0;
          color: #00ff41;
        }

        .test-stats {
          display: flex;
          gap: 15px;
        }

        .stat {
          font-family: monospace;
          font-weight: bold;
        }

        .stat.passed { color: #00ff41; }
        .stat.failed { color: #ff4444; }
        .stat.total { color: #00aaff; }

        .test-controls {
          margin-bottom: 25px;
          text-align: center;
        }

        .run-tests-button {
          background: linear-gradient(135deg, #00ff41 0%, #00cc33 100%);
          border: none;
          color: black;
          padding: 12px 25px;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .run-tests-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0, 255, 65, 0.3);
        }

        .run-tests-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        .current-test {
          margin-top: 10px;
          color: #00aaff;
          font-style: italic;
        }

        .test-results {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .test-result-item {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 15px;
          transition: all 0.2s ease;
        }

        .test-result-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .test-info {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .test-icon {
          font-size: 18px;
        }

        .test-name {
          flex-grow: 1;
          font-weight: 500;
        }

        .test-status {
          font-family: monospace;
          font-weight: bold;
          font-size: 12px;
        }

        .test-duration {
          color: #888;
          font-family: monospace;
          font-size: 12px;
          margin-left: 30px;
        }

        .test-error {
          background: rgba(255, 68, 68, 0.1);
          border: 1px solid rgba(255, 68, 68, 0.3);
          border-radius: 4px;
          padding: 10px;
          margin-top: 10px;
          font-size: 14px;
        }

        .test-details {
          margin-top: 10px;
        }

        .test-details details {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
          padding: 8px;
        }

        .test-details summary {
          cursor: pointer;
          font-weight: bold;
          color: #00aaff;
        }

        .test-details pre {
          margin: 8px 0 0 0;
          font-size: 12px;
          color: #ccc;
          overflow-x: auto;
        }

        .test-success {
          background: linear-gradient(135deg, rgba(0, 255, 65, 0.1) 0%, rgba(0, 204, 51, 0.1) 100%);
          border: 1px solid rgba(0, 255, 65, 0.3);
          border-radius: 8px;
          padding: 15px;
          margin-top: 20px;
          text-align: center;
          font-weight: bold;
          color: #00ff41;
        }

        .test-warnings {
          background: linear-gradient(135deg, rgba(255, 170, 0, 0.1) 0%, rgba(255, 136, 0, 0.1) 100%);
          border: 1px solid rgba(255, 170, 0, 0.3);
          border-radius: 8px;
          padding: 15px;
          margin-top: 20px;
          text-align: center;
          font-weight: bold;
          color: #ffaa00;
        }
      `}</style>
    </div>
  );
}
