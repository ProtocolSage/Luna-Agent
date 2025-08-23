// End-to-end integration tests for Luna Agent Memory System
import { ToolExecutive } from '../../agent/tools/executive';

describe('Memory System Integration Tests', () => {
  let toolExec: ToolExecutive;
  let testMemoryId: string;

  beforeAll(async () => {
    toolExec = new ToolExecutive();
  });

  afterAll(async () => {
    // Clean up test data
    if (testMemoryId) {
      try {
        await runTool('delete_memory', { id: testMemoryId });
      } catch (error) {
        console.warn('Cleanup failed:', error);
      }
    }
  });

  // Helper function to run tools and get results
  async function runTool(toolName: string, args: Record<string, any>) {
    const results = await toolExec.executePlan([{ tool: toolName, args }], 'integration_test');
    
    if (!results[0].success) {
      throw new Error(`Tool ${toolName} failed: ${results[0].error}`);
    }
    
    return results[0].output;
  }

  describe('End-to-End Memory Flow', () => {
    test('should complete full memory lifecycle: add → search → update → delete', async () => {
      // Step 1: Add memory
      const addResult = await runTool('add_memory', {
        content: 'Integration test memory content for e2e testing',
        type: 'note',
        metadata: { testFlag: true, source: 'integration-test' }
      });

      expect(addResult).toHaveProperty('id');
      expect(addResult.content).toBe('Integration test memory content for e2e testing');
      expect(addResult.type).toBe('note');
      // Test with actual environment - embeddings may be generated if API key is available
      expect(typeof addResult.hasEmbedding).toBe('boolean');
      
      testMemoryId = addResult.id;

      // Add a small delay to ensure the memory is properly indexed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 2: Search for the memory
      const searchResult = await runTool('search_memory', {
        query: 'integration test'
      });

      expect(Array.isArray(searchResult)).toBe(true);
      expect(searchResult.length).toBeGreaterThan(0);
      
      const foundMemory = searchResult.find((m: any) => m.id === testMemoryId);
      expect(foundMemory).toBeDefined();
      expect(foundMemory.content).toContain('Integration test');
      expect(foundMemory.relevanceScore).toBeDefined();

      // Step 3: Update the memory
      const updateResult = await runTool('update_memory', {
        id: testMemoryId,
        content: 'Updated integration test memory content',
        metadata: { testFlag: true, updated: true }
      });

      expect(updateResult.id).toBe(testMemoryId);
      expect(updateResult.content).toBe('Updated integration test memory content');
      expect(updateResult.hasEmbedding).toBe(false);

      // Step 4: Verify update by getting specific memory
      const getResult = await runTool('get_memory', { id: testMemoryId });
      
      expect(getResult.id).toBe(testMemoryId);
      expect(getResult.content).toBe('Updated integration test memory content');

      // Step 5: Delete the memory
      const deleteResult = await runTool('delete_memory', { id: testMemoryId });
      
      expect(deleteResult.deleted).toBe(true);
      expect(deleteResult.id).toBe(testMemoryId);

      // Step 6: Verify deletion
      await expect(runTool('get_memory', { id: testMemoryId }))
        .rejects.toThrow(`Memory not found: ${testMemoryId}`);

      testMemoryId = ''; // Mark as cleaned up
    }, 30000); // 30 second timeout for full flow

    test('should handle memory statistics and system status', async () => {
      // Test memory statistics
      const statsResult = await runTool('memory_stats', {});
      
      expect(statsResult).toHaveProperty('totalMemories');
      expect(statsResult).toHaveProperty('memoriesByType');
      expect(statsResult).toHaveProperty('embeddingServiceAvailable');
      expect(typeof statsResult.totalMemories).toBe('number');
      expect(typeof statsResult.embeddingServiceAvailable).toBe('boolean');

      // Test system status
      const statusResult = await runTool('status', {});
      
      expect(statusResult).toHaveProperty('status');
      expect(statusResult).toHaveProperty('timestamp');
      expect(statusResult).toHaveProperty('uptime');
      expect(statusResult).toHaveProperty('memory');
      expect(statusResult).toHaveProperty('performance');
      
      expect(['healthy', 'degraded', 'error']).toContain(statusResult.status);
      expect(typeof statusResult.uptime).toBe('number');
      expect(statusResult.performance.avgLatency).toBeLessThan(1000); // Should be fast
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid memory operations gracefully', async () => {
      // Test getting non-existent memory
      await expect(runTool('get_memory', { id: 'non_existent_id' }))
        .rejects.toThrow('Memory not found: non_existent_id');

      // Test deleting non-existent memory
      await expect(runTool('delete_memory', { id: 'non_existent_id' }))
        .rejects.toThrow('Memory not found: non_existent_id');

      // Test invalid memory type
      await expect(runTool('add_memory', { 
        content: 'Test content', 
        type: 'invalid_type' 
      })).rejects.toThrow('Invalid memory type');
    });
  });
});