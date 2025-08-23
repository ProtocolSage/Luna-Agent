# Frontend API Clients

This directory contains the frontend API clients that provide a clean interface between the renderer and backend services.

## Overview

The API clients solve several critical issues:
- **CSP Compliance**: Work with strict Content Security Policy
- **Process Isolation**: Remove `process is not defined` errors by keeping Node.js dependencies in backend
- **Error Handling**: Graceful fallbacks and proper error propagation
- **Type Safety**: Full TypeScript support with proper interfaces

## Files

### Core Clients

- **`voiceClient.ts`** - TTS/STT functionality
- **`memoryClient.ts`** - Conversation persistence and search
- **`toolsClient.ts`** - Agent tool execution
- **`index.ts`** - Centralized exports
- **`examples.ts`** - Comprehensive usage examples

## Quick Start

```typescript
import { tts, transcribe, playMp3Blob } from '../services/api/voiceClient';
import { addMemory, search } from '../services/api/memoryClient';
```

## Voice Client Usage

### Text-to-Speech

```typescript
// Basic TTS (backend chooses best provider)
const audio = await tts("Hello world");
const player = playMp3Blob(audio);

// Advanced TTS with specific settings
const audio = await tts("Hello world", {
  provider: 'elevenlabs',
  voiceId: '21m00Tcm4TlvDq8ikWAM',
  stability: 0.75,
  similarityBoost: 0.75
});
const player = playMp3Blob(audio);

// Stop audio
player.stop();
```

### Speech-to-Text

```typescript
// Transcribe recorded audio
const transcript = await transcribe(audioBlob);
console.log('User said:', transcript);
```

## Memory Client Usage

### Store Conversations

```typescript
// Store user message
await addMemory(userText, 'user', sessionId);

// Store assistant reply
await addMemory(assistantReply, 'assistant', sessionId);
```

### Search & Retrieve

```typescript
// Search for relevant context
const results = await search('machine learning', 8, sessionId);

// Get recent conversations
const recent = await recent(20, sessionId);
```

## Integration Pattern

### Complete Conversation Flow

```typescript
async function handleSend(text: string) {
  // 1. Store user message
  await addMemory(text, 'user', sessionId);

  // 2. Get AI response
  const response = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, sessionId })
  });
  const data = await response.json();
  const assistantReply = data?.content || '';

  // 3. Store assistant reply
  await addMemory(assistantReply, 'assistant', sessionId);

  // 4. Speak the response
  await handleAssistantReplySpeak(assistantReply);
}

async function handleAssistantReplySpeak(text: string) {
  try {
    const audio = await tts(text);
    const player = playMp3Blob(audio);
  } catch (error) {
    // Graceful fallback to Web Speech API
    const synth = window.speechSynthesis;
    if (synth) {
      const utterance = new SpeechSynthesisUtterance(text);
      synth.speak(utterance);
    }
  }
}

async function handleMicrophoneStop(audioBlob: Blob) {
  try {
    const text = await transcribe(audioBlob);
    await handleSend(text);
  } catch (error) {
    console.error('Transcription failed:', error);
  }
}
```

## Error Handling

All clients include comprehensive error handling:

- **Network failures**: Proper error messages with status codes
- **Provider fallbacks**: TTS automatically falls back from ElevenLabs → OpenAI → Web Speech
- **Graceful degradation**: Voice features work even if backend services are unavailable
- **Type safety**: All errors are properly typed

## Backend Routes

The clients connect to these backend endpoints:

- `POST /api/voice/tts` - Text-to-speech conversion
- `POST /api/voice/transcribe` - Speech-to-text conversion
- `POST /api/memory/add` - Store memory items
- `GET /api/memory/recent` - Retrieve recent memories
- `GET /api/memory/search` - Semantic search memories
- `POST /api/tools/execute` - Execute agent tools

## Compatibility

- **ElevenLabs Service**: Fully compatible with existing `elevenLabsService.ts`
- **Legacy Clients**: Gradual migration supported (both old and new clients can coexist)
- **CSP Compliant**: Works with strict Content Security Policy
- **Browser Support**: Modern browsers with fetch API and Web Audio API

## Migration

To migrate from direct backend calls:

1. **Replace direct fetch calls** with client functions
2. **Update imports** to use the new API clients
3. **Add error handling** using the provided patterns
4. **Test fallbacks** to ensure graceful degradation

The integration in `FuturisticUI.tsx` demonstrates complete migration with backward compatibility.
