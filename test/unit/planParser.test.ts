/**
 * Plan Parser Security Tests
 *
 * Critical security test: malformed plan → empty plan (no unsafe fallback)
 */

import { describe, it, expect } from "@jest/globals";
import { PlanParser } from "../../agent/pipeline/planParser";

describe("PlanParser Security", () => {
  describe("Malformed Input Handling", () => {
    it("should return empty plan for malformed JSON (no unsafe fallback)", () => {
      const malformedJSON = "{ steps: [{ tool: execute_command }] invalid }";
      const result = PlanParser.parsePlan(malformedJSON);

      // CRITICAL: Must return null, NOT execute raw command
      expect(result).toBeNull();
    });

    it("should return empty plan for empty string", () => {
      const result = PlanParser.parsePlan("");
      expect(result).toBeNull();
    });

    it("should return empty plan for non-JSON text", () => {
      const result = PlanParser.parsePlan("This is not JSON at all");
      expect(result).toBeNull();
    });

    it("should return empty plan for incomplete JSON", () => {
      const incomplete = '{ "steps": [{ "tool": "test"';
      const result = PlanParser.parsePlan(incomplete);
      expect(result).toBeNull();
    });
  });

  describe("JSON Extraction", () => {
    it("should extract JSON from markdown code block", () => {
      const markdown =
        '```json\n{"steps": [], "reasoning": "test", "confidence": 0.8, "dependencies": [], "estimatedTimeMs": 1000}\n```';
      const result = PlanParser.parsePlan(markdown);

      expect(result).not.toBeNull();
      expect(result?.steps).toEqual([]);
    });

    it("should extract JSON from plain text response", () => {
      const text =
        'Here is the plan: {"steps": [], "reasoning": "test", "confidence": 0.8, "dependencies": [], "estimatedTimeMs": 1000}';
      const result = PlanParser.parsePlan(text);

      expect(result).not.toBeNull();
      expect(result?.reasoning).toBe("test");
    });
  });

  describe("JSON Repair", () => {
    it("should repair trailing commas", () => {
      const withComma =
        '{"steps": [], "reasoning": "test", "confidence": 0.8, "dependencies": [], "estimatedTimeMs": 1000,}';
      const result = PlanParser.parsePlan(withComma);

      expect(result).not.toBeNull();
      expect(result?.steps).toEqual([]);
    });

    it("should handle single quotes (convert to double)", () => {
      const singleQuotes =
        "{'steps': [], 'reasoning': 'test', 'confidence': 0.8, 'dependencies': [], 'estimatedTimeMs': 1000}";
      const result = PlanParser.parsePlan(singleQuotes);

      expect(result).not.toBeNull();
      expect(result?.reasoning).toBe("test");
    });
  });

  describe("Schema Validation", () => {
    it("should validate correct plan structure", () => {
      const validPlan = {
        steps: [{ tool: "test_tool", args: { foo: "bar" } }],
        reasoning: "Test reasoning",
        confidence: 0.9,
        dependencies: ["dep1"],
        estimatedTimeMs: 5000,
      };

      const result = PlanParser.parsePlan(JSON.stringify(validPlan));

      expect(result).not.toBeNull();
      expect(result?.steps).toHaveLength(1);
      expect(result?.steps[0].tool).toBe("test_tool");
      expect(result?.confidence).toBe(0.9);
    });

    it("should reject plan with missing steps", () => {
      const invalid = {
        reasoning: "Test",
        confidence: 0.9,
        dependencies: [],
        estimatedTimeMs: 1000,
      };

      const result = PlanParser.parsePlan(JSON.stringify(invalid));
      expect(result).toBeNull();
    });

    it("should reject plan with invalid confidence (> 1)", () => {
      const invalid = {
        steps: [],
        reasoning: "Test",
        confidence: 1.5, // Invalid: > 1
        dependencies: [],
        estimatedTimeMs: 1000,
      };

      const result = PlanParser.parsePlan(JSON.stringify(invalid));
      expect(result).toBeNull();
    });

    it("should reject plan with negative estimatedTimeMs", () => {
      const invalid = {
        steps: [],
        reasoning: "Test",
        confidence: 0.8,
        dependencies: [],
        estimatedTimeMs: -1000, // Invalid: negative
      };

      const result = PlanParser.parsePlan(JSON.stringify(invalid));
      expect(result).toBeNull();
    });

    it("should reject plan with non-array steps", () => {
      const invalid = {
        steps: "not an array",
        reasoning: "Test",
        confidence: 0.8,
        dependencies: [],
        estimatedTimeMs: 1000,
      };

      const result = PlanParser.parsePlan(JSON.stringify(invalid));
      expect(result).toBeNull();
    });
  });

  describe("Tool Name Sanitization", () => {
    it("should sanitize tool names with special characters", () => {
      const planWithInjection = {
        steps: [{ tool: "test_tool; rm -rf /", args: {} }],
        reasoning: "Test",
        confidence: 0.8,
        dependencies: [],
        estimatedTimeMs: 1000,
      };

      const result = PlanParser.parsePlan(JSON.stringify(planWithInjection));

      expect(result).not.toBeNull();
      // Semicolon and slash should be removed
      expect(result?.steps[0].tool).toBe("test_toolrmrf");
    });

    it("should allow alphanumeric, underscore, and hyphen in tool names", () => {
      const validTools = {
        steps: [
          { tool: "valid_tool_123", args: {} },
          { tool: "another-tool", args: {} },
        ],
        reasoning: "Test",
        confidence: 0.8,
        dependencies: [],
        estimatedTimeMs: 1000,
      };

      const result = PlanParser.parsePlan(JSON.stringify(validTools));

      expect(result).not.toBeNull();
      expect(result?.steps[0].tool).toBe("valid_tool_123");
      expect(result?.steps[1].tool).toBe("another-tool");
    });
  });

  describe("Empty Plan Factory", () => {
    it("should create valid empty plan", () => {
      const empty = PlanParser.emptyPlan();

      expect(empty.steps).toEqual([]);
      expect(empty.reasoning).toContain("Empty plan");
      expect(empty.confidence).toBe(0);
      expect(empty.dependencies).toEqual([]);
      expect(empty.estimatedTimeMs).toBe(0);
    });
  });

  describe("Security Regression Tests", () => {
    it("CRITICAL: must NOT return execute_command for invalid input", () => {
      const malformedInputs = [
        "",
        "invalid json",
        "{ broken: json }",
        "{{ nested: { broken } }",
        "rm -rf /",
        "DELETE FROM users;",
      ];

      malformedInputs.forEach((input) => {
        const result = PlanParser.parsePlan(input);

        // Must return null or empty, NEVER a command execution plan
        if (result !== null) {
          expect(result.steps).not.toContainEqual(
            expect.objectContaining({ tool: "execute_command" }),
          );
        }
      });
    });

    it("CRITICAL: emptyPlan must NOT contain execute_command", () => {
      const empty = PlanParser.emptyPlan();

      expect(empty.steps).toEqual([]);
      expect(empty.steps).not.toContainEqual(
        expect.objectContaining({ tool: "execute_command" }),
      );
    });
  });
});

describe("PlanParser Edge Cases", () => {
  it("should handle very large JSON", () => {
    const largeSteps = Array.from({ length: 1000 }, (_, i) => ({
      tool: `tool_${i}`,
      args: { index: i },
    }));

    const largePlan = {
      steps: largeSteps,
      reasoning: "Large plan",
      confidence: 0.8,
      dependencies: [],
      estimatedTimeMs: 60000,
    };

    const result = PlanParser.parsePlan(JSON.stringify(largePlan));

    expect(result).not.toBeNull();
    expect(result?.steps).toHaveLength(1000);
  });

  it("should handle Unicode characters", () => {
    const unicodePlan = {
      steps: [{ tool: "test_tool", args: { message: "你好世界 🚀" } }],
      reasoning: "Test with Unicode: café, Москва, 日本語",
      confidence: 0.8,
      dependencies: [],
      estimatedTimeMs: 1000,
    };

    const result = PlanParser.parsePlan(JSON.stringify(unicodePlan));

    expect(result).not.toBeNull();
    expect(result?.reasoning).toContain("café");
  });

  it("should handle deeply nested args", () => {
    const deepPlan = {
      steps: [
        {
          tool: "complex_tool",
          args: {
            level1: {
              level2: {
                level3: {
                  data: "deep value",
                },
              },
            },
          },
        },
      ],
      reasoning: "Deep nesting test",
      confidence: 0.8,
      dependencies: [],
      estimatedTimeMs: 1000,
    };

    const result = PlanParser.parsePlan(JSON.stringify(deepPlan));

    expect(result).not.toBeNull();
    expect(result?.steps[0].args.level1.level2.level3.data).toBe("deep value");
  });
});
