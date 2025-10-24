export interface EmbeddingResponse {
  embedding: number[];
  tokenCount: number;
}
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
export declare class EmbeddingService {
  private apiKey;
  private model;
  private maxRetries;
  private rateLimitDelay;
  constructor();
  /**
   * Check if embedding service is available
   * Sync on purpose (the service is config-based)
   */
  isAvailable(): boolean;
  /**
   * Generate embedding for text content
   * Returns null if service unavailable or request fails
   */
  generateEmbedding(text: string): Promise<EmbeddingResponse | null>;
  /**
   * Generate embeddings for multiple texts in batch
   * More efficient for bulk operations
   */
  generateEmbeddingsBatch(
    texts: string[],
  ): Promise<(EmbeddingResponse | null)[]>;
  /**
   * Calculate cosine similarity between two embeddings
   * Used for finding semantically similar memories
   */
  static cosineSimilarity(a: number[], b: number[]): number;
  /**
   * Find most similar embedding from a list
   */
  static findMostSimilar(
    queryEmbedding: number[],
    candidates: {
      embedding: number[];
      data: any;
    }[],
  ): {
    similarity: number;
    data: any;
  } | null;
  private prepareTextForEmbedding;
  private delay;
}
/**
 * Singleton instance for global use
 */
export declare const embeddingService: EmbeddingService;
