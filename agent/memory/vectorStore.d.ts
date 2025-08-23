import { MemoryDocument, SearchResult, SearchOptions } from '../../types';
export declare class VectorStore {
    private db;
    private embeddingCache;
    private ready;
    private dbPath;
    private initPromise;
    constructor(dbPath?: string);
    private ensureReady;
    initialize(): Promise<void>;
    private initializeDatabase;
    isReady(): boolean;
    upsert(doc: MemoryDocument): Promise<void>;
    getDocument(id: string): Promise<MemoryDocument | null>;
    getDocumentCount(): Promise<number>;
    deleteDocument(id: string): Promise<boolean>;
    clear(): Promise<void>;
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    similarity(query: string, k?: number, threshold?: number): Promise<SearchResult[]>;
    private generateEmbedding;
    private cosineSimilarity;
    private textSimilarity;
}
export default VectorStore;
