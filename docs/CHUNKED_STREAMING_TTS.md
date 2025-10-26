# Chunked Streaming TTS Implementation Guide

## Overview

Chunked Streaming TTS enables low-latency text-to-speech by streaming audio chunks as they are generated, rather than waiting for the complete audio file. This significantly reduces Time-To-First-Byte (TTFB) and provides a better user experience.

## Features

- **Lower Latency**: Audio playback starts as soon as the first chunk arrives
- **Progressive Streaming**: Audio chunks are transmitted using HTTP chunked transfer encoding
- **Backward Compatible**: Original non-streaming endpoint remains available
- **OpenAI Integration**: Leverages OpenAI's streaming TTS API
- **Configurable**: Enable/disable via `VOICE_STREAMING_ENABLED` environment variable

## Architecture

### Backend Implementation

The streaming TTS is implemented in `backend/routes/voice.ts`:

```typescript
// New streaming endpoint
POST /api/voice/tts/stream
```

Key features:
- Uses HTTP chunked transfer encoding
- Streams OpenAI TTS response directly to client
- Proper error handling and stream cleanup
- Content-Type: audio/mpeg

### Frontend Implementation

The frontend streaming client is in `app/renderer/services/api/voiceClient.ts`:

```typescript
// Streaming TTS functions
ttsStream(text, options)      // Returns AsyncGenerator of audio chunks
playStreamingTTS(text, options) // High-level playback function
```

Key features:
- AsyncGenerator API for chunk-by-chunk processing
- Web Audio API for progressive audio playback
- Automatic buffer management
- Stop/cancel capability

## Usage

### Backend API

#### Check Streaming Availability

```bash
GET /api/voice/tts/check
```

Response:
```json
{
  "status": "ok",
  "providers": {
    "openai": true,
    "streaming": true
  },
  "streaming": {
    "enabled": true,
    "available": true,
    "endpoint": "/api/voice/tts/stream",
    "supportedProviders": ["openai"]
  }
}
```

#### Streaming TTS Request

```bash
POST /api/voice/tts/stream
Content-Type: application/json

{
  "text": "Hello, this is a streaming test.",
  "voiceId": "alloy",
  "provider": "openai"
}
```

Response: `audio/mpeg` with chunked transfer encoding

### Frontend Usage

#### Basic Streaming Playback

```typescript
import { playStreamingTTS } from './services/api/voiceClient';

// Play with streaming
const { stop, promise } = await playStreamingTTS('Hello world', {
  voiceId: 'alloy'
});

// Wait for completion
await promise;

// Or stop early
stop();
```

#### Manual Chunk Processing

```typescript
import { ttsStream } from './services/api/voiceClient';

// Process chunks manually
for await (const chunk of ttsStream('Hello world')) {
  console.log('Received chunk:', chunk.length, 'bytes');
  // Process chunk...
}
```

#### Fallback to Non-Streaming

```typescript
import { tts, playMp3Blob } from './services/api/voiceClient';

// Non-streaming (original behavior)
const audioBlob = await tts('Hello world', {
  provider: 'openai',
  streaming: false  // or omit this parameter
});

const player = playMp3Blob(audioBlob);
await new Promise(resolve => player.element.onended = resolve);
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Enable chunked streaming TTS (default: true)
VOICE_STREAMING_ENABLED=true

# OpenAI API key required for streaming
OPENAI_API_KEY=sk-...
```

### Feature Toggle

The streaming feature can be toggled without code changes by setting `VOICE_STREAMING_ENABLED=false`. The system will gracefully fall back to non-streaming mode.

## Performance Characteristics

### Latency Comparison

| Mode | TTFB | Total Time | User Experience |
|------|------|------------|-----------------|
| Non-streaming | 2-5s | 2-5s | Wait for complete audio |
| Streaming | 200-500ms | 2-5s | Audio starts immediately |

### Network Traffic

Both modes transfer the same amount of data. Streaming uses chunked transfer encoding which:
- Has minimal overhead (chunk size headers)
- Enables progressive rendering
- Works with existing HTTP infrastructure

## Supported Providers

### OpenAI (Streaming Supported) ✅

- Model: `tts-1`
- Voices: alloy, echo, fable, onyx, nova, shimmer
- Format: MP3
- Streaming: Yes

### ElevenLabs (Streaming Not Supported) ⚠️

- ElevenLabs already streams responses internally
- Use the standard `/api/voice/tts` endpoint with `provider: 'elevenlabs'`

### Web Speech API (Not Applicable) ⚠️

- Browser-native TTS
- No network requests
- Instant playback

## Error Handling

### Backend Errors

```typescript
// Missing API key
{ "error": "OpenAI API key not configured" }

// Invalid provider
{ "error": "Streaming TTS only supported with OpenAI provider" }

// OpenAI API error
{ "error": "OpenAI TTS failed", "details": "..." }
```

### Frontend Errors

```typescript
try {
  const { promise } = await playStreamingTTS('Hello');
  await promise;
} catch (error) {
  if (error.message.includes('Stream')) {
    // Streaming error - fall back to non-streaming
    const blob = await tts('Hello', { streaming: false });
    playMp3Blob(blob);
  }
}
```

## Testing

### Integration Tests

Run the streaming TTS tests:

```bash
# Requires OPENAI_API_KEY
npm test -- streaming-tts.test.ts
```

Test coverage:
- ✅ Streaming capability detection
- ✅ Request validation (missing text, invalid provider)
- ✅ Short text streaming
- ✅ Long text streaming
- ✅ Backward compatibility (non-streaming endpoint)

### Manual Testing

```bash
# Start backend
npm run dev:backend

# Test streaming endpoint
curl -X POST http://localhost:3001/api/voice/tts/stream \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","provider":"openai"}' \
  --output test.mp3

# Play the result
mpv test.mp3  # or your preferred player
```

## Browser Compatibility

### Web Audio API Support

- Chrome 14+
- Firefox 25+
- Safari 6+
- Edge 79+

### Fetch Streams API Support

- Chrome 43+
- Firefox 65+
- Safari 10.1+
- Edge 14+

**Note**: All modern browsers support both APIs required for streaming TTS.

## Troubleshooting

### Streaming Not Available

Check:
1. `VOICE_STREAMING_ENABLED=true` in `.env`
2. `OPENAI_API_KEY` is configured
3. Backend logs for errors

### Audio Playback Issues

Check:
1. Browser console for errors
2. Audio permissions in browser
3. Network tab for failed requests

### Performance Issues

Check:
1. Network latency to OpenAI API
2. Client-side audio buffer size
3. Server CPU/memory usage

## Migration Guide

### From Non-Streaming to Streaming

No code changes required! The system detects streaming capability automatically:

```typescript
// This will use streaming if available
const blob = await tts('Hello', { provider: 'openai' });
```

### Explicit Streaming Control

```typescript
// Force streaming
const blob = await tts('Hello', { 
  provider: 'openai',
  streaming: true 
});

// Force non-streaming
const blob = await tts('Hello', { 
  provider: 'openai',
  streaming: false 
});
```

## Future Enhancements

Potential improvements:
- [ ] MediaSource API for true progressive playback (eliminate buffering)
- [ ] WebSocket-based streaming for bi-directional control
- [ ] Streaming support for ElevenLabs provider
- [ ] Chunk size optimization based on network conditions
- [ ] Streaming metrics and monitoring

## References

- [OpenAI TTS API Documentation](https://platform.openai.com/docs/guides/text-to-speech)
- [HTTP Chunked Transfer Encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Transfer-Encoding)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
