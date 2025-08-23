export interface SystemStatus {
    status: 'healthy' | 'degraded' | 'error';
    timestamp: string;
    uptime: number;
    memory: {
        totalMemories: number;
        embeddingServiceAvailable: boolean;
        dbSize: string;
    };
    performance: {
        avgLatency: number;
        lastOperationMs?: number;
    };
    errors: string[];
}
/**
 * Get comprehensive system status and health metrics
 */
export declare function getStatus(): Promise<SystemStatus>;
