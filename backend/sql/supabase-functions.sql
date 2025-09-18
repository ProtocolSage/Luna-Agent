-- Supabase SQL Functions for Luna Agent
-- Run these in your Supabase SQL Editor

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to match memories by vector similarity
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.1,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  type text,
  timestamp timestamptz,
  embedding vector(1536),
  metadata jsonb,
  user_id text,
  session_id text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    memories.id,
    memories.content,
    memories.type,
    memories.timestamp,
    memories.embedding,
    memories.metadata,
    memories.user_id,
    memories.session_id,
    1 - (memories.embedding <=> query_embedding) as similarity
  FROM memories
  WHERE memories.embedding IS NOT NULL
    AND 1 - (memories.embedding <=> query_embedding) > match_threshold
  ORDER BY memories.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Function to get memory statistics
CREATE OR REPLACE FUNCTION get_memory_stats()
RETURNS json
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'total_memories', (SELECT count(*) FROM memories),
    'memories_with_embeddings', (SELECT count(*) FROM memories WHERE embedding IS NOT NULL),
    'memories_by_type', (
      SELECT json_object_agg(type, count)
      FROM (
        SELECT type, count(*) as count
        FROM memories
        GROUP BY type
      ) type_counts
    ),
    'oldest_memory', (SELECT min(timestamp) FROM memories),
    'newest_memory', (SELECT max(timestamp) FROM memories)
  );
$$;

-- Function to search memories by content (full-text search)
CREATE OR REPLACE FUNCTION search_memories_content(
  search_query text,
  memory_type text DEFAULT NULL,
  max_results int DEFAULT 20,
  offset_val int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  content text,
  type text,
  timestamp timestamptz,
  embedding vector(1536),
  metadata jsonb,
  user_id text,
  session_id text,
  rank float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    memories.id,
    memories.content,
    memories.type,
    memories.timestamp,
    memories.embedding,
    memories.metadata,
    memories.user_id,
    memories.session_id,
    ts_rank(to_tsvector('english', memories.content), plainto_tsquery('english', search_query)) as rank
  FROM memories
  WHERE to_tsvector('english', memories.content) @@ plainto_tsquery('english', search_query)
    AND (memory_type IS NULL OR memories.type = memory_type)
  ORDER BY rank DESC, memories.timestamp DESC
  LIMIT max_results
  OFFSET offset_val;
$$;

-- Function to get recent conversations with message counts
CREATE OR REPLACE FUNCTION get_recent_conversations(
  max_results int DEFAULT 10,
  user_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  created_at timestamptz,
  updated_at timestamptz,
  user_id text,
  metadata jsonb,
  message_count bigint,
  last_message_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.title,
    c.created_at,
    c.updated_at,
    c.user_id,
    c.metadata,
    count(m.id) as message_count,
    max(m.timestamp) as last_message_at
  FROM conversations c
  LEFT JOIN messages m ON c.id = m.conversation_id
  WHERE (user_filter IS NULL OR c.user_id = user_filter)
  GROUP BY c.id, c.title, c.created_at, c.updated_at, c.user_id, c.metadata
  ORDER BY last_message_at DESC NULLS LAST, c.updated_at DESC
  LIMIT max_results;
$$;

-- Function to cleanup old memories (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_memories(
  days_old int DEFAULT 30,
  memory_types text[] DEFAULT ARRAY['conversation']
)
RETURNS int
LANGUAGE sql
AS $$
  WITH deleted AS (
    DELETE FROM memories
    WHERE timestamp < (now() - (days_old || ' days')::interval)
      AND type = ANY(memory_types)
    RETURNING id
  )
  SELECT count(*)::int FROM deleted;
$$;

-- Create RLS (Row Level Security) policies if needed
-- Uncomment these if you want to enable user-specific access control

/*
-- Enable RLS
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy for memories - users can only access their own memories
CREATE POLICY "Users can access own memories" ON memories
FOR ALL USING (auth.uid()::text = user_id);

-- Policy for conversations - users can only access their own conversations  
CREATE POLICY "Users can access own conversations" ON conversations
FOR ALL USING (auth.uid()::text = user_id);

-- Policy for messages - users can only access messages in their conversations
CREATE POLICY "Users can access own messages" ON messages
FOR ALL USING (
  conversation_id IN (
    SELECT id FROM conversations WHERE user_id = auth.uid()::text
  )
);
*/

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memories_content_search ON memories USING gin(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_memories_embedding_cosine ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memories_user_timestamp ON memories(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp ON messages(conversation_id, timestamp DESC);

-- Trigger to automatically update conversation updated_at when messages are added
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS trigger AS $$
BEGIN
  UPDATE conversations 
  SET updated_at = NEW.timestamp 
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_message_insert
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();