# WebSocket Streaming STT - Quick Start

## What is WebSocket Streaming STT?

WebSocket Streaming STT is a real-time Speech-to-Text feature that streams audio as you speak, providing faster transcriptions compared to traditional file upload methods.

## Quick Start

### 1. Setup Environment

Ensure you have an OpenAI API key configured:

```bash
# Add to .env file
OPENAI_API_KEY=sk-proj-your-key-here
```

### 2. Start the Server

```bash
npm run build
npm start
```

The server will initialize WebSocket STT at:
- **WebSocket Endpoint:** `ws://localhost:3000/ws/voice/stt`
- **Status API:** `http://localhost:3000/api/voice/websocket-stt/status`

### 3. Test with HTML Demo

Open the test page in your browser:

```bash
# Serve the test page
npx http-server test -p 8080
```

Then navigate to: `http://localhost:8080/websocket-stt-test.html`

### 4. Use in Your App

#### Frontend Integration

```typescript
import { WebSocketSTTClient } from './services/WebSocketSTTClient';

const sttClient = new WebSocketSTTClient();

// Listen for transcriptions
sttClient.on('transcription', ({ text, isFinal }) => {
  console.log(`${isFinal ? 'Final' : 'Partial'}: ${text}`);
});

// Connect and start recording
await sttClient.connect();
await sttClient.startRecording();

// Stop when done
sttClient.stopRecording();
```

#### React Component

```tsx
import { WebSocketSTTControls } from './components/WebSocketSTTControls';

function MyApp() {
  return (
    <WebSocketSTTControls 
      onTranscription={(text, isFinal) => {
        if (isFinal) {
          console.log('Final transcription:', text);
        }
      }}
      autoConnect={true}
    />
  );
}
```

## Features

✅ **Real-time streaming** - Audio sent in 1-second chunks  
✅ **Low latency** - ~1-2 seconds from speech to text  
✅ **Multiple formats** - webm, wav, mp3, ogg, opus  
✅ **Smart buffering** - Automatic buffer management  
✅ **Session management** - Multiple concurrent users  
✅ **Auto-reconnection** - Reconnects on disconnect  

## Architecture

```
Frontend → WebSocket → Backend Service → OpenAI Whisper
   ↓          ↓             ↓               ↓
MediaRecorder  Binary      Buffer         Transcribe
              Audio      Management
```

## API Endpoints

### WebSocket
```
ws://localhost:3000/ws/voice/stt
```

Send binary audio data or JSON control messages:
```json
// Control messages
{ "type": "configure", "config": { "language": "es" } }
{ "type": "flush" }
{ "type": "reset" }
{ "type": "get-status" }
```

### REST API

**Check Status:**
```bash
curl http://localhost:3000/api/voice/websocket-stt/status
```

**List Sessions:**
```bash
curl http://localhost:3000/api/voice/websocket-stt/sessions
```

**Health Check:**
```bash
curl http://localhost:3000/api/voice/websocket-stt/health
```

## Configuration

Update STT configuration:

```typescript
await sttClient.updateConfig({
  language: 'es',           // Spanish
  temperature: 0.2,         // More deterministic
  minChunkDuration: 2000,   // 2 seconds minimum
  maxChunkDuration: 5000    // 5 seconds maximum
});
```

## Troubleshooting

### Can't Connect

```bash
# Check if server is running
curl http://localhost:3000/health

# Check WebSocket endpoint
curl http://localhost:3000/api/voice/websocket-stt/health
```

### No Audio Detected

1. Check browser microphone permissions
2. Verify audio input device is working
3. Check browser console for errors

### Poor Transcription Quality

1. Reduce background noise
2. Speak clearly and at moderate volume
3. Check audio format (webm opus recommended)
4. Adjust buffer duration settings

## Cost

OpenAI Whisper API pricing:
- **$0.006 per minute** of audio
- Example: 1 hour of recording = $0.36

Buffer management helps reduce costs by:
- Combining small chunks
- Avoiding redundant API calls
- Processing only when necessary

## Documentation

Full documentation: `docs/WEBSOCKET_STT_GUIDE.md`

Topics covered:
- Architecture details
- API reference
- Configuration options
- Performance tuning
- Security considerations
- Advanced usage examples

## Testing

### Unit Tests
```bash
npm test -- websocket-stt
```

### Interactive Demo
Open `test/websocket-stt-test.html` in browser

### Manual Testing
1. Start backend: `npm run backend`
2. Open demo page
3. Click "Connect"
4. Click "Start Recording"
5. Speak into microphone
6. See transcriptions appear in real-time

## Comparison: WebSocket vs File Upload

| Feature | WebSocket Streaming | File Upload |
|---------|-------------------|-------------|
| Latency | **1-2 seconds** | 2-5 seconds |
| Real-time | ✅ Yes | ❌ No |
| Use Case | Conversations | Voice messages |
| Complexity | Higher | Lower |
| Buffer Management | Automatic | Manual |

## Next Steps

1. **Voice Activity Detection (VAD)** - Only send audio when speech is detected
2. **Language Auto-detection** - Automatically detect language
3. **Custom Whisper Models** - Support fine-tuned models
4. **Edge Optimization** - Reduce latency with edge servers
5. **Mobile Support** - Optimize for mobile devices

## Support

- Documentation: `docs/WEBSOCKET_STT_GUIDE.md`
- GitHub Issues: [Luna-Agent Issues](https://github.com/ProtocolSage/Luna-Agent/issues)
- Test Page: `test/websocket-stt-test.html`

## License

This feature is part of Luna Agent and subject to the project's MIT license.
