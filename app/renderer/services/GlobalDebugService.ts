// app/renderer/services/GlobalDebugService.ts
// Global debug panel service for voice troubleshooting

import { getEnhancedVoiceService } from "./EnhancedVoiceService";
import {
  testEnvironmentAndRecommend,
  saveVoiceConfig,
  getFinalVoiceConfig,
} from "../config/voiceConfig";

interface DebugPanelState {
  isVisible: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  tab: "voice" | "environment" | "settings";
}

export class GlobalDebugService {
  private static instance: GlobalDebugService | null = null;
  private debugPanel: HTMLElement | null = null;
  private state: DebugPanelState = {
    isVisible: false,
    position: { x: 20, y: 20 },
    size: { width: 400, height: 500 },
    tab: "voice",
  };
  private updateInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupGlobalKeyListener();
    this.loadSavedState();
  }

  public static getInstance(): GlobalDebugService {
    if (!GlobalDebugService.instance) {
      GlobalDebugService.instance = new GlobalDebugService();
    }
    return GlobalDebugService.instance;
  }

  public static initializeGlobally(): void {
    // Call this in your main App.tsx to set up global shortcuts
    GlobalDebugService.getInstance();
    console.log(
      "[GlobalDebugService] Global debug shortcuts initialized (Ctrl+Shift+D)",
    );
  }

  private setupGlobalKeyListener(): void {
    document.addEventListener("keydown", (event) => {
      // Ctrl+Shift+D to toggle debug panel
      if (event.ctrlKey && event.shiftKey && event.key === "D") {
        event.preventDefault();
        this.toggle();
      }

      // Escape to close debug panel
      if (event.key === "Escape" && this.state.isVisible) {
        event.preventDefault();
        this.hide();
      }
    });
  }

  public toggle(): void {
    if (this.state.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public show(): void {
    if (this.state.isVisible) return;

    this.state.isVisible = true;
    this.createDebugPanel();
    this.startUpdating();
    this.saveState();

    console.log("[GlobalDebugService] Debug panel opened");
  }

  public hide(): void {
    if (!this.state.isVisible) return;

    this.state.isVisible = false;
    this.destroyDebugPanel();
    this.stopUpdating();
    this.saveState();

    console.log("[GlobalDebugService] Debug panel closed");
  }

  private createDebugPanel(): void {
    if (this.debugPanel) {
      this.debugPanel.remove();
    }

    this.debugPanel = document.createElement("div");
    this.debugPanel.className = "global-debug-panel";
    this.debugPanel.style.cssText = `
      position: fixed;
      top: ${this.state.position.y}px;
      left: ${this.state.position.x}px;
      width: ${this.state.size.width}px;
      height: ${this.state.size.height}px;
      background: rgba(0, 0, 0, 0.95);
      border: 1px solid #4CAF50;
      border-radius: 8px;
      z-index: 10000;
      color: white;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 12px;
      overflow: hidden;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      resize: both;
      min-width: 350px;
      min-height: 400px;
    `;

    this.debugPanel.innerHTML = `
      <div class="debug-header" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: rgba(76, 175, 80, 0.2);
        border-bottom: 1px solid #4CAF50;
        cursor: move;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">🔧</span>
          <span style="font-weight: 600; color: #4CAF50;">Luna Voice Debug Panel</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="debug-close" style="
            background: none;
            border: 1px solid #666;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          ">×</button>
        </div>
      </div>
      
      <div class="debug-content" style="
        padding: 16px;
        height: calc(100% - 80px);
        overflow-y: auto;
      ">
        <div style="text-align: center; color: #4CAF50; padding: 20px;">
          <div style="font-size: 24px; margin-bottom: 8px;">🎤</div>
          <div><strong>Enhanced Voice Debug Panel</strong></div>
          <div style="font-size: 11px; margin-top: 8px; color: #ccc;">
            Real-time voice metrics and troubleshooting
          </div>
          <div style="margin-top: 16px; padding: 12px; background: rgba(76, 175, 80, 0.1); border-radius: 4px;">
            Try speaking to see live audio metrics here!
          </div>
        </div>
      </div>
      
      <div class="debug-footer" style="
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.05);
        border-top: 1px solid #333;
        font-size: 10px;
        color: #888;
      ">
        Press Ctrl+Shift+D to toggle • Escape to close • Drag header to move
      </div>
    `;

    document.body.appendChild(this.debugPanel);
    this.setupDebugPanelEvents();
  }

  private setupDebugPanelEvents(): void {
    if (!this.debugPanel) return;

    // Close button
    const closeBtn = this.debugPanel.querySelector(".debug-close");
    closeBtn?.addEventListener("click", () => this.hide());

    // Make draggable
    const header = this.debugPanel.querySelector(".debug-header");
    if (header) {
      let isDragging = false;
      let startX = 0;
      let startY = 0;

      header.addEventListener("mousedown", ((e: MouseEvent) => {
        isDragging = true;
        startX = e.clientX - this.state.position.x;
        startY = e.clientY - this.state.position.y;
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      }) as EventListener);

      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging || !this.debugPanel) return;
        this.state.position.x = e.clientX - startX;
        this.state.position.y = e.clientY - startY;
        this.debugPanel.style.left = `${this.state.position.x}px`;
        this.debugPanel.style.top = `${this.state.position.y}px`;
      };

      const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        this.saveState();
      };
    }
  }

  private updateDebugContent(): void {
    const content = this.debugPanel?.querySelector(".debug-content");
    if (!content) return;

    try {
      const enhancedService = getEnhancedVoiceService();
      const debugInfo = enhancedService.getDebugInfo();

      content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <h4 style="margin: 0 0 12px 0; color: #4CAF50; font-size: 14px;">🎤 Voice Status</h4>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #333; font-size: 11px;">
              <span>Mode:</span>
              <span style="color: #4CAF50; font-weight: 600;">${debugInfo.mode}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #333; font-size: 11px;">
              <span>Listening:</span>
              <span style="color: ${debugInfo.isListening ? "#4CAF50" : "#f44336"};">
                ${debugInfo.isListening ? "🟢 Active" : "🔴 Inactive"}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #333; font-size: 11px;">
              <span>Processing:</span>
              <span style="color: ${debugInfo.isProcessing ? "#FF9800" : "#666"};">
                ${debugInfo.isProcessing ? "🟡 Processing" : "⚪ Idle"}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px;">
              <span>Recording Duration:</span>
              <span>${(debugInfo.recordingDuration / 1000).toFixed(1)}s</span>
            </div>
          </div>

          <div>
            <h4 style="margin: 0 0 12px 0; color: #4CAF50; font-size: 14px;">📊 Audio Metrics</h4>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #333; font-size: 11px;">
              <span>Audio Level:</span>
              <span style="font-family: monospace; color: #90caf9;">
                ${debugInfo.metrics.audioLevel.toFixed(1)} dB
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #333; font-size: 11px;">
              <span>Noise Floor:</span>
              <span style="font-family: monospace; color: #ffcc80;">
                ${debugInfo.metrics.noiseFloor.toFixed(1)} dB
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #333; font-size: 11px;">
              <span>Speech Detected:</span>
              <span style="color: ${debugInfo.metrics.speechDetected ? "#4CAF50" : "#666"};">
                ${debugInfo.metrics.speechDetected ? "🟢 Yes" : "🔴 No"}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px;">
              <span>Confidence:</span>
              <span style="color: ${debugInfo.metrics.confidence > 0.8 ? "#4CAF50" : debugInfo.metrics.confidence > 0.6 ? "#FF9800" : "#f44336"};">
                ${(debugInfo.metrics.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        <div style="margin-top: 20px;">
          <h4 style="margin: 0 0 12px 0; color: #4CAF50; font-size: 14px;">📈 Real-time Audio Visualization</h4>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="flex: 1; height: 20px; background: #333; border-radius: 10px; overflow: hidden; position: relative;">
              <div style="
                height: 100%;
                background: linear-gradient(90deg, #4CAF50 0%, #2196F3 50%, #f44336 100%);
                width: ${Math.max(5, Math.min(100, (debugInfo.metrics.audioLevel + 100) * 2))}%;
                transition: width 0.1s ease;
              "></div>
            </div>
            <span style="font-size: 10px; color: #888; min-width: 60px;">
              ${debugInfo.metrics.audioLevel.toFixed(0)} dB
            </span>
          </div>
          <div style="font-size: 10px; color: #888; margin-top: 4px;">
            🟢 Current Level • Red zone = Too quiet
          </div>
        </div>
      `;
    } catch (error) {
      content.innerHTML = `
        <div style="color: #f44336; text-align: center; padding: 20px;">
          <div style="font-size: 24px; margin-bottom: 8px;">❌</div>
          <div>Enhanced Voice Service not available</div>
          <div style="font-size: 10px; margin-top: 8px; color: #888;">
            ${error instanceof Error ? error.message : String(error)}
          </div>
        </div>
      `;
    }
  }

  private startUpdating(): void {
    this.updateInterval = setInterval(() => {
      this.updateDebugContent();
    }, 500); // Update every 500ms
  }

  private stopUpdating(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private destroyDebugPanel(): void {
    if (this.debugPanel) {
      this.debugPanel.remove();
      this.debugPanel = null;
    }
  }

  private saveState(): void {
    try {
      localStorage.setItem(
        "luna-debug-panel-state",
        JSON.stringify(this.state),
      );
    } catch (error) {
      console.warn("Failed to save debug panel state:", error);
    }
  }

  private loadSavedState(): void {
    try {
      const saved = localStorage.getItem("luna-debug-panel-state");
      if (saved) {
        const savedState = JSON.parse(saved);
        this.state = { ...this.state, ...savedState, isVisible: false }; // Don't auto-show
      }
    } catch (error) {
      console.warn("Failed to load debug panel state:", error);
    }
  }
}

// Export for easy access
export const GlobalDebug = GlobalDebugService.getInstance();
