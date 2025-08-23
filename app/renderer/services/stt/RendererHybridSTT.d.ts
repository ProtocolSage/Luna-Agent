/**
 * Renderer-Based Hybrid STT Service
 * Manages STT in renderer process where browser APIs work properly
 */
interface RendererSTTEvents {
    'transcript': {
        text: string;
        isFinal: boolean;
    };
    'engine-switched': {
        engine: string;
        isCloud: boolean;
    };
    'error': string;
    'listening-started': void;
    'listening-stopped': void;
}
export declare class RendererHybridSTT {
    private currentEngine;
    private isStarted;
    private eventListeners;
    private whisperSTT;
    private cloudSTT;
    private switchingInProgress;
    private lastError;
    constructor();
    start(): Promise<{
        success: boolean;
        error?: string;
    }>;
    stop(): Promise<{
        success: boolean;
        error?: string;
    }>;
    private initializeCloudSTT;
    private initializeWhisperSTT;
    private switchToWhisperFallback;
    getStatus(): {
        engine: string;
        isCloud: boolean;
        isLocal: boolean;
        isStarted: boolean;
        lastError: string | null;
    };
    switchToCloud(): Promise<void>;
    switchToWhisper(): Promise<void>;
    healthCheck(): Promise<{
        healthy: boolean;
        details?: any;
    }>;
    on<K extends keyof RendererSTTEvents>(event: K, listener: (data: RendererSTTEvents[K]) => void): void;
    off<K extends keyof RendererSTTEvents>(event: K, listener: (data: RendererSTTEvents[K]) => void): void;
    private emit;
    destroy(): void;
}
export declare function getRendererHybridSTT(): RendererHybridSTT;
export declare function destroyRendererHybridSTT(): void;
export {};
