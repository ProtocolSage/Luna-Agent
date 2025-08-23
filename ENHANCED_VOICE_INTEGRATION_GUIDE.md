# 🎤 Luna Enhanced Voice Configuration & Integration Guide

## ✅ **Files Successfully Added to Your Project:**

1. **📁 Configuration Files**
   - `app/renderer/config/voiceConfig.ts` - Environment-specific voice settings
   
2. **📁 Enhanced Services**
   - `app/renderer/services/EnhancedVoiceService.ts` - Advanced voice features
   - `app/renderer/services/GlobalDebugService.ts` - Global debug panel (Ctrl+Shift+D)
   
3. **📁 Enhanced Components**
   - `app/renderer/components/EnhancedVoiceControls.tsx` - Modern voice UI
   - `app/renderer/styles/enhanced-voice.css` - Professional styling
   
4. **📁 Integration Examples**
   - `app/renderer/integration/VoiceIntegrationExample.tsx` - Ready-to-use integration

---

## 🔧 **3. Voice Configuration for Your Environment**

### **Automatic Environment Detection**

The system automatically detects your environment and applies optimal settings:

- **🏠 QUIET Environment**: Home office, quiet room
  - VAD Threshold: -55 dB (more sensitive)
  - Silence Timeout: 2500ms (longer pauses allowed)
  - Noise Gate: -60 dB (lower noise filtering)

- **🏢 NOISY Environment**: Open office, background noise
  - VAD Threshold: -35 dB (less sensitive)
  - Silence Timeout: 1200ms (shorter pauses)
  - Noise Gate: -40 dB (higher noise filtering)
  - Mouse PTT enabled as backup

- **🎮 GAMING Environment**: High refresh rate displays
  - VAD Threshold: -40 dB
  - PTT Key: Left Ctrl (instead of Space)
  - Shorter recording duration

- **📱 MOBILE Environment**: Laptops, mobile devices
  - Optimized for battery life
  - Smaller audio processing chunks

### **Manual Configuration Options**

```typescript
// In your component, you can override settings:
import { getEnhancedVoiceService } from './services/EnhancedVoiceService';
import { getEnvironmentConfig } from './config/voiceConfig';

const enhancedVoice = getEnhancedVoiceService();

// Option 1: Use predefined environment
enhancedVoice.updateConfig(getEnvironmentConfig('NOISY'));

// Option 2: Custom settings
enhancedVoice.updateConfig({
  vadThreshold: -45,        // Adjust sensitivity
  silenceTimeout: 2000,     // 2 seconds of silence
  pttKey: 'ControlLeft',    // Use Left Ctrl for PTT
  showAudioLevels: true,    // Show real-time audio
});
```

### **Environment Testing**

The system can test your environment and recommend settings:

```typescript
import { testEnvironmentAndRecommend } from './config/voiceConfig';

// This runs automatically in the debug panel, or you can call it manually:
const result = await testEnvironmentAndRecommend();
console.log('Recommended environment:', result.environment);
console.log('Recommendations:', result.reasons);
```

---

## 🔧 **4. Global Debug Panel Keyboard Shortcut**

### **Global Shortcut: `Ctrl+Shift+D`**

The debug panel is now available **globally throughout Luna** with these shortcuts:

- **`Ctrl+Shift+D`** - Toggle debug panel
- **`Escape`** - Close debug panel
- **Drag header** - Move panel around
- **Resize handle** - Resize panel

### **Debug Panel Features**

#### **🎤 Voice Metrics Tab**
- Real-time audio levels and speech detection
- SNR (Signal-to-Noise Ratio) monitoring
- Recording duration and confidence tracking
- Live audio visualization bar

#### **🌍 Environment Tab**
- Automatic environment detection and analysis
- System information and compatibility check
- Microphone and audio context status
- Recommended settings for your setup

#### **⚙️ Settings Tab**
- Live adjustment of voice sensitivity
- Push-to-talk key configuration
- Real-time settings preview
- Save/reset functionality

### **Integration in Your App.tsx**

Add this **one line** to your main App component to enable global shortcuts:

```typescript
// At the top of your App.tsx
import { GlobalDebugService } from './services/GlobalDebugService';

// In your App component's useEffect:
useEffect(() => {
  // Enable global Ctrl+Shift+D shortcut
  GlobalDebugService.initializeGlobally();
}, []);
```

---

## 🚀 **Quick Integration Steps**

### **Option 1: Replace Existing VoiceControls (Recommended)**

```typescript
// In your App.tsx or main component:
import EnhancedVoiceControls from './components/EnhancedVoiceControls';
import { GlobalDebugService } from './services/GlobalDebugService';

// Replace your existing VoiceControls with:
<EnhancedVoiceControls 
  onTranscript={handleTranscript}
  onError={handleError}
  showVisualizer={true}        // Real-time audio visualization
  enableDebugPanel={true}      // Enable debug features
/>

// Enable global shortcuts:
useEffect(() => {
  GlobalDebugService.initializeGlobally();
}, []);
```

### **Option 2: Use Complete Integration Example**

```typescript
// Import the ready-to-use integration:
import VoiceIntegrationExample from './integration/VoiceIntegrationExample';

// Use in your app:
<VoiceIntegrationExample
  onTranscript={handleTranscript}
  onError={handleError}
/>
```

### **Option 3: Side-by-Side Testing**

```typescript
// Test both systems together:
import VoiceControls from './components/VoiceControls';           // Your existing
import EnhancedVoiceControls from './components/EnhancedVoiceControls'; // Enhanced

<div style={{ display: 'flex', gap: '20px' }}>
  <div>
    <h3>Current Voice System</h3>
    <VoiceControls 
      onTranscript={handleTranscript}
      onError={handleError}
    />
  </div>
  
  <div>
    <h3>Enhanced Voice System</h3>
    <EnhancedVoiceControls 
      onTranscript={handleTranscript}
      onError={handleError}
      showVisualizer={true}
      enableDebugPanel={true}
    />
  </div>
</div>
```

---

## 🔍 **Testing & Debugging**

### **Testing Checklist**

1. **✅ Build Test**: `npm run build` (check for TypeScript errors)
2. **✅ Launch Test**: `npm start` (verify Luna starts)
3. **✅ Debug Panel**: Press `Ctrl+Shift+D` (should open debug panel)
4. **✅ Voice Modes**: Switch between Auto Detect, Push-to-Talk, Hybrid STT
5. **✅ Audio Visualization**: Speak and watch the audio bar respond
6. **✅ Environment Detection**: Check Environment tab for auto-detection
7. **✅ Settings**: Adjust VAD threshold and see real-time changes

### **Debug Panel Usage**

#### **Reading Audio Metrics:**
- **Audio Level > -50 dB**: Good voice signal ✅
- **Audio Level < -70 dB**: Too quiet, move closer to mic ❌
- **SNR > 10 dB**: Excellent speech clarity ✅
- **SNR < 5 dB**: Noisy environment, use PTT mode ⚠️
- **Confidence > 80%**: High transcription accuracy ✅
- **Confidence < 60%**: Poor audio quality ❌

#### **Optimizing Settings:**
1. Open debug panel (`Ctrl+Shift+D`)
2. Go to **Settings** tab
3. Adjust **VAD Threshold** until speech is reliably detected
4. Set **Silence Timeout** based on your speaking pace
5. Click **Apply Settings** to save

### **Common Configuration Scenarios**

#### **🎧 Gaming/Streaming Setup**
```typescript
enhancedVoice.updateConfig({
  vadThreshold: -40,
  pttKey: 'ControlLeft',    // Left Ctrl instead of Space
  pttMouseButton: true,     // Enable mouse PTT
  silenceTimeout: 1500,     // Quick response
});
```

#### **🏢 Open Office Environment**
```typescript
enhancedVoice.updateConfig({
  vadThreshold: -35,        // Less sensitive
  noiseGateThreshold: -40,  // Higher noise filtering
  silenceTimeout: 1200,     // Shorter timeout
  pttMouseButton: true,     // Backup PTT method
});
```

#### **🏠 Quiet Home Office**
```typescript
enhancedVoice.updateConfig({
  vadThreshold: -55,        // More sensitive
  silenceTimeout: 2500,     // Allow longer pauses
  noiseGateThreshold: -60,  // Lower noise gate
});
```

#### **📱 Mobile/Laptop Use**
```typescript
enhancedVoice.updateConfig({
  vadThreshold: -40,
  chunkSize: 2048,          // Smaller chunks for battery
  fftSize: 1024,            // Reduce CPU usage
  audioBufferSize: 4096,
});
```

---

## 🎛️ **Advanced Features**

### **Real-time Configuration Changes**

```typescript
// Get the enhanced voice service
const enhancedVoice = getEnhancedVoiceService();

// Listen for audio metrics
enhancedVoice.on('audio-metrics', (metrics) => {
  console.log('Audio Level:', metrics.audioLevel);
  console.log('Speech Detected:', metrics.speechDetected);
  console.log('Confidence:', metrics.confidence);
});

// Listen for mode changes
enhancedVoice.on('mode-changed', ({ from, to }) => {
  console.log(`Voice mode changed from ${from} to ${to}`);
});
```

### **Environment-Adaptive Settings**

```typescript
// Automatically adjust settings based on detected noise
enhancedVoice.on('audio-metrics', (metrics) => {
  if (metrics.snr < 5) {
    // Very noisy - make less sensitive
    enhancedVoice.updateConfig({ vadThreshold: -35 });
  } else if (metrics.snr > 15) {
    // Very quiet - make more sensitive
    enhancedVoice.updateConfig({ vadThreshold: -55 });
  }
});
```

### **Custom Voice Modes**

```typescript
// Create custom voice mode for specific use cases
enhancedVoice.setVoiceMode('hybrid');     // Use Luna's existing STT
enhancedVoice.setVoiceMode('push-to-talk'); // Manual control
enhancedVoice.setVoiceMode('continuous');   // Always listening
```

---

## 🚨 **Troubleshooting**

### **If Voice Not Detected**
1. Press `Ctrl+Shift+D` → **Voice Metrics** tab
2. Check **Audio Level** (should be > -70 dB when speaking)
3. Adjust **VAD Threshold** in **Settings** tab
4. Try **Push-to-Talk** mode as test

### **If Too Many False Positives**
1. Increase **VAD Threshold** (make less sensitive)
2. Increase **Noise Gate** threshold
3. Switch to **Push-to-Talk** mode temporarily

### **If Debug Panel Not Working**
1. Check that `GlobalDebugService.initializeGlobally()` is called
2. Try refreshing the page
3. Check browser console for errors

### **If Build Errors**
1. Ensure all import paths are correct
2. Check TypeScript version compatibility
3. Verify all dependencies are installed

---

## 🎉 **You're All Set!**

Your Luna Enhanced Voice System includes:

- **🎤 Advanced Voice Activity Detection** with environment adaptation
- **🎯 Multiple Voice Modes** (Auto, PTT, Continuous, Hybrid STT)
- **📊 Real-time Audio Visualization** with speech detection
- **🔧 Global Debug Panel** (`Ctrl+Shift+D`) for troubleshooting
- **⚙️ Live Settings Adjustment** with automatic saving
- **🌍 Environment Auto-Detection** and optimization
- **🔄 Seamless Integration** with your existing Luna STT system

**The enhanced system works alongside your existing voice infrastructure and provides professional-grade voice interaction capabilities!**

Press `Ctrl+Shift+D` anytime to monitor and adjust your voice settings. Happy voice chatting with Luna! 🎤✨
