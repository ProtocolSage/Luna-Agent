"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.embeddingService = exports.EmbeddingService = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
 * OpenAI Embedding Service for Luna Agent Memory System
 *
 * Provides text embedding generation using OpenAI's text-embedding-3-small model
 * Features:
 * - Automatic API key detection from environment
 * - Graceful fallback when API unavailable
 * - Optimized for memory storage (1536 dimensions)
 * - Rate limiting and error handling
 */
class EmbeddingService {
  constructor() {
    this.model = "text-embedding-3-small";
    this.maxRetries = 3;
    this.rateLimitDelay = 100; // ms between requests
    this.apiKey = process.env.OPENAI_API_KEY || null;
  }
  /**
   * Check if embedding service is available
   * Sync on purpose (the service is config-based)
   */
  isAvailable() {
    if (process.env.LUNA_DISABLE_EMBEDDINGS === "1") return false;
    return !!process.env.OPENAI_API_KEY;
  }
  /**
   * Generate embedding for text content
   * Returns null if service unavailable or request fails
   */
  async generateEmbedding(text) {
    if (!this.apiKey) {
      return null; // Graceful fallback to text search
    }
    // Clean and truncate text for embedding
    const cleanText = this.prepareTextForEmbedding(text);
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
        try {
          const response = await (0, node_fetch_1.default)(
            "https://api.openai.com/v1/embeddings",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                input: cleanText,
                model: this.model,
                encoding_format: "float",
              }),
              signal: controller.signal,
            },
          );
          if (!response.ok) {
            if (response.status === 429) {
              // Rate limited - wait and retry
              await this.delay(Math.pow(2, attempt) * 1000);
              continue;
            }
            throw new Error(
              `OpenAI API error: ${response.status} ${response.statusText}`,
            );
          }
          const data = await response.json();
          return {
            embedding: data.data[0].embedding,
            tokenCount: data.usage.total_tokens,
          };
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        console.warn(`Embedding attempt ${attempt} failed:`, error.message);
        if (attempt === this.maxRetries) {
          console.error(
            "All embedding attempts failed, falling back to text search",
          );
          return null;
        }
        // Wait before retry
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
    return null;
  }
  /**
   * Generate embeddings for multiple texts in batch
   * More efficient for bulk operations
   */
  async generateEmbeddingsBatch(texts) {
    if (!this.apiKey) {
      return texts.map(() => null);
    }
    // Process in smaller batches to avoid API limits
    const batchSize = 10;
    const results = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      for (const text of batch) {
        const result = await this.generateEmbedding(text);
        results.push(result);
        // Rate limiting between requests
        if (i + batch.indexOf(text) < texts.length - 1) {
          await this.delay(this.rateLimitDelay);
        }
      }
    }
    return results;
  }
  /**
   * Calculate cosine similarity between two embeddings
   * Used for finding semantically similar memories
   */
  static cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  /**
   * Find most similar embedding from a list
   */
  static findMostSimilar(queryEmbedding, candidates) {
    if (candidates.length === 0) return null;
    let bestMatch = candidates[0];
    let bestSimilarity = this.cosineSimilarity(
      queryEmbedding,
      bestMatch.embedding,
    );
    for (let i = 1; i < candidates.length; i++) {
      const similarity = this.cosineSimilarity(
        queryEmbedding,
        candidates[i].embedding,
      );
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = candidates[i];
      }
    }
    return {
      similarity: bestSimilarity,
      data: bestMatch.data,
    };
  }
  // Private helper methods
  prepareTextForEmbedding(text) {
    // Clean text for embedding
    let cleaned = text
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[^\w\s\-.,!?;:()\[\]]/g, "") // Remove special chars
      .trim();
    // Truncate to reasonable length (approx 8000 tokens max)
    if (cleaned.length > 32000) {
      cleaned = cleaned.substring(0, 32000) + "...";
    }
    return cleaned;
  }
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
exports.EmbeddingService = EmbeddingService;
/**
 * Singleton instance for global use
 */
exports.embeddingService = new EmbeddingService();
