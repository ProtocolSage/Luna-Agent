import { SupabaseClient } from '@supabase/supabase-js'
import supabaseManager, { Memory } from '../backend/config/supabase'
import { MemoryType, MemorySearchOptions, MemorySearchResult } from './MemoryStore'

/**
 * Enterprise-grade Supabase-powered MemoryStore
 * Features:
 * - Native vector search with pgvector
 * - Real-time sync across devices
 * - Automatic backups and scaling
 * - Full-text search capabilities
 * - Offline mode with sync
 */
export class SupabaseMemoryStore {
  private client: SupabaseClient | null = null
  private isOnline = false
  private offlineQueue: Array<{ action: string; data: any }> = []
  
  constructor() {
    this.initialize()
  }
  
  private async initialize(): Promise<void> {
    try {
      this.client = supabaseManager.getClient()
      
      if (this.client && supabaseManager.isReady()) {
        this.isOnline = await supabaseManager.testConnection()
        
        if (this.isOnline) {
          console.log('[SupabaseMemoryStore] Connected to cloud database')
          await this.processOfflineQueue()
        } else {
          console.warn('[SupabaseMemoryStore] Cloud database unavailable, running in offline mode')
        }
      } else {
        console.log('[SupabaseMemoryStore] Supabase not configured, using offline mode only')
      }
    } catch (error) {
      console.error('[SupabaseMemoryStore] Initialization failed:', error)
      this.isOnline = false
    }
  }
  
  /**
   * Add a new memory to the store
   */
  async addMemory(memory: Omit<Memory, 'id' | 'timestamp'>): Promise<Memory> {
    const id = this.generateId()
    const timestamp = new Date().toISOString()
    
    const fullMemory: Memory = {
      id,
      timestamp,
      ...memory
    }
    
    if (this.isOnline && this.client) {
      try {
        const { data, error } = await this.client
          .from('memories')
          .insert({
            id: fullMemory.id,
            content: fullMemory.content,
            type: fullMemory.type,
            timestamp: fullMemory.timestamp,
            embedding: fullMemory.embedding,
            metadata: fullMemory.metadata || {},
            user_id: fullMemory.user_id,
            session_id: fullMemory.session_id
          })
          .select()
          .single()
        
        if (error) {
          console.error('[SupabaseMemoryStore] Failed to add memory:', error)
          this.queueOfflineAction('add', fullMemory)
          throw error
        }
        
        console.log('[SupabaseMemoryStore] Memory added to cloud database')
        return this.mapSupabaseMemory(data)
      } catch (error) {
        console.error('[SupabaseMemoryStore] Add memory error:', error)
        this.queueOfflineAction('add', fullMemory)
        throw error
      }
    } else {
      // Offline mode - queue for later sync
      this.queueOfflineAction('add', fullMemory)
      console.log('[SupabaseMemoryStore] Memory queued for sync (offline mode)')
      return fullMemory
    }
  }
  
  /**
   * Update an existing memory
   */
  async updateMemory(id: string, updates: Partial<Omit<Memory, 'id' | 'timestamp'>>): Promise<Memory | null> {
    if (this.isOnline && this.client) {
      try {
        const { data, error } = await this.client
          .from('memories')
          .update({
            content: updates.content,
            type: updates.type,
            embedding: updates.embedding,
            metadata: updates.metadata,
            user_id: updates.user_id,
            session_id: updates.session_id
          })
          .eq('id', id)
          .select()
          .single()
        
        if (error) {
          console.error('[SupabaseMemoryStore] Failed to update memory:', error)
          this.queueOfflineAction('update', { id, updates })
          return null
        }
        
        return this.mapSupabaseMemory(data)
      } catch (error) {
        console.error('[SupabaseMemoryStore] Update memory error:', error)
        this.queueOfflineAction('update', { id, updates })
        return null
      }
    } else {
      this.queueOfflineAction('update', { id, updates })
      console.log('[SupabaseMemoryStore] Memory update queued for sync (offline mode)')
      return null
    }
  }
  
  /**
   * Delete a memory by ID
   */
  async deleteMemory(id: string): Promise<boolean> {
    if (this.isOnline && this.client) {
      try {
        const { error } = await this.client
          .from('memories')
          .delete()
          .eq('id', id)
        
        if (error) {
          console.error('[SupabaseMemoryStore] Failed to delete memory:', error)
          this.queueOfflineAction('delete', { id })
          return false
        }
        
        return true
      } catch (error) {
        console.error('[SupabaseMemoryStore] Delete memory error:', error)
        this.queueOfflineAction('delete', { id })
        return false
      }
    } else {
      this.queueOfflineAction('delete', { id })
      console.log('[SupabaseMemoryStore] Memory deletion queued for sync (offline mode)')
      return true // Assume success for offline queue
    }
  }
  
  /**
   * Get a specific memory by ID
   */
  async getMemoryById(id: string): Promise<Memory | null> {
    if (this.isOnline && this.client) {
      try {
        const { data, error } = await this.client
          .from('memories')
          .select('*')
          .eq('id', id)
          .single()
        
        if (error) {
          console.error('[SupabaseMemoryStore] Failed to get memory:', error)
          return null
        }
        
        return this.mapSupabaseMemory(data)
      } catch (error) {
        console.error('[SupabaseMemoryStore] Get memory error:', error)
        return null
      }
    } else {
      console.warn('[SupabaseMemoryStore] Cannot retrieve memory in offline mode')
      return null
    }
  }
  
  /**
   * Get memories by type
   */
  async getMemoriesByType(type: MemoryType, limit = 50, offset = 0): Promise<Memory[]> {
    if (this.isOnline && this.client) {
      try {
        const { data, error } = await this.client
          .from('memories')
          .select('*')
          .eq('type', type)
          .order('timestamp', { ascending: false })
          .range(offset, offset + limit - 1)
        
        if (error) {
          console.error('[SupabaseMemoryStore] Failed to get memories by type:', error)
          return []
        }
        
        return data.map(this.mapSupabaseMemory)
      } catch (error) {
        console.error('[SupabaseMemoryStore] Get memories by type error:', error)
        return []
      }
    } else {
      console.warn('[SupabaseMemoryStore] Cannot retrieve memories in offline mode')
      return []
    }
  }
  
  /**
   * Get recent memories across all types
   */
  async getRecentMemories(limit = 20, offset = 0): Promise<Memory[]> {
    if (this.isOnline && this.client) {
      try {
        const { data, error } = await this.client
          .from('memories')
          .select('*')
          .order('timestamp', { ascending: false })
          .range(offset, offset + limit - 1)
        
        if (error) {
          console.error('[SupabaseMemoryStore] Failed to get recent memories:', error)
          return []
        }
        
        return data.map(this.mapSupabaseMemory)
      } catch (error) {
        console.error('[SupabaseMemoryStore] Get recent memories error:', error)
        return []
      }
    } else {
      console.warn('[SupabaseMemoryStore] Cannot retrieve memories in offline mode')
      return []
    }
  }
  
  /**
   * Full-text search across memory content using PostgreSQL's built-in search
   */
  async searchMemories(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const { query, type, limit = 20, offset = 0, sinceTimestamp } = options
    
    if (!this.isOnline || !this.client) {
      console.warn('[SupabaseMemoryStore] Cannot search memories in offline mode')
      return []
    }
    
    try {
      let queryBuilder = this.client.from('memories').select('*')
      
      // Add full-text search
      if (query) {
        queryBuilder = queryBuilder.textSearch('content', query, {
          type: 'websearch',
          config: 'english'
        })
      }
      
      // Add type filter
      if (type) {
        queryBuilder = queryBuilder.eq('type', type)
      }
      
      // Add timestamp filter
      if (sinceTimestamp) {
        queryBuilder = queryBuilder.gte('timestamp', sinceTimestamp)
      }
      
      // Add ordering and pagination
      queryBuilder = queryBuilder
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1)
      
      const { data, error } = await queryBuilder
      
      if (error) {
        console.error('[SupabaseMemoryStore] Failed to search memories:', error)
        return []
      }
      
      return data.map(item => ({
        memory: this.mapSupabaseMemory(item),
        similarity: 1.0, // Full-text search doesn't provide similarity scores
        relevanceScore: 1.0
      }))
    } catch (error) {
      console.error('[SupabaseMemoryStore] Search memories error:', error)
      return []
    }
  }
  
  /**
   * Vector similarity search using pgvector
   */
  async vectorSearch(embedding: number[], options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    const { type, limit = 10 } = options
    
    if (!this.isOnline || !this.client) {
      console.warn('[SupabaseMemoryStore] Cannot perform vector search in offline mode')
      return []
    }
    
    try {
      // Use Supabase's RPC for vector similarity search
      let rpcQuery = this.client.rpc('match_memories', {
        query_embedding: embedding,
        match_threshold: 0.1, // Minimum similarity threshold
        match_count: limit
      })
      
      if (type) {
        rpcQuery = rpcQuery.eq('type', type)
      }
      
      const { data, error } = await rpcQuery
      
      if (error) {
        console.error('[SupabaseMemoryStore] Vector search failed:', error)
        return []
      }
      
      return data.map((item: any) => ({
        memory: this.mapSupabaseMemory(item),
        similarity: item.similarity || 0,
        relevanceScore: item.similarity || 0
      }))
    } catch (error) {
      console.error('[SupabaseMemoryStore] Vector search error:', error)
      return []
    }
  }
  
  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    totalMemories: number
    memoriesByType: Record<MemoryType, number>
    memoriesWithEmbeddings: number
    oldestMemory?: string
    newestMemory?: string
  }> {
    if (!this.isOnline || !this.client) {
      return {
        totalMemories: 0,
        memoriesByType: {
          conversation: 0,
          document: 0,
          goal: 0,
          reminder: 0,
          journal: 0,
          note: 0,
          task: 0
        },
        memoriesWithEmbeddings: 0
      }
    }
    
    try {
      // Get total count
      const { count: totalCount } = await this.client
        .from('memories')
        .select('*', { count: 'exact', head: true })
      
      // Get counts by type
      const { data: typeData } = await this.client
        .from('memories')
        .select('type')
      
      // Get embeddings count
      const { count: embeddingCount } = await this.client
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null)
      
      // Get date range
      const { data: dateRange } = await this.client
        .from('memories')
        .select('timestamp')
        .order('timestamp', { ascending: true })
        .limit(1)
      
      const { data: latestDate } = await this.client
        .from('memories')
        .select('timestamp')
        .order('timestamp', { ascending: false })
        .limit(1)
      
      // Calculate type distribution
      const memoriesByType: Record<MemoryType, number> = {
        conversation: 0,
        document: 0,
        goal: 0,
        reminder: 0,
        journal: 0,
        note: 0,
        task: 0
      }
      
      if (typeData) {
        typeData.forEach(item => {
          if (item.type && memoriesByType.hasOwnProperty(item.type)) {
            memoriesByType[item.type as MemoryType]++
          }
        })
      }
      
      return {
        totalMemories: totalCount || 0,
        memoriesByType,
        memoriesWithEmbeddings: embeddingCount || 0,
        oldestMemory: dateRange?.[0]?.timestamp,
        newestMemory: latestDate?.[0]?.timestamp
      }
    } catch (error) {
      console.error('[SupabaseMemoryStore] Get stats error:', error)
      return {
        totalMemories: 0,
        memoriesByType: {
          conversation: 0,
          document: 0,
          goal: 0,
          reminder: 0,
          journal: 0,
          note: 0,
          task: 0
        },
        memoriesWithEmbeddings: 0
      }
    }
  }
  
  /**
   * Close connection and sync offline queue
   */
  async close(): Promise<void> {
    if (this.offlineQueue.length > 0) {
      console.log(`[SupabaseMemoryStore] Syncing ${this.offlineQueue.length} offline operations...`)
      await this.processOfflineQueue()
    }
    
    console.log('[SupabaseMemoryStore] Connection closed')
  }
  
  // Private helper methods
  
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  private mapSupabaseMemory(data: any): Memory {
    return {
      id: data.id,
      content: data.content,
      type: data.type as MemoryType,
      timestamp: data.timestamp,
      embedding: data.embedding,
      metadata: data.metadata || {},
      user_id: data.user_id,
      session_id: data.session_id
    }
  }
  
  private queueOfflineAction(action: string, data: any): void {
    this.offlineQueue.push({ action, data })
    console.log(`[SupabaseMemoryStore] Queued ${action} operation for offline sync`)
  }
  
  private async processOfflineQueue(): Promise<void> {
    if (!this.isOnline || !this.client || this.offlineQueue.length === 0) {
      return
    }
    
    console.log(`[SupabaseMemoryStore] Processing ${this.offlineQueue.length} offline operations...`)
    
    const queue = [...this.offlineQueue]
    this.offlineQueue = []
    
    for (const operation of queue) {
      try {
        switch (operation.action) {
          case 'add':
            await this.addMemory(operation.data)
            break
          case 'update':
            await this.updateMemory(operation.data.id, operation.data.updates)
            break
          case 'delete':
            await this.deleteMemory(operation.data.id)
            break
        }
      } catch (error) {
        console.error(`[SupabaseMemoryStore] Failed to process offline ${operation.action}:`, error)
        // Re-queue failed operations
        this.offlineQueue.push(operation)
      }
    }
    
    if (this.offlineQueue.length === 0) {
      console.log('[SupabaseMemoryStore] All offline operations synced successfully')
    } else {
      console.warn(`[SupabaseMemoryStore] ${this.offlineQueue.length} operations failed to sync`)
    }
  }
}