// app/renderer/config/voiceConfig.ts
// Optimized voice configuration for Luna Agent production environment

import { EnhancedVoiceConfig } from '../services/EnhancedVoiceService';

/**
 * Voice configuration optimized for Luna Agent environment
 * Based on typical office/home environments and Luna's existing STT system
 */
export const LUNA_VOICE_CONFIG: EnhancedVoiceConfig = {
  // Voice Activity Detection - Tuned for typical environments
  vadEnabled: true,
  vadThreshold: -45,        // Slightly less sensitive for office environments
  silenceThreshold: -65,    // Allow for natural pauses in speech
  silenceTimeout: 1800,     // 1.8 seconds (shorter than default for responsiveness)
  noiseGateThreshold: -50,  // Filter background noise (keyboards, AC, etc.)
  
  // Push-to-Talk settings
  pttKey: 'Space',          // Space bar (most intuitive)
  pttMouseButton: false,    // Disabled by default (can cause accidental triggers)
  
  // Audio processing optimized for Luna
  sampleRate: 16000,        // Standard for speech recognition
  smoothingTimeConstant: 0.85, // Slightly more smoothing for stability
  fftSize: 2048,            // Good balance of accuracy and performance
  
  // Visual feedback for debugging and user confidence
  showAudioLevels: true,    // Always show for user awareness
  showConfidence: true,     // Show transcription confidence
  showDebugInfo: false,     // Only for development/troubleshooting
  
  // Performance settings for production
  chunkSize: 4096,          // Optimal for real-time processing
  maxRecordingDuration: 25000, // 25 seconds (shorter for responsiveness)
  audioBufferSize: 8192,    // Good balance of latency and quality
};

/**
 * Environment-specific configurations
 */
export const VOICE_ENVIRONMENT_CONFIGS = {
  // Quiet home office
  QUIET: {
    ...LUNA_VOICE_CONFIG,
    vadThreshold: -55,       // More sensitive
    silenceTimeout: 2500,    // Longer pauses allowed
    noiseGateThreshold: -60, // Lower noise gate
  },
  
  // Noisy office environment
  NOISY: {
    ...LUNA_VOICE_CONFIG,
    vadThreshold: -35,       // Less sensitive
    silenceTimeout: 1200,    // Shorter pauses
    noiseGateThreshold: -40, // Higher noise gate
    pttMouseButton: true,    // Enable mouse PTT as backup
  },
  
  // Gaming/streaming setup
  GAMING: {
    ...LUNA_VOICE_CONFIG,
    vadThreshold: -40,
    silenceTimeout: 1500,
    pttKey: 'ControlLeft',   // Left Ctrl instead of Space
    pttMouseButton: true,
    maxRecordingDuration: 15000, // Shorter for gaming contexts
  },
  
  // Mobile/laptop on the go
  MOBILE: {
    ...LUNA_VOICE_CONFIG,
    vadThreshold: -40,       // Account for built-in mic quality
    silenceTimeout: 2000,
    chunkSize: 2048,         // Smaller chunks for battery life
    fftSize: 1024,           // Reduce CPU usage
    audioBufferSize: 4096,
  },
  
  // Development/debugging
  DEBUG: {
    ...LUNA_VOICE_CONFIG,
    showDebugInfo: true,     // Always show debug info
    showAudioLevels: true,
    showConfidence: true,
    vadThreshold: -50,       // Balanced for testing
    silenceTimeout: 3000,    // Longer timeout for testing
  }
};

/**
 * Detect environment and return appropriate config
 */
export function getOptimalVoiceConfig(): EnhancedVoiceConfig {
  // Check if we're in development mode
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Check user agent for mobile
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Check for gaming indicators (high refresh rate, gaming user agent, etc.)
  const isGaming = screen.refreshRate > 120 || navigator.userAgent.includes('Gaming');
  
  // Auto-detect environment based on various factors
  if (isDevelopment) {
    console.log('[VoiceConfig] Using DEBUG configuration for development');
    return VOICE_ENVIRONMENT_CONFIGS.DEBUG;
  }
  
  if (isMobile) {
    console.log('[VoiceConfig] Using MOBILE configuration');
    return VOICE_ENVIRONMENT_CONFIGS.MOBILE;
  }
  
  if (isGaming) {
    console.log('[VoiceConfig] Using GAMING configuration');
    return VOICE_ENVIRONMENT_CONFIGS.GAMING;
  }
  
  // Default to standard Luna config
  console.log('[VoiceConfig] Using standard LUNA configuration');
  return LUNA_VOICE_CONFIG;
}

/**
 * Get config for specific environment (manual override)
 */
export function getEnvironmentConfig(environment: keyof typeof VOICE_ENVIRONMENT_CONFIGS): EnhancedVoiceConfig {
  return VOICE_ENVIRONMENT_CONFIGS[environment];
}

/**
 * Test current environment and recommend optimal settings
 */
export async function testEnvironmentAndRecommend(): Promise<{
  recommended: EnhancedVoiceConfig;
  reasons: string[];
  environment: string;
}> {
  const reasons: string[] = [];
  let environment = 'LUNA';
  let config = LUNA_VOICE_CONFIG;
  
  try {
    // Test microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    
    // Sample audio for 2 seconds to detect environment
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const samples: number[] = [];
    
    for (let i = 0; i < 20; i++) {
      analyser.getByteFrequencyData(dataArray);
      const avgLevel = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
      samples.push(avgLevel);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Analyze noise levels
    const avgNoise = samples.reduce((sum, val) => sum + val, 0) / samples.length;
    const noiseVariation = Math.sqrt(samples.reduce((sum, val) => sum + Math.pow(val - avgNoise, 2), 0) / samples.length);
    
    // Clean up
    stream.getTracks().forEach(track => track.stop());
    audioContext.close();
    
    // Make recommendations based on analysis
    if (avgNoise > 30) {
      environment = 'NOISY';
      config = VOICE_ENVIRONMENT_CONFIGS.NOISY;
      reasons.push(`High background noise detected (${avgNoise.toFixed(1)})`);
      reasons.push('Using less sensitive voice detection');
      reasons.push('Enabled mouse push-to-talk as backup');
    } else if (avgNoise < 10) {
      environment = 'QUIET';
      config = VOICE_ENVIRONMENT_CONFIGS.QUIET;
      reasons.push(`Very quiet environment detected (${avgNoise.toFixed(1)})`);
      reasons.push('Using more sensitive voice detection');
      reasons.push('Allowing longer speech pauses');
    } else {
      reasons.push(`Moderate noise environment detected (${avgNoise.toFixed(1)})`);
      reasons.push('Using balanced voice detection settings');
    }
    
    if (noiseVariation > 20) {
      reasons.push('Variable noise detected - increased noise gate');
    }
    
  } catch (error) {
    reasons.push('Could not access microphone for environment testing');
    reasons.push('Using default Luna configuration');
  }
  
  return {
    recommended: config,
    reasons,
    environment
  };
}

/**
 * Save user's preferred voice configuration
 */
export function saveVoiceConfig(config: Partial<EnhancedVoiceConfig>): void {
  try {
    const savedConfig = {
      ...LUNA_VOICE_CONFIG,
      ...config,
      timestamp: Date.now()
    };
    localStorage.setItem('luna-voice-config', JSON.stringify(savedConfig));
    console.log('[VoiceConfig] Saved user voice configuration');
  } catch (error) {
    console.warn('[VoiceConfig] Failed to save voice configuration:', error);
  }
}

/**
 * Load user's saved voice configuration
 */
export function loadSavedVoiceConfig(): EnhancedVoiceConfig | null {
  try {
    const saved = localStorage.getItem('luna-voice-config');
    if (saved) {
      const config = JSON.parse(saved);
      // Check if config is recent (within 30 days)
      if (config.timestamp && Date.now() - config.timestamp < 30 * 24 * 60 * 60 * 1000) {
        console.log('[VoiceConfig] Loaded saved user voice configuration');
        return config;
      }
    }
  } catch (error) {
    console.warn('[VoiceConfig] Failed to load saved voice configuration:', error);
  }
  return null;
}

/**
 * Get final voice configuration (saved user config > auto-detected > default)
 */
export function getFinalVoiceConfig(): EnhancedVoiceConfig {
  // Try to load saved user config first
  const savedConfig = loadSavedVoiceConfig();
  if (savedConfig) {
    return savedConfig;
  }
  
  // Fall back to auto-detected optimal config
  return getOptimalVoiceConfig();
}
