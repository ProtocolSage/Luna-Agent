import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Supabase configuration
interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

// Database types for Luna Agent
export interface Memory {
  id: string;
  content: string;
  type:
    | "conversation"
    | "document"
    | "goal"
    | "reminder"
    | "journal"
    | "note"
    | "task";
  timestamp: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  user_id?: string;
  session_id?: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  user_id?: string;
  metadata?: Record<string, any>;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

class SupabaseManager {
  private client: SupabaseClient | null = null;
  private config: SupabaseConfig | null = null;
  private isConnected = false;

  constructor() {
    this.initializeFromEnv();
  }

  private initializeFromEnv(): void {
    try {
      const url = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (url && anonKey) {
        this.config = { url, anonKey, serviceRoleKey };
        this.connect();
      } else {
        console.warn(
          "[Supabase] No configuration found in environment variables",
        );
        console.log(
          "[Supabase] Set SUPABASE_URL and SUPABASE_ANON_KEY to enable cloud database",
        );
      }
    } catch (error) {
      console.warn("[Supabase] Failed to initialize from environment:", error);
    }
  }

  private connect(): void {
    if (!this.config) {
      throw new Error("Supabase configuration not set");
    }

    try {
      this.client = createClient(this.config.url, this.config.anonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });

      this.isConnected = true;
      console.log("[Supabase] Connected to cloud database successfully");
    } catch (error) {
      console.error("[Supabase] Failed to connect:", error);
      this.isConnected = false;
      throw error;
    }
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) return false;

    try {
      const { data, error } = await this.client
        .from("memories")
        .select("count", { count: "exact", head: true });
      if (error && error.code !== "PGRST116") {
        // PGRST116 = table doesn't exist (acceptable for first run)
        console.error("[Supabase] Connection test failed:", error);
        return false;
      }

      console.log("[Supabase] Connection test successful");
      return true;
    } catch (error) {
      console.error("[Supabase] Connection test error:", error);
      return false;
    }
  }

  async setupSchema(): Promise<void> {
    if (!this.client) {
      throw new Error("Supabase client not initialized");
    }

    console.log("[Supabase] Setting up database schema...");

    // Note: In production, run these SQL commands in your Supabase dashboard
    // This is just for documentation and local development
    const schemaSQL = `
      -- Enable pgvector extension for vector operations
      CREATE EXTENSION IF NOT EXISTS vector;
      
      -- Conversations table
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        user_id TEXT,
        metadata JSONB DEFAULT '{}'::jsonb
      );
      
      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      );
      
      -- Memories table with vector support
      CREATE TABLE IF NOT EXISTS memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('conversation', 'document', 'goal', 'reminder', 'journal', 'note', 'task')),
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        embedding vector(1536), -- OpenAI embedding dimension
        metadata JSONB DEFAULT '{}'::jsonb,
        user_id TEXT,
        session_id TEXT
      );
      
      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
      CREATE INDEX IF NOT EXISTS idx_memories_session_id ON memories(session_id);
      
      -- Vector similarity search index
      CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
      
      -- Full-text search index
      CREATE INDEX IF NOT EXISTS idx_memories_content_search ON memories USING gin(to_tsvector('english', content));
      
      -- Messages indexes
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
      
      -- RLS (Row Level Security) policies - uncomment if using authentication
      -- ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
      -- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
      -- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
      
      -- Function to update updated_at timestamp
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
      
      -- Trigger for conversations
      CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    console.log(
      "[Supabase] Schema setup complete. Please run the following SQL in your Supabase dashboard:",
    );
    console.log(schemaSQL);
  }
}

// Singleton instance
const supabaseManager = new SupabaseManager();

export default supabaseManager;
export { SupabaseManager };
