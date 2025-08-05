// memory-test.ts - Comprehensive Memory System Test Suite
import { MemoryService } from './memory/MemoryService';
import { MemoryType } from './memory/MemoryStore';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Comprehensive test suite for Luna Agent Memory System
 * 
 * Tests all core functionality:
 * - Basic CRUD operations
 * - Search capabilities (text and vector)
 * - Type filtering and pagination
 * - Batch operations
 * - Statistics and exports
 * - Error handling and edge cases
 */
class MemorySystemTests {
  private testDbPath: string;
  private memoryService: MemoryService;
  private testResults: { name: string; passed: boolean; error?: string; duration: number }[] = [];

  constructor() {
    // Use separate test database
    this.testDbPath = path.join(__dirname, 'memory', 'test-luna-memory.db');
    this.memoryService = new MemoryService(this.testDbPath);
  }

  /**
   * Run all test cases and report results
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Luna Agent Memory System Tests\n');
    
    try {
      await this.cleanupTestDatabase();
      
      // Core CRUD Operations
      await this.runTest('Basic Memory Addition', () => this.testBasicAddition());
      await this.runTest('Memory Retrieval', () => this.testMemoryRetrieval());
      await this.runTest('Memory Updates', () => this.testMemoryUpdates());
      await this.runTest('Memory Deletion', () => this.testMemoryDeletion());
      
      // Search & Query Tests
      await this.runTest('Text Search', () => this.testTextSearch());
      await this.runTest('Type Filtering', () => this.testTypeFiltering());
      await this.runTest('Pagination', () => this.testPagination());
      await this.runTest('Vector Search (if available)', () => this.testVectorSearch());
      
      // Batch Operations
      await this.runTest('Batch Memory Addition', () => this.testBatchOperations());
      
      // System Features
      await this.runTest('Statistics Generation', () => this.testStatistics());
      await this.runTest('Similar Memory Finding', () => this.testSimilarMemories());
      await this.runTest('Memory Export', () => this.testMemoryExport());
      
      // Edge Cases & Error Handling
      await this.runTest('Invalid Operations', () => this.testErrorHandling());
      await this.runTest('Large Content Handling', () => this.testLargeContent());
      
      this.printTestSummary();
      
    } finally {
      await this.cleanup();
    }
  }

  private async runTest(testName: string, testFunction: () => Promise<void>): Promise<void> {
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      
      this.testResults.push({ name: testName, passed: true, duration });
      console.log(`✅ ${testName} (${duration}ms)`);
    } catch (error: any) {
      const duration = Date.now();
      this.testResults.push({ 
        name: testName, 
        passed: false, 
        error: error.message,
        duration 
      });
      console.log(`❌ ${testName}: ${error.message}`);
    }
  }

  // === CORE CRUD TEST CASES ===

  private async testBasicAddition(): Promise<void> {
    // Test adding different types of memories
    const testCases = [
      { content: 'Remember to call John about the project meeting', type: 'reminder' as MemoryType },
      { content: 'Today I learned about vector databases and embeddings', type: 'journal' as MemoryType },
      { content: 'User asked about implementing authentication in React', type: 'conversation' as MemoryType },
      { content: 'Complete the memory system implementation by Friday', type: 'task' as MemoryType }
    ];

    const addedMemories = [];
    for (const testCase of testCases) {
      const memory = await this.memoryService.addMemory(testCase.content, testCase.type);
      
      if (!memory.id || !memory.timestamp) {
        throw new Error('Memory missing required fields');
      }
      
      if (memory.content !== testCase.content || memory.type !== testCase.type) {
        throw new Error('Memory content or type mismatch');
      }
      
      addedMemories.push(memory);
    }

    // Verify all memories were added
    if (addedMemories.length !== testCases.length) {
      throw new Error(`Expected ${testCases.length} memories, got ${addedMemories.length}`);
    }
  }

  private async testMemoryRetrieval(): Promise<void> {
    // Add a test memory
    const testMemory = await this.memoryService.addMemory(
      'Test retrieval memory content',
      'note',
      { testFlag: true }
    );

    // Retrieve by ID
    const retrieved = await this.memoryService.getMemory(testMemory.id);
    
    if (!retrieved) {
      throw new Error('Memory retrieval returned null');
    }

    if (retrieved.content !== testMemory.content) {
      throw new Error('Retrieved memory content mismatch');
    }

    if (!retrieved.metadata?.testFlag) {
      throw new Error('Memory metadata not preserved');
    }

    // Test non-existent memory
    const nonExistent = await this.memoryService.getMemory('non_existent_id');
    if (nonExistent !== null) {
      throw new Error('Should return null for non-existent memory');
    }
  }

  private async testMemoryUpdates(): Promise<void> {
    // Add memory to update
    const original = await this.memoryService.addMemory('Original content', 'note');
    
    // Update content
    const updated = await this.memoryService.updateMemory(original.id, {
      content: 'Updated content',
      metadata: { updated: true }
    });

    if (!updated) {
      throw new Error('Update returned null');
    }

    if (updated.content !== 'Updated content') {
      throw new Error('Content was not updated');
    }

    if (!updated.metadata?.updated) {
      throw new Error('Metadata was not updated');
    }

    // Verify timestamp preserved
    if (updated.timestamp !== original.timestamp) {
      throw new Error('Original timestamp should be preserved');
    }
  }

  private async testMemoryDeletion(): Promise<void> {
    // Add memory to delete
    const memory = await this.memoryService.addMemory('Memory to delete', 'note');
    
    // Delete it
    const deleted = await this.memoryService.deleteMemory(memory.id);
    if (!deleted) {
      throw new Error('Deletion should return true');
    }

    // Verify it's gone
    const retrieved = await this.memoryService.getMemory(memory.id);
    if (retrieved !== null) {
      throw new Error('Memory should be null after deletion');
    }

    // Test deleting non-existent memory
    const deletedNonExistent = await this.memoryService.deleteMemory('non_existent');
    if (deletedNonExistent !== false) {
      throw new Error('Should return false for non-existent memory deletion');
    }
  }

  // === SEARCH & QUERY TEST CASES ===

  private async testTextSearch(): Promise<void> {
    // Add searchable memories
    await this.memoryService.addMemory('JavaScript is a programming language', 'document');
    await this.memoryService.addMemory('Python is great for data science', 'document');
    await this.memoryService.addMemory('React makes building UIs easier', 'document');

    // Test search
    const jsResults = await this.memoryService.searchMemories('JavaScript');
    if (jsResults.length === 0) {
      throw new Error('Should find JavaScript memory');
    }

    const found = jsResults.find(r => r.memory.content.includes('JavaScript'));
    if (!found) {
      throw new Error('JavaScript memory not in results');
    }

    // Test case-insensitive search
    const pythonResults = await this.memoryService.searchMemories('python');
    if (pythonResults.length === 0) {
      throw new Error('Should find Python memory with case-insensitive search');
    }

    // Test no results
    const noResults = await this.memoryService.searchMemories('nonexistentterm');
    if (noResults.length > 0) {
      throw new Error('Should return no results for non-existent term');
    }
  }

  private async testTypeFiltering(): Promise<void> {
    // Add memories of different types
    await this.memoryService.addMemory('Goal: Learn TypeScript', 'goal');
    await this.memoryService.addMemory('Reminder: Buy groceries', 'reminder');
    await this.memoryService.addMemory('Note: Meeting notes from today', 'note');

    // Test filtering by type
    const goals = await this.memoryService.getMemoriesByType('goal');
    if (goals.length === 0) {
      throw new Error('Should find goal memories');
    }

    const goalFound = goals.find(m => m.content.includes('TypeScript'));
    if (!goalFound) {
      throw new Error('TypeScript goal not found');
    }

    // Test search with type filter
    const reminderSearch = await this.memoryService.searchMemories('groceries', { type: 'reminder' });
    if (reminderSearch.length === 0) {
      throw new Error('Should find reminder with type filter');
    }
  }

  private async testPagination(): Promise<void> {
    // Add multiple memories for pagination testing
    const memories = [];
    for (let i = 0; i < 15; i++) {
      memories.push(await this.memoryService.addMemory(`Test memory ${i}`, 'note'));
    }

    // Test pagination
    const page1 = await this.memoryService.getRecentMemories(10, 0);
    const page2 = await this.memoryService.getRecentMemories(10, 10);

    if (page1.length !== 10) {
      throw new Error(`Expected 10 memories in page 1, got ${page1.length}`);
    }

    if (page2.length < 5) {
      throw new Error(`Expected at least 5 memories in page 2, got ${page2.length}`);
    }

    // Verify no overlap
    const page1Ids = new Set(page1.map(m => m.id));
    const page2Ids = new Set(page2.map(m => m.id));
    const intersection = [...page1Ids].filter(id => page2Ids.has(id));
    
    if (intersection.length > 0) {
      throw new Error('Pages should not have overlapping memories');
    }
  }

  private async testVectorSearch(): Promise<void> {
    // This test depends on OpenAI API availability
    const testMemory = await this.memoryService.addMemory(
      'Machine learning algorithms for natural language processing',
      'document'
    );

    // Test similar content search
    const similar = await this.memoryService.findSimilarMemories(
      'AI and NLP technologies'
    );

    // If embeddings are available, we should get results
    // If not, this gracefully falls back to text search
    console.log(`Vector search returned ${similar.length} results`);
    
    // At minimum, text search should work
    const textResults = await this.memoryService.searchMemories('machine learning');
    if (textResults.length === 0) {
      throw new Error('Text search fallback should work');
    }
  }

  // === BATCH OPERATIONS TEST CASES ===

  private async testBatchOperations(): Promise<void> {
    const batchMemories = [
      { content: 'Batch memory 1', type: 'note' as MemoryType },
      { content: 'Batch memory 2', type: 'task' as MemoryType },
      { content: 'Batch memory 3', type: 'reminder' as MemoryType }
    ];

    const results = await this.memoryService.addMemoriesBatch(batchMemories);
    
    if (results.length !== batchMemories.length) {
      throw new Error(`Expected ${batchMemories.length} results, got ${results.length}`);
    }

    // Verify all memories were added correctly
    for (let i = 0; i < results.length; i++) {
      if (results[i].content !== batchMemories[i].content) {
        throw new Error(`Batch memory ${i} content mismatch`);
      }
      if (results[i].type !== batchMemories[i].type) {
        throw new Error(`Batch memory ${i} type mismatch`);
      }
    }
  }

  // === SYSTEM FEATURES TEST CASES ===

  private async testStatistics(): Promise<void> {
    // Add some test data
    await this.memoryService.addMemory('Stats test goal', 'goal');
    await this.memoryService.addMemory('Stats test note', 'note');
    await this.memoryService.addMemory('Stats test reminder', 'reminder');

    const stats = await this.memoryService.getStats();

    if (stats.totalMemories < 3) {
      throw new Error('Stats should show at least 3 memories');
    }

    if (!stats.memoriesByType.goal || stats.memoriesByType.goal === 0) {
      throw new Error('Stats should show goal memories');
    }

    if (typeof stats.embeddingServiceAvailable !== 'boolean') {
      throw new Error('Embedding service availability should be boolean');
    }
  }

  private async testSimilarMemories(): Promise<void> {
    // Add related memories
    await this.memoryService.addMemory('React hooks are powerful for state management', 'document');
    await this.memoryService.addMemory('Vue.js composition API is similar to React hooks', 'document');

    const similar = await this.memoryService.findSimilarMemories('state management in React');
    
    // Should find at least one result (even with text search fallback)
    if (similar.length === 0) {
      throw new Error('Should find similar memories');
    }
  }

  private async testMemoryExport(): Promise<void> {
    // Add some memories to export
    await this.memoryService.addMemory('Export test 1', 'note');
    await this.memoryService.addMemory('Export test 2', 'task');

    const exported = await this.memoryService.exportMemories();
    
    if (exported.length < 2) {
      throw new Error('Export should return at least 2 memories');
    }

    // Verify structure
    const firstMemory = exported[0];
    if (!firstMemory.id || !firstMemory.content || !firstMemory.type || !firstMemory.timestamp) {
      throw new Error('Exported memory missing required fields');
    }
  }

  // === ERROR HANDLING TEST CASES ===

  private async testErrorHandling(): Promise<void> {
    // Test invalid memory type (this should be caught by tool validation)
    try {
      await this.memoryService.addMemory('Invalid type test', 'invalid' as MemoryType);
      // Note: This might succeed at the service level but fail at tool level
    } catch (error) {
      // Expected if validation is strict
    }

    // Test empty content
    const emptyMemory = await this.memoryService.addMemory('', 'note');
    if (!emptyMemory.id) {
      throw new Error('Should handle empty content gracefully');
    }

    // Test updating non-existent memory
    const nonExistentUpdate = await this.memoryService.updateMemory('fake_id', { content: 'new' });
    if (nonExistentUpdate !== null) {
      throw new Error('Should return null for non-existent memory update');
    }
  }

  private async testLargeContent(): Promise<void> {
    // Test large content handling
    const largeContent = 'A'.repeat(10000); // 10KB content
    const largeMemory = await this.memoryService.addMemory(largeContent, 'document');

    if (largeMemory.content.length !== largeContent.length) {
      throw new Error('Large content not preserved correctly');
    }

    // Verify it can be retrieved
    const retrieved = await this.memoryService.getMemory(largeMemory.id);
    if (!retrieved || retrieved.content.length !== largeContent.length) {
      throw new Error('Large content not retrieved correctly');
    }
  }

  // === UTILITY METHODS ===

  private async cleanupTestDatabase(): Promise<void> {
    try {
      if (fs.existsSync(this.testDbPath)) {
        fs.unlinkSync(this.testDbPath);
      }
    } catch (error) {
      console.warn('Could not clean up test database:', error);
    }
  }

  private async cleanup(): Promise<void> {
    this.memoryService.close();
    await this.cleanupTestDatabase();
  }

  private printTestSummary(): void {
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const totalTime = this.testResults.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n📊 Test Summary:`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏱️  Total time: ${totalTime}ms`);
    console.log(`   📈 Success rate: ${((passed / this.testResults.length) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log(`\n💥 Failed Tests:`);
      this.testResults
        .filter(r => !r.passed)
        .forEach(r => console.log(`   • ${r.name}: ${r.error}`));
    }

    console.log(`\n${passed === this.testResults.length ? '🎉 All tests passed!' : '⚠️  Some tests failed'}`);
  }
}

// Run tests if called directly
if (require.main === module) {
  const tests = new MemorySystemTests();
  tests.runAllTests().catch(console.error);
}

export { MemorySystemTests };
