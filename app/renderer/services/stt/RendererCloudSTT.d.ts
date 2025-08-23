/**
 * Renderer-Based Hybrid STT Service
 * Runs in renderer process where browser APIs (getUserMedia, WebSocket) are available
 */
import { STTProvider, STTConfig } from './STTInterface';
export declare class RendererCloudSTT implements STTProvider {
    readonly name = "Renderer Cloud STT";
    readonly isOnlineService = true;
    private config;
    private _isInitialized;
    private _isListening;
    private eventListeners;
    private websocket;
    private mediaRecorder;
    private audioStream;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private abortController;
    private cloudConfig;
    constructor();
    initialize(config: STTConfig): Promise<void>;
    startListening(): Promise<void>;
    stopListening(): Promise<void>;
    private connectToCloudService;
    private connectAzure;
    private connectDeepgram;
    private setupAudioStreaming;
    private handleAzureMessage;
    private handleDeepgramMessage;
    private attemptReconnect;
    private generateConnectionId;
    isListening(): boolean;
    isInitialized(): boolean;
    setLanguage(language: string): void;
    getCapabilities(): {
        streamingSupport: boolean;
        offlineSupport: boolean;
        languageDetection: boolean;
        punctuation: boolean;
        profanityFilter: boolean;
    };
    checkHealth(): Promise<{
        healthy: boolean;
        latency?: number;
        error?: string;
    }>;
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener: (...args: any[]) => void): void;
    private emit;
    destroy(): void;
}
