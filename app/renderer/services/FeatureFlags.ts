// FeatureFlags.ts - Complete feature flag system for Luna voice agent
import React from "react";

export interface VoiceFeatureFlags {
  // Core Voice Features
  speechToText: boolean;
  textToSpeech: boolean;
  voiceActivation: boolean;
  wakeWordDetection: boolean;

  // Voice Providers
  elevenLabsTTS: boolean;
  openaiTTS: boolean;
  webSpeechTTS: boolean;
  openaiSTT: boolean;
  webSpeechSTT: boolean;

  // Advanced Voice Features
  voiceCloning: boolean;
  multiVoiceSupport: boolean;
  voiceEffects: boolean;
  backgroundNoiseReduction: boolean;
  voiceActivityDetection: boolean;
  continuousListening: boolean;

  // UI Features
  voiceVisualizer: boolean;
  voiceControls: boolean;
  diagnosticPanel: boolean;
  voiceSettings: boolean;

  // Conversation Features
  conversationHistory: boolean;
  contextAwareness: boolean;
  memoryIntegration: boolean;
  streamingResponse: boolean;
  interruptionHandling: boolean;

  // Performance Features
  voiceBuffering: boolean;
  audioCompression: boolean;
  latencyOptimization: boolean;
  offlineMode: boolean;

  // Experimental Features
  emotionalTone: boolean;
  voicePersonalities: boolean;
  adaptiveSpeed: boolean;
  smartPunctuation: boolean;
}

export interface SystemFeatureFlags {
  // Core System
  agentMode: boolean;
  toolsIntegration: boolean;
  memorySystem: boolean;
  securityEnforcement: boolean;

  // UI Features
  darkMode: boolean;
  animations: boolean;
  notifications: boolean;
  keyboardShortcuts: boolean;

  // Development Features
  debugMode: boolean;
  performanceMetrics: boolean;
  errorReporting: boolean;
  devTools: boolean;
}

// Default feature flags - Production ready configuration
export const DEFAULT_VOICE_FLAGS: VoiceFeatureFlags = {
  // Core Voice Features - All enabled
  speechToText: true,
  textToSpeech: true,
  voiceActivation: true,
  wakeWordDetection: true,

  // Voice Providers - All enabled with fallbacks
  elevenLabsTTS: true,
  openaiTTS: true,
  webSpeechTTS: true,
  openaiSTT: true,
  webSpeechSTT: true,

  // Advanced Voice Features - Enabled for full functionality
  voiceCloning: true,
  multiVoiceSupport: true,
  voiceEffects: true,
  backgroundNoiseReduction: true,
  voiceActivityDetection: true,
  continuousListening: true,

  // UI Features - All enabled for rich experience
  voiceVisualizer: true,
  voiceControls: true,
  diagnosticPanel: true,
  voiceSettings: true,

  // Conversation Features - Full conversational AI
  conversationHistory: true,
  contextAwareness: true,
  memoryIntegration: true,
  streamingResponse: true,
  interruptionHandling: true,

  // Performance Features - Optimized for responsiveness
  voiceBuffering: true,
  audioCompression: true,
  latencyOptimization: true,
  offlineMode: false, // Requires internet for AI

  // Experimental Features - Enabled for complete experience
  emotionalTone: true,
  voicePersonalities: true,
  adaptiveSpeed: true,
  smartPunctuation: true,
};

export const DEFAULT_SYSTEM_FLAGS: SystemFeatureFlags = {
  // Core System - All production features
  agentMode: true,
  toolsIntegration: true,
  memorySystem: true,
  securityEnforcement: true,

  // UI Features - Modern interface
  darkMode: true,
  animations: true,
  notifications: true,
  keyboardShortcuts: true,

  // Development Features - Disabled in production
  debugMode: false,
  performanceMetrics: true,
  errorReporting: true,
  devTools: false,
};

// Environment-based configurations
export const DEVELOPMENT_VOICE_FLAGS: Partial<VoiceFeatureFlags> = {
  offlineMode: true, // For testing
  diagnosticPanel: true, // Enable diagnostic panel in dev
  voiceSettings: true, // Enable voice settings in dev
};

export const MINIMAL_VOICE_FLAGS: Partial<VoiceFeatureFlags> = {
  // Only core features for low-resource environments
  voiceCloning: false,
  voiceEffects: false,
  backgroundNoiseReduction: false,
  voiceVisualizer: false,
  emotionalTone: false,
  voicePersonalities: false,
  adaptiveSpeed: false,
};

export class FeatureFlagManager {
  private voiceFlags: VoiceFeatureFlags;
  private systemFlags: SystemFeatureFlags;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.voiceFlags = this.loadVoiceFlags();
    this.systemFlags = this.loadSystemFlags();
  }

  // Voice Feature Flag Methods
  isVoiceFeatureEnabled(feature: keyof VoiceFeatureFlags): boolean {
    return this.voiceFlags[feature];
  }

  enableVoiceFeature(feature: keyof VoiceFeatureFlags): void {
    this.voiceFlags[feature] = true;
    this.saveVoiceFlags();
    this.notifyListeners();
  }

  disableVoiceFeature(feature: keyof VoiceFeatureFlags): void {
    this.voiceFlags[feature] = false;
    this.saveVoiceFlags();
    this.notifyListeners();
  }

  toggleVoiceFeature(feature: keyof VoiceFeatureFlags): boolean {
    this.voiceFlags[feature] = !this.voiceFlags[feature];
    this.saveVoiceFlags();
    this.notifyListeners();
    return this.voiceFlags[feature];
  }

  // System Feature Flag Methods
  isSystemFeatureEnabled(feature: keyof SystemFeatureFlags): boolean {
    return this.systemFlags[feature];
  }

  enableSystemFeature(feature: keyof SystemFeatureFlags): void {
    this.systemFlags[feature] = true;
    this.saveSystemFlags();
    this.notifyListeners();
  }

  disableSystemFeature(feature: keyof SystemFeatureFlags): void {
    this.systemFlags[feature] = false;
    this.saveSystemFlags();
    this.notifyListeners();
  }

  toggleSystemFeature(feature: keyof SystemFeatureFlags): boolean {
    this.systemFlags[feature] = !this.systemFlags[feature];
    this.saveSystemFlags();
    this.notifyListeners();
    return this.systemFlags[feature];
  }

  // Batch Operations
  setVoiceFlags(flags: Partial<VoiceFeatureFlags>): void {
    this.voiceFlags = { ...this.voiceFlags, ...flags };
    this.saveVoiceFlags();
    this.notifyListeners();
  }

  setSystemFlags(flags: Partial<SystemFeatureFlags>): void {
    this.systemFlags = { ...this.systemFlags, ...flags };
    this.saveSystemFlags();
    this.notifyListeners();
  }

  resetToDefaults(): void {
    this.voiceFlags = { ...DEFAULT_VOICE_FLAGS };
    this.systemFlags = { ...DEFAULT_SYSTEM_FLAGS };
    this.saveVoiceFlags();
    this.saveSystemFlags();
    this.notifyListeners();
  }

  // Preset Configurations
  applyDevelopmentMode(): void {
    this.setVoiceFlags(DEVELOPMENT_VOICE_FLAGS);
    this.setSystemFlags({
      debugMode: true,
      devTools: true,
      performanceMetrics: true,
    });
  }

  applyMinimalMode(): void {
    this.setVoiceFlags(MINIMAL_VOICE_FLAGS);
    this.setSystemFlags({
      animations: false,
      notifications: false,
      performanceMetrics: false,
    });
  }

  applyProductionMode(): void {
    this.voiceFlags = { ...DEFAULT_VOICE_FLAGS };
    this.systemFlags = { ...DEFAULT_SYSTEM_FLAGS };
    this.saveVoiceFlags();
    this.saveSystemFlags();
    this.notifyListeners();
  }

  // Export/Import Configuration
  exportConfiguration(): string {
    return JSON.stringify(
      {
        voice: this.voiceFlags,
        system: this.systemFlags,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  importConfiguration(config: string): boolean {
    try {
      const parsed = JSON.parse(config);
      if (parsed.voice) this.setVoiceFlags(parsed.voice);
      if (parsed.system) this.setSystemFlags(parsed.system);
      return true;
    } catch (error) {
      console.error("Failed to import configuration:", error);
      return false;
    }
  }

  // Status and Utilities
  getVoiceFlags(): VoiceFeatureFlags {
    return { ...this.voiceFlags };
  }

  getSystemFlags(): SystemFeatureFlags {
    return { ...this.systemFlags };
  }

  getEnabledVoiceFeatures(): string[] {
    return Object.entries(this.voiceFlags)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature);
  }

  getEnabledSystemFeatures(): string[] {
    return Object.entries(this.systemFlags)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature);
  }

  // Event Listeners
  onFlagsChanged(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback());
  }

  // Persistence
  private loadVoiceFlags(): VoiceFeatureFlags {
    try {
      const stored = localStorage.getItem("luna-voice-flags");
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_VOICE_FLAGS, ...parsed };
      }
    } catch (error) {
      console.error("Failed to load voice flags:", error);
    }
    return { ...DEFAULT_VOICE_FLAGS };
  }

  private loadSystemFlags(): SystemFeatureFlags {
    try {
      const stored = localStorage.getItem("luna-system-flags");
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SYSTEM_FLAGS, ...parsed };
      }
    } catch (error) {
      console.error("Failed to load system flags:", error);
    }
    return { ...DEFAULT_SYSTEM_FLAGS };
  }

  private saveVoiceFlags(): void {
    try {
      localStorage.setItem("luna-voice-flags", JSON.stringify(this.voiceFlags));
    } catch (error) {
      console.error("Failed to save voice flags:", error);
    }
  }

  private saveSystemFlags(): void {
    try {
      localStorage.setItem(
        "luna-system-flags",
        JSON.stringify(this.systemFlags),
      );
    } catch (error) {
      console.error("Failed to save system flags:", error);
    }
  }
}

// Global instance
export const featureFlags = new FeatureFlagManager();

// React hook for feature flags
export const useFeatureFlags = () => {
  const [flags, setFlags] = React.useState({
    voice: featureFlags.getVoiceFlags(),
    system: featureFlags.getSystemFlags(),
  });

  React.useEffect(() => {
    const unsubscribe = featureFlags.onFlagsChanged(() => {
      setFlags({
        voice: featureFlags.getVoiceFlags(),
        system: featureFlags.getSystemFlags(),
      });
    });
    return unsubscribe;
  }, []);

  return {
    voice: flags.voice,
    system: flags.system,
    isVoiceEnabled: (feature: keyof VoiceFeatureFlags) =>
      featureFlags.isVoiceFeatureEnabled(feature),
    isSystemEnabled: (feature: keyof SystemFeatureFlags) =>
      featureFlags.isSystemFeatureEnabled(feature),
    toggleVoice: (feature: keyof VoiceFeatureFlags) =>
      featureFlags.toggleVoiceFeature(feature),
    toggleSystem: (feature: keyof SystemFeatureFlags) =>
      featureFlags.toggleSystemFeature(feature),
    manager: featureFlags,
  };
};

// Type guards for runtime checks
export const isVoiceFeature = (
  feature: string,
): feature is keyof VoiceFeatureFlags => {
  return feature in DEFAULT_VOICE_FLAGS;
};

export const isSystemFeature = (
  feature: string,
): feature is keyof SystemFeatureFlags => {
  return feature in DEFAULT_SYSTEM_FLAGS;
};
