/**
 * Safe Plan Parser with JSON Repair and Schema Validation
 *
 * Prevents unsafe fallback execution by:
 * 1. Attempting to repair malformed JSON
 * 2. Validating against strict schema
 * 3. Returning empty plan on failure (fail-safe)
 */

import { z } from "zod";
import type { ToolPlanning } from "./ToolPipeline";

// Strict schema for tool execution plans
const ToolStepSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.any()).default({}),
});

const ToolPlanningSchema = z.object({
  steps: z.array(ToolStepSchema),
  reasoning: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0),
  dependencies: z.array(z.string()).default([]),
  estimatedTimeMs: z.number().int().nonnegative().default(0),
});

export type SafeToolPlanning = z.infer<typeof ToolPlanningSchema>;

export class PlanParser {
  /**
   * Parse and validate LLM response into safe execution plan
   * @param response - Raw LLM response
   * @returns Validated plan or null on failure
   */
  static parsePlan(response: string): ToolPlanning | null {
    try {
      // Step 1: Extract JSON from response (may be wrapped in markdown)
      const jsonText = this.extractJSON(response);
      if (!jsonText) {
        console.warn("[PlanParser] No JSON found in response");
        return null;
      }

      // Step 2: Attempt to parse JSON
      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError) {
        // Step 3: Try to repair malformed JSON
        parsed = this.repairJSON(jsonText);
        if (!parsed) {
          console.warn("[PlanParser] JSON parse and repair failed");
          return null;
        }
      }

      // Step 4: Validate against schema
      const validated = ToolPlanningSchema.safeParse(parsed);
      if (!validated.success) {
        console.warn("[PlanParser] Schema validation failed:", validated.error);
        return null;
      }

      // Step 5: Sanitize tool names (prevent injection)
      const sanitized = this.sanitizePlan(validated.data);
      const normalized = this.normalizePlan(sanitized);

      return normalized;
    } catch (error) {
      console.error("[PlanParser] Unexpected error:", error);
      return null;
    }
  }

  /**
   * Extract JSON object from text (handles markdown code blocks)
   */
  private static extractJSON(text: string): string | null {
    // Try to find JSON in markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }

    // Try to find raw JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    return null;
  }

  /**
   * Attempt to repair common JSON errors
   */
  private static repairJSON(text: string): any | null {
    try {
      let repaired = text;

      // Common repairs
      repaired = repaired
        // Remove trailing commas
        .replace(/,(\s*[}\]])/g, "$1")
        // Fix unquoted keys
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
        // Fix single quotes to double quotes
        .replace(/'/g, '"')
        // Remove comments
        .replace(/\/\/.*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");

      return JSON.parse(repaired);
    } catch (error) {
      return null;
    }
  }

  /**
   * Sanitize plan to prevent injection attacks
   */
  private static sanitizePlan(plan: SafeToolPlanning): SafeToolPlanning {
    return {
      ...plan,
      steps: plan.steps.map((step) => ({
        ...step,
        tool: this.sanitizeToolName(step.tool),
      })),
    };
  }

  /**
   * Sanitize tool name to prevent injection
   */
  private static sanitizeToolName(name: string): string {
    // Only allow alphanumeric, underscore, and hyphen
    const chars = Array.from(name);
    let result = "";

    for (let i = 0; i < chars.length; i++) {
      const current = chars[i];
      if (/[a-zA-Z0-9_]/.test(current)) {
        result += current;
        continue;
      }

      if (current === "-") {
        const prev = chars[i - 1] ?? "";
        const next = chars[i + 1] ?? "";
        if (/[a-zA-Z0-9_]/.test(prev) && /[a-zA-Z0-9_]/.test(next)) {
          result += "-";
        }
      }
    }

    return result;
  }

  /**
   * Create an empty safe plan (fail-safe default)
   */
  static emptyPlan(): ToolPlanning {
    return {
      steps: [],
      reasoning: "Empty plan - planning failed safely",
      confidence: 0,
      dependencies: [],
      estimatedTimeMs: 0,
    };
  }

  private static normalizePlan(plan: SafeToolPlanning): ToolPlanning {
    return {
      steps: plan.steps.map((step) => ({
        tool: step.tool,
        args: step.args ?? {},
      })),
      reasoning: plan.reasoning,
      confidence: plan.confidence,
      dependencies: plan.dependencies ?? [],
      estimatedTimeMs: plan.estimatedTimeMs ?? 0,
    };
  }
}
