# Hybrid Speech-to-Text (STT) System

Luna Agent now features a robust hybrid STT system that automatically switches between cloud and local speech recognition based on availability and performance.

## Overview

The hybrid STT system provides:
- **Cloud-first approach**: Azure Speech or Deepgram for optimal accuracy and speed
- **Automatic fallback**: Local Whisper when cloud services are unavailable
- **Seamless switching**: Transparent failover without user intervention
- **Circuit breaker pattern**: Prevents cascading failures
- **Zero-configuration**: Works out of the box with sensible defaults

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   VoiceControls │───→│   HybridSTT      │───→│  CloudSTT       │
│   (Renderer)    │    │   (Orchestrator) │    │  (Primary)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                │                        │ (Network/Auth Error)
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   WhisperSTT    │◀───│  Auto-Fallback  │
                       │   (Fallback)    │    │  Logic          │
                       └─────────────────┘    └─────────────────┘
```

## Quick Setup

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure your API keys:

```bash
# Azure Speech (Recommended)
AZURE_SPEECH_KEY=your_azure_speech_key_here
AZURE_SPEECH_REGION=eastus

# OR Deepgram (Alternative)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# STT Configuration
CLOUD_STT_SERVICE=azure          # or 'deepgram'
STT_PREFER_LOCAL=false           # false = cloud-first, true = local-first
```

### 2. Cloud STT Setup

#### Azure Speech Services
1. Go to [Azure Portal](https://portal.azure.com)
2. Create a "Cognitive Services" → "Speech" resource
3. Copy the API key and region
4. Add to your `.env` file

#### Deepgram (Alternative)
1. Go to [Deepgram Console](https://console.deepgram.com/)
2. Create an API key
3. Add to your `.env` file

### 3. Local Whisper Setup (Optional)

For offline fallback capability:

1. **Download Whisper executable**:
   ```bash
   # Windows (recommended location)
   resources/whisper/whisper.exe
   resources/whisper/ggml-tiny.en.bin
   ```

2. **Or install system-wide**:
   ```bash
   # Using pip
   pip install whisper
   
   # Using conda
   conda install whisper
   ```

## How It Works

### Automatic Switching

The hybrid system automatically switches between engines based on:

1. **Network availability**: Offline → Whisper
2. **Service health**: Cloud API down → Whisper  
3. **Authentication**: Invalid API keys → Whisper
4. **Performance**: Repeated failures → Whisper
5. **User preference**: Manual override available

### Error Recovery

```
Cloud STT Fails
      ↓
Switch to Whisper (< 1 second)
      ↓
Continue operation seamlessly
      ↓
Periodically retry Cloud STT
      ↓
Switch back when available
```

### Circuit Breaker

Prevents system overload by:
- Tracking failure rates
- Opening circuit after repeated failures
- Providing fast-fail responses
- Automatically recovering when service improves

## Usage

### Automatic Mode (Default)

```typescript
// The system starts automatically
await window.stt.start();

// Listen for transcriptions
window.stt.onTranscript(({ text, isFinal }) => {
  if (isFinal) {
    console.log('Final transcript:', text);
  }
});

// Listen for engine switches
window.stt.onEngineSwitch(({ engine, isCloud }) => {
  console.log(`Switched to: ${engine} (${isCloud ? 'Cloud' : 'Local'})`);
});
```

### Manual Control

```typescript
// Force switch to cloud STT
await window.stt.switchToCloud();

// Force switch to local Whisper
await window.stt.switchToWhisper();

// Check current status
const status = await window.stt.getStatus();
console.log('Current engine:', status.currentEngine);
console.log('Is using cloud:', status.isCloud);

// Health check
const health = await window.stt.healthCheck();
console.log('Engine health:', health);
```

## UI Integration

The voice controls automatically show:

- **Engine indicator**: ☁️ Cloud or 🏠 Whisper
- **Switch buttons**: Manual engine selection
- **Status display**: Current engine and health
- **Error handling**: Clear error messages and recovery options

## Performance Characteristics

### Cloud STT (Azure/Deepgram)
- **Latency**: <200ms first token
- **Accuracy**: High (better than local Whisper-tiny)
- **Features**: Punctuation, profanity filter, language detection
- **Requirements**: Internet connection, API keys
- **Cost**: Per-minute usage

### Local Whisper
- **Latency**: ~500ms-2s (CPU dependent)  
- **Accuracy**: Good (Whisper-tiny model)
- **Features**: Basic transcription
- **Requirements**: CPU resources, local model files
- **Cost**: Free after setup

## Troubleshooting

### Common Issues

**1. "No STT system available"**
- Ensure either cloud API keys are configured OR Whisper is installed
- Check network connectivity for cloud services

**2. "Cloud STT failed repeatedly"**
- Verify API keys and quotas
- Check service status pages (Azure/Deepgram)
- System will automatically fall back to Whisper

**3. "Whisper not found"**
- Install Whisper system-wide or bundle executable
- Check PATH environment variable
- Verify model files exist

**4. "Poor accuracy"**
- Cloud STT usually provides better accuracy
- For Whisper: Use larger models (base/small vs tiny)
- Ensure good microphone quality

### Debug Mode

Enable verbose logging:

```bash
# In .env
NODE_ENV=development
DEBUG_STT=true
```

Check browser console for detailed STT logs.

## Advanced Configuration

### Custom Model Paths

```typescript
// For bundled Whisper models
const whisperConfig = {
  executablePath: 'resources/whisper/whisper.exe',
  modelPath: 'resources/whisper/ggml-base.en.bin'
};
```

### Network Retry Settings

```typescript
// Adjust retry behavior
const cloudConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  healthCheckInterval: 30000
};
```

### Audio Quality

```typescript
// Optimize for accuracy vs performance
const audioConfig = {
  sampleRate: 16000,        // Standard for STT
  echoCancellation: true,   // Better for cloud STT
  noiseSuppression: true,   // Improves accuracy
  autoGainControl: true     // Consistent volume
};
```

## Migration from Web Speech API

The hybrid system automatically handles Web Speech API failures:

1. Web Speech network errors are caught
2. System displays "Web Speech failed - Hybrid STT will take over"
3. Hybrid STT starts automatically
4. User experience continues seamlessly

No code changes required - existing voice controls continue to work.

## Benefits Over Web Speech API

✅ **Reliability**: No more network error loops  
✅ **Offline Support**: Works without internet via Whisper  
✅ **Better Accuracy**: Professional-grade cloud STT services  
✅ **Automatic Recovery**: Self-healing from failures  
✅ **Cross-Platform**: Works consistently across browsers  
✅ **Production Ready**: Circuit breaker and error handling  
✅ **Future-Proof**: Easy to add new STT providers  

The hybrid STT system transforms Luna Agent from a demo-quality voice interface into a production-ready speech recognition system suitable for commercial deployment.
