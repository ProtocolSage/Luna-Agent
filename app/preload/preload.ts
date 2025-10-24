import { contextBridge, ipcRenderer } from "electron";
// Simple logger for preload context
const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) =>
    console.debug(`[DEBUG] ${msg}`, ...args),
};

/**
 * Secure Preload Script for Luna Agent
 * Exposes limited APIs to renderer process while maintaining security
 */

// Define the API interface that will be available in the renderer
export interface ElectronAPI {
  // Window Controls
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    toggleFullscreen: () => Promise<void>;
    onStateChanged: (callback: (state: any) => void) => () => void;
  };

  // File System Operations
  dialog: {
    openFile: (
      options?: any,
    ) => Promise<{ canceled: boolean; filePaths: string[] }>;
    saveFile: (
      options?: any,
    ) => Promise<{ canceled: boolean; filePath?: string }>;
  };

  // Voice Operations
  voice: {
    getDevices: () => Promise<any[]>;
    startRecording: (
      options?: any,
    ) => Promise<{ success: boolean; error?: string }>;
    stopRecording: () => Promise<{ success: boolean; error?: string }>;
    onVoiceEvent: (callback: (event: string, data?: any) => void) => () => void;
  };

  // System Information
  system: {
    getInfo: () => Promise<{
      platform: string;
      arch: string;
      version: string;
      electronVersion: string;
      appVersion: string;
    }>;
    openExternal: (
      url: string,
    ) => Promise<{ success: boolean; error?: string }>;
  };

  // Application Controls
  app: {
    restart: () => Promise<void>;
    quit: () => Promise<void>;
    getVersion: () => Promise<string>;
  };

  // Notifications
  notifications: {
    show: (options: {
      title: string;
      body: string;
      [key: string]: any;
    }) => Promise<void>;
  };

  // Menu Events
  menu: {
    onNewConversation: (callback: () => void) => () => void;
    onOpenFile: (callback: (filePath: string) => void) => () => void;
    onVoiceSettings: (callback: () => void) => () => void;
  };

  // Security and Utility
  utils: {
    sanitizeHtml: (html: string) => string;
    validateUrl: (url: string) => boolean;
    encryptData: (data: string) => Promise<string>;
    decryptData: (encryptedData: string) => Promise<string>;
  };
}

// Security validation functions
const validateChannel = (channel: string): boolean => {
  const allowedChannels = [
    "window:minimize",
    "window:maximize",
    "window:close",
    "window:toggle-fullscreen",
    "window:state-changed",
    "dialog:open-file",
    "dialog:save-file",
    "voice:get-devices",
    "voice:start-recording",
    "voice:stop-recording",
    "voice:start-listening",
    "voice:stop-listening",
    "system:get-info",
    "system:open-external",
    "app:restart",
    "app:quit",
    "app:get-version",
    "notification:show",
    "menu:new-conversation",
    "menu:open-file",
    "menu:voice-settings",
    "shortcut:voice-activate",
  ];

  return allowedChannels.includes(channel);
};

const sanitizeInput = (input: any): any => {
  if (typeof input === "string") {
    // Basic HTML sanitization
    return input
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");
  }

  if (typeof input === "object" && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
};

const validateUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

// Create the secure API
const electronAPI: ElectronAPI = {
  window: {
    minimize: () => {
      logger.info("Window minimize requested", "preload");
      return ipcRenderer.invoke("window:minimize");
    },

    maximize: () => {
      logger.info("Window maximize requested", "preload");
      return ipcRenderer.invoke("window:maximize");
    },

    close: () => {
      logger.info("Window close requested", "preload");
      return ipcRenderer.invoke("window:close");
    },

    toggleFullscreen: () => {
      logger.info("Window fullscreen toggle requested", "preload");
      return ipcRenderer.invoke("window:toggle-fullscreen");
    },

    onStateChanged: (callback: (state: any) => void) => {
      const listener = (_event: any, state: any) => {
        callback(sanitizeInput(state));
      };

      ipcRenderer.on("window:state-changed", listener);

      return () => {
        ipcRenderer.removeListener("window:state-changed", listener);
      };
    },
  },

  dialog: {
    openFile: async (options = {}) => {
      logger.info("File open dialog requested", "preload", { options });
      const sanitizedOptions = sanitizeInput(options);
      return ipcRenderer.invoke("dialog:open-file", sanitizedOptions);
    },

    saveFile: async (options = {}) => {
      logger.info("File save dialog requested", "preload", { options });
      const sanitizedOptions = sanitizeInput(options);
      return ipcRenderer.invoke("dialog:save-file", sanitizedOptions);
    },
  },

  voice: {
    getDevices: () => {
      logger.info("Voice devices enumeration requested", "preload");
      return ipcRenderer.invoke("voice:get-devices");
    },

    startRecording: async (options = {}) => {
      logger.info("Voice recording start requested", "preload", { options });
      const sanitizedOptions = sanitizeInput(options);
      return ipcRenderer.invoke("voice:start-recording", sanitizedOptions);
    },

    stopRecording: () => {
      logger.info("Voice recording stop requested", "preload");
      return ipcRenderer.invoke("voice:stop-recording");
    },

    onVoiceEvent: (callback: (event: string, data?: any) => void) => {
      const listener = (_event: any, eventName: string, data?: any) => {
        callback(eventName, sanitizeInput(data));
      };

      ipcRenderer.on("voice:event", listener);

      return () => {
        ipcRenderer.removeListener("voice:event", listener);
      };
    },
  },

  system: {
    getInfo: () => {
      logger.info("System info requested", "preload");
      return ipcRenderer.invoke("system:get-info");
    },

    openExternal: async (url: string) => {
      if (!validateUrl(url)) {
        logger.warn("Invalid URL blocked", "preload", { url });
        return { success: false, error: "Invalid URL" };
      }

      logger.info("External URL open requested", "preload", { url });
      return ipcRenderer.invoke("system:open-external", url);
    },
  },

  app: {
    restart: () => {
      logger.info("App restart requested", "preload");
      return ipcRenderer.invoke("app:restart");
    },

    quit: () => {
      logger.info("App quit requested", "preload");
      return ipcRenderer.invoke("app:quit");
    },

    getVersion: () => {
      return ipcRenderer.invoke("app:get-version");
    },
  },

  notifications: {
    show: async (options: {
      title: string;
      body: string;
      [key: string]: any;
    }) => {
      logger.info("Notification show requested", "preload", {
        title: options.title,
      });
      const sanitizedOptions = sanitizeInput(options);
      return ipcRenderer.invoke("notification:show", sanitizedOptions);
    },
  },

  menu: {
    onNewConversation: (callback: () => void) => {
      const listener = () => {
        logger.info("New conversation menu action triggered", "preload");
        callback();
      };

      ipcRenderer.on("menu:new-conversation", listener);

      return () => {
        ipcRenderer.removeListener("menu:new-conversation", listener);
      };
    },

    onOpenFile: (callback: (filePath: string) => void) => {
      const listener = (_event: any, filePath: string) => {
        logger.info("Open file menu action triggered", "preload", { filePath });
        callback(filePath);
      };

      ipcRenderer.on("menu:open-file", listener);

      return () => {
        ipcRenderer.removeListener("menu:open-file", listener);
      };
    },

    onVoiceSettings: (callback: () => void) => {
      const listener = () => {
        logger.info("Voice settings menu action triggered", "preload");
        callback();
      };

      ipcRenderer.on("menu:voice-settings", listener);

      return () => {
        ipcRenderer.removeListener("menu:voice-settings", listener);
      };
    },
  },

  utils: {
    sanitizeHtml: (html: string): string => {
      return sanitizeInput(html);
    },

    validateUrl: (url: string): boolean => {
      return validateUrl(url);
    },

    encryptData: async (data: string): Promise<string> => {
      // Basic encryption using Web Crypto API
      try {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);

        // Generate a key for AES-GCM
        const key = await crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt"],
        );

        // Generate a random IV
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Encrypt the data
        const encrypted = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          dataBuffer,
        );

        // Combine IV and encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        // Convert to base64
        return btoa(String.fromCharCode(...combined));
      } catch (error) {
        logger.error("Encryption failed", error as Error, "preload");
        throw new Error("Encryption failed");
      }
    },

    decryptData: async (encryptedData: string): Promise<string> => {
      // Basic decryption using Web Crypto API
      try {
        // Convert from base64
        const combined = new Uint8Array(
          atob(encryptedData)
            .split("")
            .map((char) => char.charCodeAt(0)),
        );

        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);

        // This is a simplified implementation
        // In production, you'd need to store and retrieve the key securely
        throw new Error("Decryption requires secure key management");
      } catch (error) {
        logger.error("Decryption failed", error as Error, "preload");
        throw new Error("Decryption failed");
      }
    },
  },
};

// Expose the API to the renderer process with comprehensive error handling
try {
  // Wrap all API methods with error handling
  const safeElectronAPI = Object.fromEntries(
    Object.entries(electronAPI).map(([key, value]) => {
      if (typeof value === "object" && value !== null) {
        const safeValue = Object.fromEntries(
          Object.entries(value).map(([subKey, subValue]) => {
            if (typeof subValue === "function") {
              return [
                subKey,
                async (...args: any[]) => {
                  try {
                    return await (subValue as Function).apply(null, args);
                  } catch (error) {
                    logger.error(
                      `Error in ${key}.${subKey}:`,
                      error,
                      "preload",
                    );
                    throw error;
                  }
                },
              ];
            }
            return [subKey, subValue];
          }),
        );
        return [key, safeValue];
      }
      return [key, value];
    }),
  );

  contextBridge.exposeInMainWorld("electronAPI", safeElectronAPI);

  // Also expose a simplified version for backward compatibility with error handling
  contextBridge.exposeInMainWorld("electron", {
    ipcRenderer: {
      invoke: async (channel: string, ...args: any[]) => {
        try {
          if (validateChannel(channel)) {
            const sanitizedArgs = args.map((arg) => sanitizeInput(arg));
            return await ipcRenderer.invoke(channel, ...sanitizedArgs);
          } else {
            logger.warn("Blocked invalid IPC channel", "preload", { channel });
            throw new Error(`Invalid channel: ${channel}`);
          }
        } catch (error) {
          logger.error(`IPC invoke error on ${channel}:`, error, "preload");
          throw error;
        }
      },

      on: (channel: string, listener: (...args: any[]) => void) => {
        try {
          if (validateChannel(channel)) {
            const sanitizedListener = (...args: any[]) => {
              try {
                const sanitizedArgs = args.map((arg) => sanitizeInput(arg));
                listener(...sanitizedArgs);
              } catch (error) {
                logger.error(
                  `IPC listener error on ${channel}:`,
                  error,
                  "preload",
                );
              }
            };
            ipcRenderer.on(channel, sanitizedListener);
          } else {
            logger.warn("Blocked invalid IPC channel listener", "preload", {
              channel,
            });
            throw new Error(`Invalid channel: ${channel}`);
          }
        } catch (error) {
          logger.error(`IPC on error for ${channel}:`, error, "preload");
          throw error;
        }
      },

      removeListener: (channel: string, listener: (...args: any[]) => void) => {
        try {
          if (validateChannel(channel)) {
            ipcRenderer.removeListener(channel, listener);
          }
        } catch (error) {
          logger.error(
            `IPC removeListener error for ${channel}:`,
            error,
            "preload",
          );
        }
      },
    },
  });

  logger.info("Preload script initialized successfully", "preload");
} catch (error) {
  console.error("Critical failure in preload script:", error);
  // Still expose a minimal API even if there are errors
  try {
    contextBridge.exposeInMainWorld("electronAPI", {
      system: {
        getInfo: () =>
          Promise.resolve({
            platform: "unknown",
            arch: "unknown",
            version: "unknown",
            electronVersion: "unknown",
            appVersion: "unknown",
          }),
      },
    });
  } catch (fallbackError) {
    console.error("Failed to create fallback API:", fallbackError);
  }
}

// Additional security measures
// Disable node integration completely
delete (window as any).require;
delete (window as any).exports;
delete (window as any).module;

// Prevent access to electron APIs outside of the exposed interface
Object.freeze(electronAPI);

// CSP is handled in the HTML file directly - no DOM manipulation needed in preload

// Export types for TypeScript support
// Export types moved to avoid conflict
// export type { ElectronAPI };

// Log successful preload completion
console.log("🔒 Luna Agent preload script loaded securely");
