import { MemoryDocument, VectorSearchResult, EmbeddingResponse } from '../../types';

export class VectorStore {
  private isInitialized = false;
  private embeddingModel = 'text-embedding-3-small';
  private dimensions = 1536;
  private documents: Map<string, MemoryDocument> = new Map();

  constructor() {}

  async initialize(): Promise<void> {
    try {
      if (process.env.OPENAI_API_KEY) {
        await this.testEmbeddingAPI();
        this.isInitialized = true;
        console.log('Vector store initialized with OpenAI embeddings');
      } else {
        console.warn('Vector store initialized without embeddings (no OpenAI API key)');
        this.isInitialized = true;
      }
    } catch (error) {
      console.error('Vector store initialization failed:', error);
      this.isInitialized = true; // Continue without embeddings
    }
  }

  private async testEmbeddingAPI(): Promise<void> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: 'test'
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding API test failed: ${response.status}`);
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async upsert(document: MemoryDocument): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Vector store not initialized');
    }

    try {
      if (process.env.OPENAI_API_KEY && !document.embedding) {
        const embeddingResponse = await this.generateEmbedding(document.content);
        document.embedding = embeddingResponse.embedding;
        console.log(`Generated embedding for document ${document.id} (${embeddingResponse.tokens} tokens, $${embeddingResponse.cost.toFixed(6)})`);
      }

      this.documents.set(document.id, { ...document });
      console.log(`Upserted document ${document.id} to vector store`);
    } catch (error) {
      console.error(`Failed to upsert document ${document.id}:`, error);
      // Store document without embedding rather than failing
      this.documents.set(document.id, { ...document });
    }
  }

  async addDocument(document: MemoryDocument): Promise<void> {
    return this.upsert(document);
  }

  async similarity(query: string, limit: number = 10, threshold: number = 0.7): Promise<VectorSearchResult[]> {
    if (!this.isInitialized) {
      throw new Error('Vector store not initialized');
    }

    try {
      if (!process.env.OPENAI_API_KEY) {
        // Fallback to text-based search without embeddings
        return this.textBasedSearch(query, limit);
      }

      const queryEmbedding = await this.generateEmbedding(query);
      const results: VectorSearchResult[] = [];

      for (const [id, doc] of this.documents) {
        if (!doc.embedding) continue;

        const similarity = this.cosineSimilarity(queryEmbedding.embedding, doc.embedding);
        const distance = 1 - similarity;

        if (similarity >= threshold) {
          results.push({
            document: doc,
            similarity,
            distance
          });
        }
      }

      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      console.error('Vector similarity search failed:', error);
      return this.textBasedSearch(query, limit);
    }
  }

  private textBasedSearch(query: string, limit: number): VectorSearchResult[] {
    const queryLower = query.toLowerCase();
    const results: VectorSearchResult[] = [];

    for (const [id, doc] of this.documents) {
      const contentLower = doc.content.toLowerCase();
      let score = 0;

      // Simple text matching
      if (contentLower.includes(queryLower)) {
        score = 0.8;
      } else {
        // Word-based matching
        const queryWords = queryLower.split(/\s+/);
        const contentWords = contentLower.split(/\s+/);
        const matches = queryWords.filter(word => contentWords.includes(word));
        score = matches.length / queryWords.length * 0.6;
      }

      if (score > 0.3) {
        results.push({
          document: doc,
          similarity: score,
          distance: 1 - score
        });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenAI Embedding API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const tokens = data.usage.total_tokens;
    const cost = tokens / 1000 * 0.0001; // $0.0001 per 1K tokens for text-embedding-3-small

    return {
      embedding: data.data[0].embedding,
      tokens,
      cost
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async search(query: string, options: {
    limit?: number;
    threshold?: number;
    type?: string;
    sessionId?: string;
  } = {}): Promise<VectorSearchResult[]> {
    const results = await this.similarity(
      query, 
      options.limit || 10, 
      options.threshold || 0.7
    );

    // Filter by type and sessionId if specified
    return results.filter(result => {
      if (options.type && result.document.type !== options.type) return false;
      if (options.sessionId && result.document.sessionId !== options.sessionId) return false;
      return true;
    });
  }

  getDocumentCount(): number {
    return this.documents.size;
  }

  clear(): void {
    this.documents.clear();
  }

  getDocument(id: string): MemoryDocument | undefined {
    return this.documents.get(id);
  }

  deleteDocument(id: string): boolean {
    return this.documents.delete(id);
  }
}

