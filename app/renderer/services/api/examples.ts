// app/renderer/services/api/examples.ts
// Comprehensive examples of how to use the new API clients

import { tts, transcribe, playMp3Blob, TTSOptions } from "./voiceClient";
import { addMemory, recent, search } from "./memoryClient";
import { executeTool } from "./toolsClient";

/**
 * Example: Complete voice conversation flow
 */
export async function exampleVoiceConversation(
  userText: string,
  sessionId?: string,
) {
  try {
    // 1. Store user message in memory
    await addMemory(userText, "user", sessionId);

    // 2. Get AI response (your existing chat endpoint)
    const response = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText, sessionId }),
    });
    const data = await response.json();
    const assistantReply = data?.content || data?.message || "";

    // 3. Store assistant reply in memory
    await addMemory(assistantReply, "assistant", sessionId);

    // 4. Convert to speech and play
    const audioBlob = await tts(assistantReply, {
      provider: "elevenlabs",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      stability: 0.75,
      similarityBoost: 0.75,
    });

    const player = playMp3Blob(audioBlob);

    return {
      text: assistantReply,
      audioPlayer: player,
    };
  } catch (error) {
    console.error("Voice conversation failed:", error);
    throw error;
  }
}

/**
 * Example: Handle microphone recording => transcription => response
 */
export async function exampleMicrophoneFlow(
  audioBlob: Blob,
  sessionId?: string,
) {
  try {
    // 1. Transcribe audio to text
    const userText = await transcribe(audioBlob);
    console.log("User said:", userText);

    // 2. Continue with voice conversation
    return await exampleVoiceConversation(userText, sessionId);
  } catch (error) {
    console.error("Microphone flow failed:", error);
    throw error;
  }
}

/**
 * Example: Search conversation history with context
 */
export async function exampleMemorySearch(query: string, sessionId?: string) {
  try {
    // Search for relevant memories
    const searchResults = await search(query, 8, sessionId);

    // Get recent conversation for context
    const recentContext = await recent(10, sessionId);

    return {
      relevantMemories: searchResults.items,
      recentContext: recentContext.items,
      hasResults: searchResults.items.length > 0,
    };
  } catch (error) {
    console.error("Memory search failed:", error);
    throw error;
  }
}

/**
 * Example: Enhanced TTS with different voices and settings
 */
export async function exampleAdvancedTTS(text: string) {
  const ttsOptions: TTSOptions[] = [
    // Try ElevenLabs first with specific voice
    {
      provider: "elevenlabs",
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Nova voice
      stability: 0.55,
      similarityBoost: 0.75,
    },
    // Fallback to OpenAI
    {
      provider: "openai",
      voiceId: "alloy",
    },
    // Ultimate fallback (backend will choose)
    {},
  ];

  for (const options of ttsOptions) {
    try {
      const audioBlob = await tts(text, options);
      const player = playMp3Blob(audioBlob);

      console.log(
        `TTS successful with provider: ${options.provider || "auto"}`,
      );
      return player;
    } catch (error) {
      console.warn(`TTS failed with ${options.provider || "auto"}:`, error);
      continue;
    }
  }

  // If all TTS fails, fall back to Web Speech API
  console.log("All TTS providers failed, using Web Speech API");
  const synth = window.speechSynthesis;
  if (synth) {
    const utterance = new SpeechSynthesisUtterance(text);
    synth.speak(utterance);
    return {
      element: null,
      stop: () => synth.cancel(),
    };
  }

  throw new Error("All speech synthesis options failed");
}

/**
 * Example: Tool execution with error handling
 */
export async function exampleToolExecution(
  toolName: string,
  input: any,
  sessionId?: string,
) {
  try {
    const result = await executeTool(toolName, input, sessionId);

    // Store tool usage in memory for context
    await addMemory(
      `Used tool ${toolName} with result: ${JSON.stringify(result)}`,
      "tool",
      sessionId,
      { toolName, input, result },
    );

    return result;
  } catch (error) {
    console.error(`Tool execution failed for ${toolName}:`, error);

    // Store failure in memory too
    await addMemory(
      `Tool ${toolName} failed: ${error}`,
      "tool_error",
      sessionId,
      { toolName, input, error: String(error) },
    );

    throw error;
  }
}
