// agentClient.ts - Client for agent communication API
import { API_BASE } from "./apiBase";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResponse {
  response: string;
  conversationId?: string;
  context?: any;
}

/**
 * Send a chat message to the agent API
 */
export async function sendChatMessage(
  message: string,
  conversationId?: string,
): Promise<ChatResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/agent/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        conversationId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      response: data.response || data.message || "",
      conversationId: data.conversationId,
      context: data.context,
    };
  } catch (error) {
    console.error("[agentClient] Error sending chat message:", error);
    throw error;
  }
}

/**
 * Get conversation history
 */
export async function getConversationHistory(
  conversationId: string,
): Promise<ChatMessage[]> {
  try {
    const response = await fetch(
      `${API_BASE}/api/agent/conversation/${conversationId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Conversation API error: ${response.status}`);
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error("[agentClient] Error fetching conversation history:", error);
    throw error;
  }
}
