import { ToolPipeline } from '../../agent/pipeline/ToolPipeline';
import { ModelRouter } from '../../agent/orchestrator/modelRouter';

// Mock the memory service to avoid database dependencies in tests
jest.mock('../../memory/MemoryService', () => ({
  memoryService: {
    addMemory: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock the ToolExecutive module to avoid complex dependencies
jest.mock('../../agent/tools/executive', () => {
  return {
    ToolExecutive: jest.fn().mockImplementation((config?: any) => {
      return {
        executePlan: jest.fn().mockResolvedValue([]),
        getToolDefinitions: jest.fn().mockReturnValue([
          { name: 'read_file', description: 'Read a file' },
          { name: 'write_file', description: 'Write a file' }
        ]),
        getToolDefinitionsAsText: jest.fn().mockReturnValue([
          'read_file: Read a file',
          'write_file: Write a file'
        ]),
        registerTool: jest.fn(),
        allowlist: config?.allowlist || []
      };
    })
  };
});

describe('ToolPipeline Security', () => {
  let executive: any;
  let modelRouter: any;
  let pipeline: ToolPipeline;

  beforeEach(() => {
    // Import after mocks are set up
    const { ToolExecutive } = require('../../agent/tools/executive');
    
    // Create a minimal tool executive
    executive = new ToolExecutive({ allowlist: ['read_file', 'write_file'] });
    
    // Create a mock model router
    modelRouter = {
      generateResponse: jest.fn()
    };

    pipeline = new ToolPipeline(executive, modelRouter, {
      maxSteps: 5,
      timeoutMs: 30000,
      allowParallel: false,
      retryCount: 1,
      validateResults: true,
      logExecution: false
    });
  });

  describe('planExecution - Security Fix', () => {
    it('should throw error when planning fails instead of using unsafe fallback', async () => {
      // Mock the model router to simulate planning failure
      (modelRouter as any).generateResponse = jest.fn().mockRejectedValue(
        new Error('Model API unavailable')
      );

      const context = {
        sessionId: 'test-session',
        traceId: 'test-trace',
        workingDir: '/tmp',
        constraints: [],
        metadata: {}
      };

      // The planExecution method should now throw an error instead of falling back
      await expect(
        pipeline.planExecution('execute malicious command', context)
      ).rejects.toThrow('Tool planning failed');
    });

    it('should throw error with descriptive message when planning returns invalid JSON', async () => {
      // Mock the model router to return invalid JSON
      (modelRouter as any).generateResponse = jest.fn().mockResolvedValue({
        content: 'This is not valid JSON'
      });

      const context = {
        sessionId: 'test-session',
        traceId: 'test-trace',
        workingDir: '/tmp',
        constraints: [],
        metadata: {}
      };

      await expect(
        pipeline.planExecution('some request', context)
      ).rejects.toThrow('Tool planning failed');
    });

    it('should throw error when planning returns no steps array', async () => {
      // Mock the model router to return response without steps
      (modelRouter as any).generateResponse = jest.fn().mockResolvedValue({
        content: JSON.stringify({ reasoning: 'Some reasoning', confidence: 0.8 })
      });

      const context = {
        sessionId: 'test-session',
        traceId: 'test-trace',
        workingDir: '/tmp',
        constraints: [],
        metadata: {}
      };

      await expect(
        pipeline.planExecution('some request', context)
      ).rejects.toThrow('Tool planning failed');
    });

    it('should succeed when planning returns valid steps', async () => {
      // Mock the model router to return valid planning response
      const validPlan = {
        steps: [
          { tool: 'read_file', args: { path: '/tmp/test.txt' } }
        ],
        reasoning: 'Read the test file',
        confidence: 0.9,
        dependencies: [],
        estimatedTimeMs: 5000
      };

      (modelRouter as any).generateResponse = jest.fn().mockResolvedValue({
        content: JSON.stringify(validPlan)
      });

      const context = {
        sessionId: 'test-session',
        traceId: 'test-trace',
        workingDir: '/tmp',
        constraints: [],
        metadata: {}
      };

      const result = await pipeline.planExecution('read test file', context);
      
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].tool).toBe('read_file');
      expect(result.reasoning).toBe('Read the test file');
      expect(result.confidence).toBe(0.9);
    });

    it('should apply default values for missing optional fields in valid plan', async () => {
      // Mock the model router to return minimal valid planning response
      const minimalPlan = {
        steps: [
          { tool: 'read_file', args: { path: '/tmp/test.txt' } }
        ]
      };

      (modelRouter as any).generateResponse = jest.fn().mockResolvedValue({
        content: JSON.stringify(minimalPlan)
      });

      const context = {
        sessionId: 'test-session',
        traceId: 'test-trace',
        workingDir: '/tmp',
        constraints: [],
        metadata: {}
      };

      const result = await pipeline.planExecution('read test file', context);
      
      expect(result.steps).toHaveLength(1);
      expect(result.reasoning).toBe('Auto-generated plan');
      expect(result.confidence).toBe(0.7);
      expect(result.dependencies).toEqual([]);
      expect(result.estimatedTimeMs).toBe(60000);
    });
  });

  describe('execute - Error Propagation', () => {
    it('should propagate planning errors when autoPlanning is enabled', async () => {
      // Mock the model router to simulate planning failure
      (modelRouter as any).generateResponse = jest.fn().mockRejectedValue(
        new Error('Planning service down')
      );

      const context = {
        sessionId: 'test-session',
        traceId: 'test-trace',
        workingDir: '/tmp',
        constraints: [],
        metadata: {}
      };

      const result = await pipeline.execute(
        'execute some command',
        context,
        { autoPlanning: true }
      );

      // The result should indicate failure
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool planning failed');
      expect(result.steps).toHaveLength(0);
    });

    it('should throw error when autoPlanning is disabled and no steps provided', async () => {
      const context = {
        sessionId: 'test-session',
        traceId: 'test-trace',
        workingDir: '/tmp',
        constraints: [],
        metadata: {}
      };

      const result = await pipeline.execute(
        'execute some command',
        context,
        { autoPlanning: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No execution steps provided and auto-planning disabled');
    });

    it('should execute provided steps without planning', async () => {
      const context = {
        sessionId: 'test-session',
        traceId: 'test-trace',
        workingDir: '/tmp',
        constraints: [],
        metadata: {}
      };

      // Mock the executive to return successful execution
      executive.executePlan = jest.fn().mockResolvedValue([
        {
          tool: 'read_file',
          success: true,
          output: 'file contents',
          latencyMs: 10,
          metadata: {}
        }
      ]);

      const result = await pipeline.execute(
        'read file',
        context,
        {
          autoPlanning: false,
          providedSteps: [{ tool: 'read_file', args: { path: '/tmp/test.txt' } }]
        }
      );

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].success).toBe(true);
    });
  });

  describe('Security Validation', () => {
    it('should not have execute_command in fallback paths', async () => {
      // This test ensures the unsafe fallback has been removed
      // by checking that planning failures don't result in execute_command steps

      (modelRouter as any).generateResponse = jest.fn().mockRejectedValue(
        new Error('Planning failed')
      );

      const context = {
        sessionId: 'test-session',
        traceId: 'test-trace',
        workingDir: '/tmp',
        constraints: [],
        metadata: {}
      };

      // Test with intentionally malicious command to verify security fix
      // This dangerous command should NOT be executed due to planning failure
      const result = await pipeline.execute(
        'rm -rf /', // Intentionally dangerous command for security testing
        context,
        { autoPlanning: true }
      );

      // Should fail without executing any steps
      expect(result.success).toBe(false);
      expect(result.steps).toHaveLength(0);
      
      // Verify no execute_command was attempted
      const hasExecuteCommand = result.steps.some(step => step.tool === 'execute_command');
      expect(hasExecuteCommand).toBe(false);
    });
  });
});
