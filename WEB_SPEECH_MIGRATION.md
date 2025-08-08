# Web Speech API Migration Guide

This guide explains how Luna Agent's new Hybrid STT system solves the Web Speech API issues you were experiencing.

## The Problem We Solved

### Web Speech API Issues:
```
Speech recognition error: network (repeats endlessly)
OnSizeReceived failed with Error: -2 (harmless but noisy)
Autofill.* failed in DevTools (cosmetic, ignorable)
```

### Root Causes:
1. **Network Error Loop**: Web Speech API fails in Electron due to origin restrictions
2. **Google Throttling**: Cloud speech service rejects requests/geo-blocks
3. **No Fallback**: Application becomes unusable when Web Speech fails
4. **Production Unsuitability**: Unreliable for commercial deployment

## The Solution: Hybrid STT System

### Immediate Fixes Applied:

#### 1. Network Error Loop (FIXED ✅)
**Before:**
```typescript
recognition.onerror = (event) => {
  if (event.error === 'network') {
    // Endlessly retries, creating error loop
    this.handleNetworkError();
  }
}
```

**After:**
```typescript
recognition.onerror = (event) => {
  if (event.error === 'network') {
    console.log('Speech recognition network error detected');
    this.handleNetworkError();
    // IMMEDIATE FIX: Stop the error loop
    this.stopListening();
    if (window.voiceIPC) {
      window.voiceIPC.send('vad', { status: 'stt-failed', reason: 'network' });
    }
    this.retryCount = this.maxRetries; // Prevent auto-retry loop
  }
}
```

#### 2. Graceful Fallback (IMPLEMENTED ✅)
When Web Speech fails, the system now:
1. Stops the failed Web Speech recognition
2. Displays "Web Speech failed - Hybrid STT will take over"  
3. Automatically starts Hybrid STT within 1 second
4. Continues voice operation seamlessly

#### 3. Production-Grade STT (IMPLEMENTED ✅)
- **Cloud-first**: Azure Speech or Deepgram for reliability
- **Local fallback**: Whisper when cloud services are unavailable  
- **Auto-recovery**: Switches back to cloud when available
- **Circuit breaker**: Prevents cascading failures

## Migration Benefits

### Before (Web Speech API):
❌ Fails with network errors in Electron  
❌ No offline support  
❌ Unreliable in production  
❌ Error loops crash the voice system  
❌ No automatic recovery  
❌ Browser-dependent behavior  

### After (Hybrid STT):
✅ Professional cloud STT services (Azure/Deepgram)  
✅ Offline Whisper fallback  
✅ Production-ready reliability  
✅ Graceful error handling  
✅ Automatic failover and recovery  
✅ Consistent cross-platform behavior  

## How the Migration Works

### Automatic Detection
The system detects Web Speech failures and automatically migrates:

```typescript
const handleError = (error: string) => {
  // Check if this is a Web Speech API failure
  if (error.includes('network') || error.includes('Speech recognition')) {
    setState(prev => ({ 
      ...prev, 
      webSpeechFailed: true,
      error: 'Web Speech failed - Hybrid STT will take over',
    }));
    
    // Automatically start hybrid STT after Web Speech failure
    setTimeout(() => {
      if (window.stt) {
        console.log('Starting Hybrid STT after Web Speech failure');
        window.stt.start().catch(console.error);
      }
    }, 1000);
  }
};
```

### Seamless User Experience

1. **User clicks voice button** → Web Speech tries to start
2. **Web Speech fails** → Error message appears briefly
3. **Hybrid STT takes over** → Voice recognition continues  
4. **User continues talking** → No interruption to workflow

### Visual Indicators

The UI now shows:
- **Engine indicator**: ☁️ Azure/Deepgram or 🏠 Whisper
- **Error context**: "Using backup STT" when Web Speech fails
- **Switch controls**: Manual override options
- **Health status**: Current engine performance

## Configuration Options

### Environment Variables (.env)

```bash
# Primary cloud STT service
AZURE_SPEECH_KEY=your_azure_key_here
AZURE_SPEECH_REGION=eastus

# Alternative cloud STT  
DEEPGRAM_API_KEY=your_deepgram_key_here

# System preferences
CLOUD_STT_SERVICE=azure          # or 'deepgram'
STT_PREFER_LOCAL=false           # false = cloud-first
```

### Deployment Strategies

#### Option 1: Cloud-Only (Recommended)
- Configure Azure Speech or Deepgram
- No local dependencies
- Best accuracy and speed
- Handles offline gracefully (shows appropriate message)

#### Option 2: Hybrid with Local Fallback  
- Configure cloud service + bundle Whisper
- Full offline capability
- Larger installer size (~50-100MB for Whisper)
- Best user experience in all conditions

#### Option 3: Local-First
- Set `STT_PREFER_LOCAL=true`
- Starts with Whisper, uses cloud as backup
- Good for privacy-conscious deployments
- Consistent offline performance

## Error Recovery Patterns

### Network Connectivity Issues
```
Cloud STT fails due to network
         ↓
Auto-switch to Whisper (if available)
         ↓  
Periodically test network connectivity
         ↓
Switch back to cloud when available
```

### API Quota/Auth Issues  
```
Cloud STT fails due to quota/auth
         ↓
Log specific error for debugging
         ↓
Switch to Whisper fallback
         ↓
User can manually retry cloud after fixing
```

### Service Outages
```
Cloud STT service is down
         ↓
Circuit breaker opens after 3 failures
         ↓
Fast-fail to Whisper for all requests
         ↓
Periodically retry cloud service
         ↓
Circuit breaker closes when service recovers
```

## Testing the Migration

### 1. Test Web Speech Failure Recovery
1. Start Luna Agent
2. Click voice button (Web Speech may fail)
3. Verify automatic fallback to Hybrid STT
4. Confirm voice recognition continues working

### 2. Test Cloud STT
1. Configure Azure or Deepgram keys in `.env`
2. Restart Luna Agent  
3. Voice button should show ☁️ cloud indicator
4. Test voice recognition - should be fast and accurate

### 3. Test Offline Fallback
1. Disconnect internet
2. Voice button should switch to 🏠 Whisper indicator  
3. Test voice recognition (if Whisper is installed)
4. Reconnect internet - should switch back to cloud

## Troubleshooting Migration

### "Hybrid STT not available" Error
**Cause**: No STT engines configured  
**Solution**: Add cloud API keys to `.env` OR install Whisper

### "All STT systems failed" Error  
**Cause**: Both cloud and local STT unavailable  
**Solution**: 
- Check API keys and network connectivity
- Install/configure Whisper for offline support
- Check browser console for detailed error logs

### Voice recognition seems slower
**Cause**: Using local Whisper instead of cloud STT  
**Solution**: 
- Configure cloud STT credentials
- Check network connectivity
- Use manual switch to cloud button

### UI shows old Web Speech errors
**Cause**: Browser cache or stuck state  
**Solution**:
- Refresh the page (Ctrl+R)  
- Use double-click force reset on voice button
- Clear browser cache

## Performance Comparison

### Web Speech API (Old)
- **Reliability**: Poor in Electron (network errors)
- **Accuracy**: Variable, browser-dependent
- **Offline**: Not supported  
- **Error Recovery**: Manual intervention required
- **Production Suitability**: Not recommended

### Hybrid STT (New)  
- **Reliability**: High (professional services + fallback)
- **Accuracy**: Superior (Azure/Deepgram > Web Speech)
- **Offline**: Supported with Whisper
- **Error Recovery**: Automatic and transparent
- **Production Suitability**: Commercial-grade

## Next Steps

1. **Configure API Keys**: Set up Azure Speech or Deepgram
2. **Test Migration**: Verify Web Speech fallback works
3. **Optional**: Bundle Whisper for full offline support
4. **Monitor**: Check console logs for any migration issues
5. **Deploy**: The system is now production-ready

The migration completely eliminates the Web Speech API network error loops while providing a superior, more reliable voice recognition experience.
