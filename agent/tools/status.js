"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStatus = getStatus;
// Status tool for system health checks and metrics
const MemoryService_1 = require("../../memory/MemoryService");
/**
 * Get comprehensive system status and health metrics
 */
async function getStatus() {
    const startTime = Date.now();
    const errors = [];
    try {
        // Get memory system stats
        const memoryStats = await MemoryService_1.memoryService.getStats();
        // Calculate metrics
        const uptime = process.uptime();
        const latency = Date.now() - startTime;
        // Determine overall health
        let status = 'healthy';
        if (memoryStats.totalMemories === 0) {
            status = 'degraded';
            errors.push('No memories stored yet');
        }
        if (!memoryStats.embeddingServiceAvailable) {
            errors.push('Embedding service unavailable (no OpenAI API key)');
        }
        if (latency > 1000) {
            status = 'degraded';
            errors.push('High system latency detected');
        }
        return {
            status,
            timestamp: new Date().toISOString(),
            uptime,
            memory: {
                totalMemories: memoryStats.totalMemories,
                embeddingServiceAvailable: memoryStats.embeddingServiceAvailable,
                dbSize: `${Math.round((memoryStats.totalMemories * 0.5))}KB` // Rough estimate
            },
            performance: {
                avgLatency: latency,
                lastOperationMs: latency
            },
            errors
        };
    }
    catch (error) {
        return {
            status: 'error',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                totalMemories: 0,
                embeddingServiceAvailable: false,
                dbSize: '0KB'
            },
            performance: {
                avgLatency: Date.now() - startTime
            },
            errors: [`System error: ${error.message}`]
        };
    }
}
