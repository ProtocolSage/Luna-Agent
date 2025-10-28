# WebSocket Streaming STT Documentation

## Overview

The WebSocket Streaming Speech-to-Text (STT) service provides real-time audio transcription via WebSocket connections. Unlike the file upload approach, this service streams audio chunks as they're recorded, resulting in lower latency and a better user experience.

## Features

- **Real-time Streaming**: Audio is sent as it's recorded (1-second chunks)
- **Intelligent Buffering**: Automatically manages buffer sizes (1-10 seconds)
- **Multiple Formats**: Supports webm, wav, mp3, ogg, and opus
- **Partial Results**: Can provide partial transcriptions before final
- **Session Management**: Handles multiple concurrent sessions
- **Auto-Reconnection**: Automatically reconnects on disconnect
- **Low Latency**: Faster than file upload for real-time use cases

## Architecture

```
┌──────────────────┐     WebSocket      ┌──────────────────┐
│                  │   (/ws/voice/stt) │                  │
│  React Frontend  │◄──────────────────►│  Backend Server  │
│                  │                    │                  │
└──────────────────┘                    └──────────────────┘
         │                                       │
         │ MediaRecorder                        │
         ▼                                       │
  ┌─────────────┐                              │
  │  Microphone │                              │
  └─────────────┘                              ▼
                                    ┌──────────────────────┐
                                    │ WebSocketSTTService  │
                                    │                      │
                                    │ - Buffer Management  │
                                    │ - Audio Processing   │
                                    └──────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────────┐
                                    │   OpenAI Whisper     │
                                    │   API (whisper-1)    │
                                    └──────────────────────┘
```

## Backend Components

### WebSocketSTTService

Located: `backend/services/WebSocketSTTService.ts`

**Responsibilities:**
- Receives audio chunks via events
- Buffers audio data intelligently
- Calls OpenAI Whisper API when buffer is ready
- Emits transcription results

**Key Methods:**
```typescript
// Process incoming audio chunk
public async processAudioChunk(audioData: Buffer, format: string): Promise<void>

// Force process remaining buffer
public async flush(): Promise<void>

// Reset service state
public reset(): void

// Update configuration
public updateConfig(updates: Partial<STTConfig>): void

// Get buffer status
public getBufferStatus(): BufferStatus
```

**Configuration Options:**
```typescript
interface STTConfig {
  model: string;              // Default: 'whisper-1'
  language?: string;          // Default: 'en'
  temperature?: number;       // Default: 0
  minChunkDuration: number;   // Default: 1000ms
  maxChunkDuration: number;   // Default: 10000ms
  sampleRate: number;         // Default: 16000
  enablePartialResults: boolean;
}
```

**Events:**
- `transcription`: Final transcription result
- `processing`: Buffer processing status
- `error`: Error occurred

### WebSocket Route Handler

Located: `backend/routes/websocketSTT.ts`

**WebSocket Endpoint:** `/ws/voice/stt`

**Message Types (Client → Server):**

1. **Binary Audio Data**: Send raw audio bytes
2. **JSON Control Messages**:
   - `configure`: Update STT configuration
   - `flush`: Force process buffer
   - `reset`: Reset service state
   - `get-status`: Get current status
   - `audio`: Audio data as base64 (alternative to binary)

**Message Types (Server → Client):**

- `session-ready`: Connection established, session info
- `transcription`: Transcription result
- `processing`: Buffer processing status
- `config-updated`: Configuration updated
- `status-update`: Status response
- `error`: Error occurred

### REST API Endpoints

**Status Endpoint**
```http
GET /api/voice/websocket-stt/status
```

Response:
```json
{
  "isAvailable": true,
  "activeSessions": 2,
  "sessions": [...],
  "capabilities": {
    "streamingSTT": true,
    "partialResults": true,
    "supportedFormats": ["webm", "wav", "mp3", "ogg", "opus"],
    "models": ["whisper-1"]
  },
  "endpoint": "/ws/voice/stt"
}
```

**List Sessions**
```http
GET /api/voice/websocket-stt/sessions
```

**Terminate Session**
```http
DELETE /api/voice/websocket-stt/sessions/:sessionId
```

**Health Check**
```http
GET /api/voice/websocket-stt/health
```

## Frontend Components

### WebSocketSTTClient

Located: `app/renderer/services/WebSocketSTTClient.ts`

**Usage:**

```typescript
import { WebSocketSTTClient } from '../services/WebSocketSTTClient';

// Create client
const client = new WebSocketSTTClient();

// Set up event listeners
client.on('transcription', (result) => {
  console.log('Transcription:', result.text);
  console.log('Is final:', result.isFinal);
});

client.on('error', (error) => {
  console.error('Error:', error);
});

// Connect to server
await client.connect();

// Start recording
await client.startRecording();

// Stop recording (will flush remaining audio)
client.stopRecording();

// Disconnect
client.disconnect();
```

**Events:**
- `connected`: Connected to server
- `disconnected`: Disconnected from server
- `ready`: Session ready with capabilities
- `transcription`: Transcription result received
- `processing`: Buffer being processed
- `recording-started`: Recording started
- `recording-stopped`: Recording stopped
- `error`: Error occurred

**Key Methods:**
```typescript
// Connection management
public async connect(): Promise<void>
public disconnect(): void

// Recording
public async startRecording(): Promise<void>
public stopRecording(): void

// Manual audio sending
public sendAudioData(audioData: ArrayBuffer | Blob): void

// Configuration
public async updateConfig(updates: Partial<STTConfig>): Promise<void>
public getConfig(): STTConfig

// Utility
public async getStatus(): Promise<any>
public reset(): void
public flush(): void
```

### WebSocketSTTControls Component

Located: `app/renderer/components/WebSocketSTTControls.tsx`

**Usage:**

```tsx
import { WebSocketSTTControls } from './components/WebSocketSTTControls';

function MyApp() {
  const handleTranscription = (text: string, isFinal: boolean) => {
    console.log('Transcription:', text, 'Final:', isFinal);
  };
  
  const handleError = (error: string) => {
    console.error('Error:', error);
  };
  
  return (
    <WebSocketSTTControls
      onTranscription={handleTranscription}
      onError={handleError}
      autoConnect={true}
      className="my-custom-class"
    />
  );
}
```

**Props:**
```typescript
interface WebSocketSTTControlsProps {
  onTranscription?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  autoConnect?: boolean;     // Default: true
  className?: string;        // Additional CSS classes
}
```

**Features:**
- Connect/disconnect button
- Start/stop recording button
- Live transcription display
- Buffer status indicator
- Connection status indicator
- Transcription history
- Clear transcriptions button

## Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-proj-...

# Optional (defaults shown)
STT_MODEL=whisper-1
STT_LANGUAGE=en
STT_MIN_CHUNK_DURATION=1000
STT_MAX_CHUNK_DURATION=10000
```

### Server Integration

The WebSocket STT service is automatically initialized in `backend/server.ts`:

```typescript
// Routes mounted at /api/voice/websocket-stt
this.app.use('/api/voice/websocket-stt', websocketSTTRouter);

// WebSocket server at /ws/voice/stt
this.sttWebSocketServer = initializeWebSocketSTT(this.server);
```

## Usage Examples

### Basic Usage

```typescript
import { WebSocketSTTClient } from './services/WebSocketSTTClient';

const client = new WebSocketSTTClient();

// Listen for transcriptions
client.on('transcription', ({ text, isFinal }) => {
  if (isFinal) {
    console.log('Final:', text);
  } else {
    console.log('Partial:', text);
  }
});

// Connect and start
await client.connect();
await client.startRecording();

// Stop after 10 seconds
setTimeout(() => {
  client.stopRecording();
  client.disconnect();
}, 10000);
```

### Custom Configuration

```typescript
const client = new WebSocketSTTClient();

await client.connect();

// Update configuration
await client.updateConfig({
  language: 'es',              // Spanish
  temperature: 0.2,            // More deterministic
  minChunkDuration: 2000,      // 2 seconds minimum
  maxChunkDuration: 5000       // 5 seconds maximum
});

await client.startRecording();
```

### Manual Audio Sending

```typescript
const client = new WebSocketSTTClient();
await client.connect();

// Send pre-recorded audio
const audioBlob = await fetch('/audio/sample.webm').then(r => r.blob());
client.sendAudioData(audioBlob);

// Flush to process
client.flush();
```

### React Integration

```tsx
import React, { useState, useEffect } from 'react';
import { WebSocketSTTClient } from './services/WebSocketSTTClient';

function VoiceChat() {
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const client = React.useRef<WebSocketSTTClient>(null);
  
  useEffect(() => {
    client.current = new WebSocketSTTClient();
    
    client.current.on('transcription', ({ text, isFinal }) => {
      if (isFinal) {
        setTranscript(prev => prev + ' ' + text);
      }
    });
    
    client.current.connect();
    
    return () => client.current?.disconnect();
  }, []);
  
  const toggleRecording = async () => {
    if (isRecording) {
      client.current?.stopRecording();
      setIsRecording(false);
    } else {
      await client.current?.startRecording();
      setIsRecording(true);
    }
  };
  
  return (
    <div>
      <button onClick={toggleRecording}>
        {isRecording ? 'Stop' : 'Start'} Recording
      </button>
      <p>Transcript: {transcript}</p>
    </div>
  );
}
```

## Performance Characteristics

### Latency
- **Connection**: <100ms WebSocket handshake
- **Audio Chunk**: 1 second (configurable)
- **Processing**: 200-500ms per chunk (Whisper API)
- **Total**: ~1.2-1.5s from speech to transcription

### Bandwidth
- **Audio Upload**: ~16 KB/s (webm opus, 16kHz mono)
- **Transcription Download**: <1 KB per result
- **Overhead**: Minimal WebSocket framing

### Cost (OpenAI Whisper API)
- **Pricing**: $0.006 per minute of audio
- **Example**: 10 minutes of recording = $0.06
- **Buffering**: Intelligent buffering reduces API calls

## Comparison with File Upload STT

| Feature | WebSocket Streaming | File Upload |
|---------|-------------------|-------------|
| Latency | Low (~1-2s) | Higher (~2-5s) |
| Use Case | Real-time conversation | Voice messages |
| Buffer Management | Automatic | Manual |
| API Calls | Frequent (every 1-10s) | Once per recording |
| Cost per Minute | Same ($0.006) | Same ($0.006) |
| Reconnection | Automatic | N/A |
| Partial Results | Supported | No |

## Troubleshooting

### Connection Issues

**Problem**: Can't connect to WebSocket
```
Solution: Check that backend server is running and WebSocket is initialized
Logs: Look for "[WebSocketSTT] WebSocket server initialized on /ws/voice/stt"
```

**Problem**: Connection drops frequently
```
Solution: Check network stability, reduce chunk size, enable reconnection
Config: maxReconnectAttempts: 10, reconnectInterval: 3000
```

### Audio Issues

**Problem**: No audio being recorded
```
Solution: Check microphone permissions in browser
Code: await navigator.mediaDevices.getUserMedia({ audio: true })
```

**Problem**: Poor transcription quality
```
Solution: 
1. Check audio quality (sample rate, bit rate)
2. Reduce background noise
3. Adjust VAD threshold
4. Try different audio format (webm opus recommended)
```

### Performance Issues

**Problem**: High latency
```
Solution:
1. Reduce minChunkDuration (but increases API calls)
2. Check network latency
3. Use regional OpenAI endpoints if available
```

**Problem**: High cost
```
Solution:
1. Increase minChunkDuration (fewer API calls)
2. Use voice activity detection to avoid sending silence
3. Enable partial results to reduce redundant calls
```

## Security Considerations

### Authentication
- WebSocket connections should be authenticated
- Consider adding token-based auth to WebSocket handshake
- Validate session IDs

### Rate Limiting
- Implement per-session rate limiting
- Limit concurrent sessions per user
- Monitor and alert on abuse

### Data Privacy
- Audio data is sent to OpenAI for transcription
- Consider end-to-end encryption for sensitive use cases
- Implement data retention policies
- Log access for audit trails

## Testing

### Unit Tests

```typescript
// Test audio chunk processing
describe('WebSocketSTTService', () => {
  it('should buffer audio chunks', async () => {
    const service = new WebSocketSTTService();
    const audioData = Buffer.from('test audio data');
    
    await service.processAudioChunk(audioData, 'webm');
    
    const status = service.getBufferStatus();
    expect(status.chunks).toBe(1);
  });
});
```

### Integration Tests

```typescript
// Test WebSocket connection
describe('WebSocket STT Integration', () => {
  it('should connect and transcribe', async () => {
    const client = new WebSocketSTTClient();
    
    const transcriptionPromise = new Promise((resolve) => {
      client.on('transcription', (result) => {
        resolve(result);
      });
    });
    
    await client.connect();
    // Send test audio
    const testAudio = await loadTestAudio();
    client.sendAudioData(testAudio);
    client.flush();
    
    const result = await transcriptionPromise;
    expect(result.text).toBeTruthy();
  });
});
```

## Future Enhancements

1. **Voice Activity Detection (VAD)**
   - Only send audio when speech is detected
   - Reduce API calls and cost
   - Improve battery life on mobile

2. **Multiple Language Support**
   - Auto-detect language
   - Switch languages mid-session
   - Multi-language UI

3. **Custom Models**
   - Support for fine-tuned Whisper models
   - Local Whisper instances
   - Alternative STT providers

4. **Advanced Features**
   - Speaker diarization
   - Punctuation restoration
   - Profanity filtering
   - Real-time translation

5. **Performance Optimization**
   - Audio compression
   - Adaptive chunk sizes
   - WebSocket connection pooling
   - Edge caching

## Support

For issues or questions:
1. Check troubleshooting section
2. Review logs in browser console and backend
3. File an issue on GitHub
4. Contact support team

## License

This implementation is part of Luna Agent and is subject to the project's license.
