# Wake Word Setup Guide

## Overview

The Luna Agent uses Picovoice Porcupine for wake word detection. This guide will help you set up the "Hey Luna" wake word model.

## Setup Steps

### 1. Download Your Wake Word Model

1. Go to the Picovoice Console: https://console.picovoice.ai/
2. Log in with your account (same one used for the access key)
3. Navigate to your "Hey Luna" wake word model
4. Download the Web (WASM) version of the model (`.ppn` file)
5. The file should be named something like `Hey-Luna_en_wasm_v3.ppn`

### 2. Place the Model File

Copy the downloaded `.ppn` file to:
```
app/renderer/public/assets/Hey-Luna_en_wasm_v3.ppn
```

### 3. Verify Environment Configuration

Ensure your `.env` file contains:
```
PICOVOICE_ACCESS_KEY=vEheY8nulaN9JmhJpi7fpP1+bxAYHeugE8C/6iXmuIOGZTCVlcU6yg==
```

### 4. Update Model Path (if needed)

If your model file has a different name, update the path in:
- `app/renderer/components/VoiceControls.tsx` (line 52)

```typescript
const WAKE_WORD_MODEL_PATH = '/assets/Your-Model-Name.ppn';
```

## Testing

1. Start the Electron app:
```bash
npm run dev
```

2. In the Voice Controls:
   - Set mode to "Auto" 
   - Ensure wake word detection is enabled
   - Say "Hey Luna" to trigger listening

## Troubleshooting

### Model Not Loading
- Check browser console for errors
- Verify the `.ppn` file is in the correct location
- Ensure the file path matches exactly

### Wake Word Not Detecting
- Check microphone permissions
- Verify the Picovoice access key is valid
- Try adjusting the sensitivity in `WakeWordListener.tsx` (currently set to 0.5)

### Performance Issues
- The wake word detection runs entirely in the browser
- No native dependencies required
- Works in Electron renderer process

## Notes

- The wake word model is specific to the phrase "Hey Luna"
- The Web (WASM) version is required for browser/Electron compatibility
- The model file is not included in the repository for licensing reasons
- Each user needs to download their own model from Picovoice Console
