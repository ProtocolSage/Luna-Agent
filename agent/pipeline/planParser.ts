/**
 * Safe Plan Parser with JSON Repair and Schema Validation
 *
 * Prevents unsafe fallback execution by:
 * 1. Attempting to repair malformed JSON
 * 2. Validating against strict schema
 * 3. Returning empty plan on failure (fail-safe)
 */

import { z } from 'zod';

// Strict schema for tool execution plans
const ToolStepSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.any())
});

const ToolPlanningSchema = z.object({
  steps: z.array(ToolStepSchema),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  dependencies: z.array(z.string()),
  estimatedTimeMs: z.number().positive()
});

export type SafeToolPlanning = z.infer<typeof ToolPlanningSchema>;

export class PlanParser {
  /**
   * Parse and validate LLM response into safe execution plan
   * @param response - Raw LLM response
   * @returns Validated plan or null on failure
   */
  static parsePlan(response: string): SafeToolPlanning | null {
    try {
      // Step 1: Extract JSON from response (may be wrapped in markdown)
      const jsonText = this.extractJSON(response);
      if (!jsonText) {
        console.warn('[PlanParser] No JSON found in response');
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
          console.warn('[PlanParser] JSON parse and repair failed');
          return null;
        }
      }

      // Step 4: Validate against schema
      const validated = ToolPlanningSchema.safeParse(parsed);
      if (!validated.success) {
        console.warn('[PlanParser] Schema validation failed:', validated.error);
        return null;
      }

      // Step 5: Sanitize tool names (prevent injection)
      const sanitized = this.sanitizePlan(validated.data);

      return sanitized;

    } catch (error) {
      console.error('[PlanParser] Unexpected error:', error);
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
        .replace(/,(\s*[}\]])/g, '$1')
        // Fix unquoted keys
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
        // Fix single quotes to double quotes
        .replace(/'/g, '"')
        // Remove comments
        .replace(/\/\/.*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

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
      steps: plan.steps.map(step => ({
        ...step,
        tool: this.sanitizeToolName(step.tool)
      }))
    };
  }

  /**
   * Sanitize tool name to prevent injection
   */
  private static sanitizeToolName(name: string): string {
    // Only allow alphanumeric, underscore, and hyphen
    return name.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /**
   * Create an empty safe plan (fail-safe default)
   */
  static emptyPlan(): SafeToolPlanning {
    return {
      steps: [],
      reasoning: 'Empty plan - planning failed safely',
      confidence: 0,
      dependencies: [],
      estimatedTimeMs: 0
    };
  }
}
