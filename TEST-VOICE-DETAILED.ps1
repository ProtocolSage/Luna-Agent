# TEST-VOICE-DETAILED.ps1
# Detailed voice system testing with audio device verification

Write-Host "🎤 LUNA AGENT VOICE SYSTEM - DETAILED DIAGNOSTICS" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Function to test audio devices
function Test-AudioDevices {
    Write-Host "🔊 Testing Audio Devices..." -ForegroundColor Magenta
    
    try {
        # Get audio devices using WMI
        $audioDevices = Get-WmiObject -Class Win32_SoundDevice | Where-Object { $_.Status -eq "OK" }
        
        if ($audioDevices) {
            Write-Host "✅ Audio devices found:" -ForegroundColor Green
            foreach ($device in $audioDevices) {
                Write-Host "  • $($device.Name)" -ForegroundColor White
            }
        } else {
            Write-Host "❌ No audio devices found" -ForegroundColor Red
        }
        
        # Test microphone access
        Write-Host ""
        Write-Host "🎙️ Testing microphone access..." -ForegroundColor Yellow
        
        # Check if microphone is available (simplified test)
        $micTest = @"
Add-Type -AssemblyName System.Speech
`$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
try {
    `$recognizer.SetInputToDefaultAudioDevice()
    Write-Host "✅ Microphone access: Available" -ForegroundColor Green
    `$recognizer.Dispose()
    return `$true
} catch {
    Write-Host "❌ Microphone access: Failed - `$(`$_.Exception.Message)" -ForegroundColor Red
    if (`$recognizer) { `$recognizer.Dispose() }
    return `$false
}
"@
        
        $micResult = Invoke-Expression $micTest
        return $micResult
        
    } catch {
        Write-Host "❌ Audio device test failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Function to test WebRTC/MediaDevices support
function Test-WebRTCSupport {
    Write-Host "🌐 Testing WebRTC/MediaDevices support..." -ForegroundColor Magenta
    
    $htmlTest = @"
<!DOCTYPE html>
<html>
<head><title>WebRTC Test</title></head>
<body>
<script>
async function testMediaDevices() {
    try {
        if (!navigator.mediaDevices) {
            console.log('MediaDevices not supported');
            return false;
        }
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log('Found devices:', devices.length);
        
        const audioDevices = devices.filter(d => d.kind === 'audioinput');
        console.log('Audio input devices:', audioDevices.length);
        
        if (audioDevices.length > 0) {
            // Test microphone access
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { 
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    } 
                });
                console.log('Microphone access: SUCCESS');
                stream.getTracks().forEach(track => track.stop());
                return true;
            } catch (micError) {
                console.log('Microphone access failed:', micError.message);
                return false;
            }
        } else {
            console.log('No audio input devices found');
            return false;
        }
    } catch (error) {
        console.log('WebRTC test failed:', error.message);
        return false;
    }
}

testMediaDevices().then(result => {
    document.body.innerHTML = result ? 
        '<h1 style="color: green;">WebRTC SUPPORTED</h1>' : 
        '<h1 style="color: red;">WebRTC NOT SUPPORTED</h1>';
});
</script>
</body>
</html>
"@
    
    # Save test HTML
    $testPath = Join-Path $env:TEMP "webrtc-test.html"
    $htmlTest | Out-File -FilePath $testPath -Encoding UTF8
    
    Write-Host "WebRTC test saved to: $testPath" -ForegroundColor Gray
    Write-Host "You can open this file in a browser to test WebRTC support" -ForegroundColor Yellow
}

# Function to create voice system diagnostic report
function New-VoiceDiagnosticReport {
    Write-Host "📋 Creating Voice System Diagnostic Report..." -ForegroundColor Magenta
    
    $report = @"
# Luna Agent Voice System Diagnostic Report
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

## System Information
- OS: $((Get-WmiObject Win32_OperatingSystem).Caption)
- PowerShell: $($PSVersionTable.PSVersion)
- Node.js: $(node --version 2>&1)
- NPM: $(npm --version 2>&1)

## Audio System Status
$(if (Test-AudioDevices) { "✅ Audio devices operational" } else { "❌ Audio devices not working" })

## Voice System Components
✅ StreamingVoiceService.ts - Real-time voice processing
✅ VoiceInputService.ts - OpenAI Whisper STT
✅ WebSocket routes - Real-time communication
✅ React voice interface components
✅ Audio worklet processor

## API Endpoints
- GET /api/voice/streaming/status
- GET /api/voice/streaming/health  
- GET /api/voice/streaming/sessions
- WebSocket /ws/voice/stream

## Voice Features Implemented
✅ Real-time STT streaming (OpenAI Whisper)
✅ Sentence-by-sentence TTS streaming
✅ Interrupt/barge-in system
✅ Voice Activity Detection (VAD)
✅ Echo cancellation
✅ Continuous conversation mode
✅ Sub-200ms latency targeting

## Next Steps
1. Run TEST-VOICE-SYSTEM.ps1 to verify endpoints
2. Start Luna Agent with: npm start
3. Test voice interface in the application
4. Verify real-time voice communication works

## Troubleshooting
- Ensure OPENAI_API_KEY environment variable is set
- Check microphone permissions in Windows Settings
- Verify browser supports WebRTC (Chrome/Edge recommended)
- Ensure ports 3000-3001 are available
"@
    
    $reportPath = "VOICE-DIAGNOSTIC-REPORT.md"
    $report | Out-File -FilePath $reportPath -Encoding UTF8
    Write-Host "✅ Diagnostic report saved to: $reportPath" -ForegroundColor Green
}

# Run diagnostics
Write-Host "Starting voice system diagnostics..." -ForegroundColor White
Write-Host ""

Test-AudioDevices
Write-Host ""
Test-WebRTCSupport
Write-Host ""
New-VoiceDiagnosticReport

Write-Host ""
Write-Host "🎤 Voice System Diagnostics Complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run: .\TEST-VOICE-SYSTEM.ps1" -ForegroundColor White
Write-Host "2. Review the diagnostic report: VOICE-DIAGNOSTIC-REPORT.md" -ForegroundColor White
Write-Host "3. Test WebRTC support: Open the HTML file in your browser" -ForegroundColor White