import { ModelRouter } from "../../agent/orchestrator/modelRouter";
import { ModelConfig } from "../../types";

// Mock fetch globally
global.fetch = jest.fn();

describe("ModelRouter", () => {
  let modelRouter: ModelRouter;
  let mockModels: ModelConfig[];

  beforeEach(() => {
    mockModels = [
      {
        name: "gpt-4o-2024-08-06",
        provider: "openai",
        temperature: 0.7,
        maxTokens: 2000,
        costPer1kTokensIn: 0.0025,
        costPer1kTokensOut: 0.01,
      },
    ];
    modelRouter = new ModelRouter(mockModels);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with provided models", () => {
      expect(modelRouter).toBeDefined();
      const metrics = modelRouter.getMetrics();
      expect(metrics["gpt-4o-2024-08-06"]).toBeDefined();
      expect(metrics["gpt-4o-2024-08-06"].totalRequests).toBe(0);
    });

    it("should initialize circuit breakers", () => {
      const status = modelRouter.getCircuitBreakerStatus();
      expect(status["gpt-4o-2024-08-06"].state).toBe("CLOSED");
      expect(status["gpt-4o-2024-08-06"].failures).toBe(0);
    });
  });

  describe("route method", () => {
    it("should throw error when no models available", async () => {
      const emptyRouter = new ModelRouter([]);
      await expect(emptyRouter.route("test")).rejects.toThrow(
        "No models available",
      );
    });

    it("should successfully route with mocked API response", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            { message: { content: "Test response" }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await modelRouter.route("test prompt");

      expect(result.content).toBe("Test response");
      expect(result.tokensUsed).toBe(30);
    });

    it("should handle API errors gracefully", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: jest
          .fn()
          .mockResolvedValue('{"error": {"message": "Invalid API key"}}'),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(modelRouter.route("test")).rejects.toThrow(
        "OpenAI API error",
      );
    });
  });

  describe("circuit breaker", () => {
    it("should open circuit breaker after 3 failures", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: jest.fn().mockResolvedValue("Server error"),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Trigger failures to open circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await modelRouter.route("test");
        } catch (error) {
          // Expected to fail
        }
      }

      const status = modelRouter.getCircuitBreakerStatus();
      expect(status["gpt-4o-2024-08-06"].state).toBe("OPEN");
      expect(status["gpt-4o-2024-08-06"].failures).toBe(6);
    });

    it("should reset circuit breaker after timeout", async () => {
      // Mock Date.now for consistent timing
      const originalNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: jest.fn().mockResolvedValue("Server error"),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockErrorResponse);

      // Open circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await modelRouter.route("test");
        } catch (error) {
          // Expected to fail
        }
      }

      // Verify circuit is open
      let status = modelRouter.getCircuitBreakerStatus();
      expect(status["gpt-4o-2024-08-06"].state).toBe("OPEN");

      // Advance time past recovery timeout
      mockTime += 70000; // 70 seconds later

      // Mock successful response
      const mockSuccessResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "Success" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockSuccessResponse);

      const result = await modelRouter.route("test");
      expect(result.content).toBe("Success");

      status = modelRouter.getCircuitBreakerStatus();
      expect(status["gpt-4o-2024-08-06"].state).toBe("CLOSED");
      expect(status["gpt-4o-2024-08-06"].failures).toBe(0);

      // Restore Date.now
      Date.now = originalNow;
    });
  });

  describe("cost calculation", () => {
    it("should calculate OpenAI costs correctly", () => {
      const usage = { prompt_tokens: 1000, completion_tokens: 500 };
      const cost = modelRouter.calculateOpenAICost("gpt-4o-2024-08-06", usage);

      // Expected: (1000/1000 * 0.0025) + (500/1000 * 0.01) = 0.0025 + 0.005 = 0.0075
      expect(cost).toBeCloseTo(0.0075, 4);
    });

    it("should return 0 for undefined usage", () => {
      const cost = modelRouter.calculateOpenAICost(
        "gpt-4o-2024-08-06",
        undefined,
      );
      expect(cost).toBe(0);
    });
  });

  describe("metrics", () => {
    it("should track successful requests", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "Test" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await modelRouter.route("test");

      const metrics = modelRouter.getMetrics();
      expect(metrics["gpt-4o-2024-08-06"].totalRequests).toBe(1);
      expect(metrics["gpt-4o-2024-08-06"].successfulRequests).toBe(1);
      expect(metrics["gpt-4o-2024-08-06"].failedRequests).toBe(0);
      expect(metrics["gpt-4o-2024-08-06"].totalTokensIn).toBe(18); // 60% of 30 tokens
      expect(metrics["gpt-4o-2024-08-06"].totalTokensOut).toBe(12); // 40% of 30 tokens
    });

    it("should track failed requests with retries", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: jest.fn().mockResolvedValue("Server error"),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      try {
        await modelRouter.route("test");
      } catch (error) {
        // Expected to fail
      }

      const metrics = modelRouter.getMetrics();
      // Should have 3 total requests due to retries
      expect(metrics["gpt-4o-2024-08-06"].totalRequests).toBe(3);
      expect(metrics["gpt-4o-2024-08-06"].failedRequests).toBe(3);
      expect(metrics["gpt-4o-2024-08-06"].successfulRequests).toBe(0);
    });
  });
});
