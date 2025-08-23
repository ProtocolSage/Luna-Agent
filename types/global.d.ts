declare global {
  interface Window {
    lunaAPI?: {
      // System information
      getSystemInfo(): Promise<{
        platform: string;
        arch: string;
        version: string;
        electronVersion: string;
        appVersion: string;
      }>;
      
      // Window controls
      minimizeWindow(): Promise<void>;
      maximizeWindow(): Promise<void>;
      closeWindow(): Promise<void>;
      toggleFullscreen(): Promise<void>;
      getWindowState(): Promise<any>;
      
      // App controls
      restartApp(): Promise<void>;
      quitApp(): Promise<void>;
      getAppVersion(): Promise<string>;
      
      // Notifications
      showNotification(options: { title: string; body: string }): void;
      
      // Voice/Audio
      getAudioDevices(): Promise<any[]>;
      startVoiceRecording(options?: any): Promise<{ success: boolean; error?: string }>;
      stopVoiceRecording(): Promise<{ success: boolean; error?: string }>;
      
      // File system
      openFile(options?: any): Promise<{ canceled: boolean; filePaths?: string[] }>;
      saveFile(options?: any): Promise<{ canceled: boolean; filePath?: string }>;
      
      // External links
      openExternal(url: string): Promise<{ success: boolean; error?: string }>;
    };
    
    voiceIPC?: {
      on(channel: string, callback: (...args: any[]) => void): void;
      send(channel: string, ...args: any[]): void;
      onSttTranscript?: (callback: (transcript: { text: string; isFinal: boolean }) => void) => void;
      onListeningStarted?: (callback: () => void) => void;
      onListeningStopped?: (callback: () => void) => void;
      onMicPermission?: (callback: (data: { granted: boolean }) => void) => void;
    };
  }
}

export {};