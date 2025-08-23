// app/renderer/integration/VoiceIntegrationExample.tsx
// Example integration for your App.tsx - shows how to add the enhanced voice features

import React, { useEffect, useState } from 'react';
import EnhancedVoiceControls from '../components/EnhancedVoiceControls';
import { getEnhancedVoiceService } from '../services/EnhancedVoiceService';
import { GlobalDebugService } from '../services/GlobalDebugService';
import { getFinalVoiceConfig } from '../config/voiceConfig';

interface VoiceIntegrationExampleProps {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

export const VoiceIntegrationExample: React.FC<VoiceIntegrationExampleProps> = ({
  onTranscript,
  onError
}) => {
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [voiceConfig, setVoiceConfig] = useState(getFinalVoiceConfig());

  // Initialize enhanced voice system
  useEffect(() => {
    const initializeVoiceSystem = async () => {
      try {
        // 1. Initialize global debug service (enables Ctrl+Shift+D)
        GlobalDebugService.initializeGlobally();
        
        // 2. Get enhanced voice service with optimal config
        const enhancedVoice = getEnhancedVoiceService();
        enhancedVoice.updateConfig(voiceConfig);
        
        // 3. Initialize the service
        await enhancedVoice.initialize();
        
        setIsVoiceEnabled(true);
        console.log('[VoiceIntegration] Enhanced voice system initialized successfully');
        
        // 4. Show welcome notification
        console.log(`
🎤 Luna Enhanced Voice System Ready!

Features Available:
• Press Ctrl+Shift+D for debug panel
• Voice Activity Detection (auto-detect speech)
• Push-to-Talk mode (Space key)
• Real-time audio visualization
• Environment auto-detection

Current Configuration:
• VAD Threshold: ${voiceConfig.vadThreshold} dB
• Silence Timeout: ${voiceConfig.silenceTimeout}ms
• Noise Gate: ${voiceConfig.noiseGateThreshold} dB
• PTT Key: ${voiceConfig.pttKey}
        `);

      } catch (error) {
        console.error('[VoiceIntegration] Failed to initialize voice system:', error);
        onError?.(`Voice system initialization failed: ${error.message}`);
      }
    };

    initializeVoiceSystem();
  }, []);

  const handleTranscript = (text: string) => {
    console.log('[VoiceIntegration] Transcript received:', text);
    onTranscript?.(text);
  };

  const handleError = (error: string) => {
    console.error('[VoiceIntegration] Voice error:', error);
    onError?.(error);
  };

  if (!isVoiceEnabled) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        background: 'rgba(255, 152, 0, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 152, 0, 0.3)',
        color: '#ffcc80'
      }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎤</div>
        <div>Initializing Enhanced Voice System...</div>
        <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>
          Setting up advanced voice features
        </div>
      </div>
    );
  }

  return (
    <div className="voice-integration">
      {/* Enhanced Voice Controls with all features enabled */}
      <EnhancedVoiceControls
        onTranscript={handleTranscript}
        onError={handleError}
        showVisualizer={true}
        enableDebugPanel={true}
        className="luna-enhanced-voice"
      />
      
      {/* Optional: Voice system status */}
      <div style={{
        marginTop: '12px',
        fontSize: '12px',
        color: '#888',
        textAlign: 'center'
      }}>
        Enhanced Voice System Active • Press Ctrl+Shift+D for debug panel
      </div>
    </div>
  );
};

export default VoiceIntegrationExample;
