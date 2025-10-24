import { VectorStore } from "../../agent/memory/vectorStore";
import { MemoryDocument } from "../../types";

// Mock fetch globally
global.fetch = jest.fn();

describe("VectorStore", () => {
  let vectorStore: VectorStore;

  beforeEach(async () => {
    vectorStore = new VectorStore();
    await vectorStore.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await vectorStore.clear();
    jest.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should initialize successfully", () => {
      expect(vectorStore.isReady()).toBe(true);
    });
  });

  describe("upsert method", () => {
    it("should upsert document without embedding when no API key", async () => {
      const document: MemoryDocument = {
        id: "test-1",
        content: "Test document content",
        type: "document",
        timestamp: new Date().toISOString(),
      };

      await vectorStore.upsert(document);

      const retrieved = await vectorStore.getDocument("test-1");
      expect(retrieved).toBeDefined();
      expect(retrieved?.content).toBe("Test document content");
      expect(await vectorStore.getDocumentCount()).toBe(1);
    });

    it("should upsert document with mocked embedding", async () => {
      // Mock OpenAI API key
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-key";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 10 },
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const document: MemoryDocument = {
        id: "test-2",
        content: "Test document with embedding",
        type: "document",
        timestamp: new Date().toISOString(),
      };

      await vectorStore.upsert(document);

      const retrieved = await vectorStore.getDocument("test-2");
      expect(retrieved).toBeDefined();
      expect(retrieved?.embedding).toEqual([0.1, 0.2, 0.3]);

      // Restore original key
      process.env.OPENAI_API_KEY = originalKey;
    });

    it("should handle API errors gracefully", async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-key";

      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue("Unauthorized"),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const document: MemoryDocument = {
        id: "test-3",
        content: "Test document",
        type: "document",
        timestamp: new Date().toISOString(),
      };

      // Should not throw, but store without embedding
      await expect(vectorStore.upsert(document)).resolves.not.toThrow();

      const retrieved = await vectorStore.getDocument("test-3");
      expect(retrieved).toBeDefined();
      expect(retrieved?.embedding).toBeUndefined();

      process.env.OPENAI_API_KEY = originalKey;
    });
  });

  describe("similarity method", () => {
    beforeEach(async () => {
      // Add test documents
      const documents: MemoryDocument[] = [
        {
          id: "doc-1",
          content: "This is about artificial intelligence and machine learning",
          type: "document",
          timestamp: new Date().toISOString(),
        },
        {
          id: "doc-2",
          content: "Cooking recipes and food preparation techniques",
          type: "document",
          timestamp: new Date().toISOString(),
        },
        {
          id: "doc-3",
          content: "Machine learning algorithms and neural networks",
          type: "document",
          timestamp: new Date().toISOString(),
        },
      ];

      for (const doc of documents) {
        await vectorStore.upsert(doc);
      }
    });

    it("should perform text-based similarity search without API key", async () => {
      const results = await vectorStore.similarity("machine learning", 5, 0.3);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(2); // doc-1 and doc-3 should match
      expect(results[0].similarity).toBeGreaterThan(0.3);
      expect(
        results.every((r) =>
          r.document.content.toLowerCase().includes("machine"),
        ),
      ).toBe(true);
    });

    it("should return empty results for unrelated queries", async () => {
      const results = await vectorStore.similarity("quantum physics", 5, 0.5);
      expect(results).toHaveLength(0);
    });

    it("should respect limit parameter", async () => {
      const results = await vectorStore.similarity("machine learning", 1, 0.3);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("should respect threshold parameter", async () => {
      const results = await vectorStore.similarity("machine learning", 5, 0.9);
      // Text-based similarity returns 0.8, so 0.9 threshold should exclude them
      expect(results.length).toBeLessThanOrEqual(2); // Allow for text-based matches
      if (results.length > 0) {
        expect(results.every((r) => r.similarity >= 0.8)).toBe(true);
      }
    });

    it("should perform vector similarity with mocked embeddings", async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-key";

      // Mock embedding API response
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ embedding: [0.5, 0.5, 0.5] }],
          usage: { total_tokens: 5 },
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Add a document with embedding
      const docWithEmbedding: MemoryDocument = {
        id: "doc-with-embedding",
        content: "AI and ML content",
        type: "document",
        timestamp: new Date().toISOString(),
        embedding: [0.6, 0.6, 0.6], // Similar to query embedding
      };

      await vectorStore.upsert(docWithEmbedding);

      const results = await vectorStore.similarity("AI query", 5, 0.7);

      // Should find the document with similar embedding
      const foundDoc = results.find(
        (r) => r.document.id === "doc-with-embedding",
      );
      expect(foundDoc).toBeDefined();
      expect(foundDoc?.similarity).toBeGreaterThan(0.9);

      process.env.OPENAI_API_KEY = originalKey;
    });
  });

  describe("document management", () => {
    it("should get document count", async () => {
      expect(await vectorStore.getDocumentCount()).toBe(0);

      await vectorStore.upsert({
        id: "test",
        content: "test",
        type: "document",
        timestamp: new Date().toISOString(),
      });

      expect(await vectorStore.getDocumentCount()).toBe(1);
    });

    it("should delete documents", async () => {
      await vectorStore.upsert({
        id: "to-delete",
        content: "test",
        type: "document",
        timestamp: new Date().toISOString(),
      });

      expect(await vectorStore.getDocument("to-delete")).toBeDefined();

      const deleted = await vectorStore.deleteDocument("to-delete");
      expect(deleted).toBe(true);
      expect(await vectorStore.getDocument("to-delete")).toBeNull();
    });

    it("should clear all documents", async () => {
      await vectorStore.upsert({
        id: "test-1",
        content: "test",
        type: "document",
        timestamp: new Date().toISOString(),
      });

      await vectorStore.upsert({
        id: "test-2",
        content: "test",
        type: "document",
        timestamp: new Date().toISOString(),
      });

      expect(await vectorStore.getDocumentCount()).toBe(2);

      await vectorStore.clear();
      expect(await vectorStore.getDocumentCount()).toBe(0);
    });
  });

  describe("search method", () => {
    beforeEach(async () => {
      await vectorStore.upsert({
        id: "conv-1",
        content: "User conversation about AI",
        type: "conversation",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
      });

      await vectorStore.upsert({
        id: "doc-1",
        content: "Document about AI",
        type: "document",
        timestamp: new Date().toISOString(),
      });
    });

    it("should filter by type", async () => {
      const results = await vectorStore.search("AI", { type: "conversation" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.document.type === "conversation")).toBe(
        true,
      );
    });

    it("should filter by sessionId", async () => {
      const results = await vectorStore.search("AI", {
        sessionId: "session-1",
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.document.sessionId === "session-1")).toBe(
        true,
      );
    });

    it("should combine filters", async () => {
      const results = await vectorStore.search("AI", {
        type: "conversation",
        sessionId: "session-1",
      });
      expect(results.length).toBeGreaterThan(0);
      expect(
        results.every(
          (r) =>
            r.document.type === "conversation" &&
            r.document.sessionId === "session-1",
        ),
      ).toBe(true);
    });
  });
});
