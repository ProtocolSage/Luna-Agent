// Feature Flag System Tests
import { 
  FeatureFlagManager, 
  DEFAULT_VOICE_FLAGS, 
  DEFAULT_SYSTEM_FLAGS 
} from '../../app/renderer/services/FeatureFlags';

// Mock localStorage for testing
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('FeatureFlagManager', () => {
  let manager: FeatureFlagManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    manager = new FeatureFlagManager();
  });

  describe('Initialization', () => {
    it('should initialize with default flags', () => {
      const voiceFlags = manager.getVoiceFlags();
      const systemFlags = manager.getSystemFlags();

      expect(voiceFlags).toEqual(DEFAULT_VOICE_FLAGS);
      expect(systemFlags).toEqual(DEFAULT_SYSTEM_FLAGS);
    });

    it('should load saved flags from localStorage', () => {
      const savedVoiceFlags = { 
        ...DEFAULT_VOICE_FLAGS, 
        speechToText: false 
      };
      
      mockLocalStorage.setItem('luna-voice-flags', JSON.stringify(savedVoiceFlags));
      
      const newManager = new FeatureFlagManager();
      const voiceFlags = newManager.getVoiceFlags();
      
      expect(voiceFlags.speechToText).toBe(false);
    });
  });

  describe('Voice Feature Management', () => {
    it('should check if voice feature is enabled', () => {
      expect(manager.isVoiceFeatureEnabled('speechToText')).toBe(true);
      expect(manager.isVoiceFeatureEnabled('offlineMode')).toBe(false);
    });

    it('should enable voice feature', () => {
      manager.enableVoiceFeature('offlineMode');
      expect(manager.isVoiceFeatureEnabled('offlineMode')).toBe(true);
    });

    it('should disable voice feature', () => {
      manager.disableVoiceFeature('speechToText');
      expect(manager.isVoiceFeatureEnabled('speechToText')).toBe(false);
    });

    it('should toggle voice feature', () => {
      const initialState = manager.isVoiceFeatureEnabled('voiceCloning');
      const newState = manager.toggleVoiceFeature('voiceCloning');
      
      expect(newState).toBe(!initialState);
      expect(manager.isVoiceFeatureEnabled('voiceCloning')).toBe(newState);
    });
  });

  describe('System Feature Management', () => {
    it('should check if system feature is enabled', () => {
      expect(manager.isSystemFeatureEnabled('darkMode')).toBe(true);
      expect(manager.isSystemFeatureEnabled('debugMode')).toBe(false);
    });

    it('should enable system feature', () => {
      manager.enableSystemFeature('debugMode');
      expect(manager.isSystemFeatureEnabled('debugMode')).toBe(true);
    });

    it('should disable system feature', () => {
      manager.disableSystemFeature('darkMode');
      expect(manager.isSystemFeatureEnabled('darkMode')).toBe(false);
    });

    it('should toggle system feature', () => {
      const initialState = manager.isSystemFeatureEnabled('animations');
      const newState = manager.toggleSystemFeature('animations');
      
      expect(newState).toBe(!initialState);
      expect(manager.isSystemFeatureEnabled('animations')).toBe(newState);
    });
  });

  describe('Batch Operations', () => {
    it('should set multiple voice flags at once', () => {
      manager.setVoiceFlags({
        speechToText: false,
        textToSpeech: false,
        voiceActivation: false
      });

      expect(manager.isVoiceFeatureEnabled('speechToText')).toBe(false);
      expect(manager.isVoiceFeatureEnabled('textToSpeech')).toBe(false);
      expect(manager.isVoiceFeatureEnabled('voiceActivation')).toBe(false);
      // Other flags should remain unchanged
      expect(manager.isVoiceFeatureEnabled('wakeWordDetection')).toBe(true);
    });

    it('should set multiple system flags at once', () => {
      manager.setSystemFlags({
        debugMode: true,
        devTools: true
      });

      expect(manager.isSystemFeatureEnabled('debugMode')).toBe(true);
      expect(manager.isSystemFeatureEnabled('devTools')).toBe(true);
    });

    it('should reset to defaults', () => {
      // Change some flags first
      manager.setVoiceFlags({ speechToText: false });
      manager.setSystemFlags({ debugMode: true });

      // Reset
      manager.resetToDefaults();

      expect(manager.getVoiceFlags()).toEqual(DEFAULT_VOICE_FLAGS);
      expect(manager.getSystemFlags()).toEqual(DEFAULT_SYSTEM_FLAGS);
    });
  });

  describe('Preset Configurations', () => {
    it('should apply development mode', () => {
      manager.applyDevelopmentMode();
      
      expect(manager.isSystemFeatureEnabled('debugMode')).toBe(true);
      expect(manager.isSystemFeatureEnabled('devTools')).toBe(true);
      expect(manager.isSystemFeatureEnabled('performanceMetrics')).toBe(true);
    });

    it('should apply minimal mode', () => {
      manager.applyMinimalMode();
      
      expect(manager.isVoiceFeatureEnabled('voiceCloning')).toBe(false);
      expect(manager.isVoiceFeatureEnabled('voiceEffects')).toBe(false);
      expect(manager.isSystemFeatureEnabled('animations')).toBe(false);
    });

    it('should apply production mode', () => {
      // First change some settings
      manager.enableSystemFeature('debugMode');
      manager.disableVoiceFeature('speechToText');

      // Apply production mode
      manager.applyProductionMode();

      expect(manager.getVoiceFlags()).toEqual(DEFAULT_VOICE_FLAGS);
      expect(manager.getSystemFlags()).toEqual(DEFAULT_SYSTEM_FLAGS);
    });
  });

  describe('Configuration Export/Import', () => {
    it('should export configuration as JSON', () => {
      manager.setVoiceFlags({ speechToText: false });
      manager.setSystemFlags({ debugMode: true });

      const exported = manager.exportConfiguration();
      const parsed = JSON.parse(exported);

      expect(parsed.voice.speechToText).toBe(false);
      expect(parsed.system.debugMode).toBe(true);
      expect(parsed.timestamp).toBeDefined();
    });

    it('should import valid configuration', () => {
      const config = JSON.stringify({
        voice: { speechToText: false, textToSpeech: false },
        system: { debugMode: true, devTools: true }
      });

      const result = manager.importConfiguration(config);

      expect(result).toBe(true);
      expect(manager.isVoiceFeatureEnabled('speechToText')).toBe(false);
      expect(manager.isVoiceFeatureEnabled('textToSpeech')).toBe(false);
      expect(manager.isSystemFeatureEnabled('debugMode')).toBe(true);
      expect(manager.isSystemFeatureEnabled('devTools')).toBe(true);
    });

    it('should handle invalid configuration gracefully', () => {
      const result = manager.importConfiguration('invalid json');
      expect(result).toBe(false);
    });
  });

  describe('Event Listeners', () => {
    it('should notify listeners when flags change', () => {
      const listener = jest.fn();
      const unsubscribe = manager.onFlagsChanged(listener);

      manager.toggleVoiceFeature('speechToText');

      expect(listener).toHaveBeenCalledTimes(1);

      // Should not call after unsubscribe
      unsubscribe();
      manager.toggleVoiceFeature('textToSpeech');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should support multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      manager.onFlagsChanged(listener1);
      manager.onFlagsChanged(listener2);

      manager.toggleVoiceFeature('speechToText');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Persistence', () => {
    it('should save voice flags to localStorage', () => {
      manager.setVoiceFlags({ speechToText: false });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'luna-voice-flags',
        expect.stringContaining('"speechToText":false')
      );
    });

    it('should save system flags to localStorage', () => {
      manager.setSystemFlags({ debugMode: true });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'luna-system-flags',
        expect.stringContaining('"debugMode":true')
      );
    });

    it('should handle localStorage errors gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });

      // Should not throw
      expect(() => {
        manager.setVoiceFlags({ speechToText: false });
      }).not.toThrow();
    });
  });

  describe('Utility Methods', () => {
    it('should list enabled voice features', () => {
      manager.setVoiceFlags({
        speechToText: true,
        textToSpeech: false,
        voiceActivation: true
      });

      const enabled = manager.getEnabledVoiceFeatures();
      
      expect(enabled).toContain('speechToText');
      expect(enabled).toContain('voiceActivation');
      expect(enabled).not.toContain('textToSpeech');
    });

    it('should list enabled system features', () => {
      manager.setSystemFlags({
        darkMode: true,
        animations: false,
        debugMode: true
      });

      const enabled = manager.getEnabledSystemFeatures();
      
      expect(enabled).toContain('darkMode');
      expect(enabled).toContain('debugMode');
      expect(enabled).not.toContain('animations');
    });
  });
});
