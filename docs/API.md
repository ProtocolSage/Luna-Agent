# Luna Agent API Documentation

This document provides comprehensive documentation for the Luna Agent API endpoints.

## Base URL

```
http://localhost:5000
```

## Authentication

Currently, the API uses basic authentication. In production, implement proper OAuth2 or JWT authentication.

## Agent Endpoints

### Process Request

Process a user request with the Luna agent.

**Endpoint:** `POST /api/agent/process`

**Request Body:**
```json
{
  "input": "Help me debug this TypeScript error",
  "sessionId": "user_123",
  "inputType": "text",
  "language": "en",
  "context": {
    "previousMessages": [],
    "userPreferences": {}
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "type": "response",
    "content": "I'll help you debug that TypeScript error...",
    "confidence": 0.95,
    "latencyMs": 450,
    "toolCalls": [],
    "sessionId": "user_123"
  }
}
```

### Health Check

Check the health status of the Luna agent.

**Endpoint:** `GET /api/agent/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1640995200000,
  "components": {
    "orchestrator": "healthy",
    "memory": "healthy",
    "tools": "healthy",
    "models": "healthy"
  },
  "details": {
    "uptime": 86400,
    "memoryUsage": "245MB",
    "activeConnections": 12
  }
}
```

### Get Configuration

Retrieve the current agent configuration.

**Endpoint:** `GET /api/agent/config`

**Response:**
```json
{
  "taskProfile": {
    "capabilities": ["code", "devops", "analysis"],
    "languages": ["en", "es-DO"]
  },
  "slo": {
    "latencyMs": 600,
    "availability": 0.999
  },
  "reasoning": {
    "mode": "react",
    "maxSteps": 10
  },
  "policy": {
    "pii": {"enabled": true},
    "allowlist": ["https://api.github.com"]
  }
}
```

### Get Statistics

Retrieve agent usage statistics.

**Endpoint:** `GET /api/agent/stats`

**Response:**
```json
{
  "uptime": 1640995200,
  "requests_processed": 1234,
  "average_latency_ms": 450,
  "success_rate": 0.95,
  "active_sessions": 12,
  "memory_usage": {
    "vector_store": {"documents": 5678},
    "kv_store": {"sessions": 89}
  },
  "cost_metrics": {
    "total_cost_usd": 12.34,
    "cost_per_request": 0.01
  }
}
```

### Get Sessions

Retrieve active sessions.

**Endpoint:** `GET /api/agent/sessions`

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "user_123",
      "createdAt": "2024-01-01T00:00:00Z",
      "lastActivity": "2024-01-01T12:00:00Z",
      "messageCount": 15,
      "language": "en"
    }
  ],
  "count": 1
}
```

### Clear Session

Clear a specific session from memory.

**Endpoint:** `DELETE /api/agent/sessions/{session_id}`

**Response:**
```json
{
  "success": true,
  "message": "Session user_123 cleared"
}
```

### Export Telemetry

Export telemetry data for analysis.

**Endpoint:** `GET /api/agent/telemetry/export`

**Query Parameters:**
- `format`: `json` or `csv` (default: `json`)
- `start_date`: ISO 8601 date string
- `end_date`: ISO 8601 date string

**Response:**
```json
{
  "exported_at": 1640995200000,
  "events": [
    {
      "ts": "2024-01-01T12:00:00Z",
      "sessionId": "user_123",
      "userAction": "code_debug",
      "model": "gpt-4o",
      "latencyMs": 450,
      "tokensIn": 100,
      "tokensOut": 200,
      "costUsdEst": 0.01,
      "coreConfidence": 0.95
    }
  ],
  "summary": {
    "total_events": 1000,
    "avg_latency": 450,
    "success_rate": 0.95
  }
}
```

### Run Golden Tests

Execute the golden task test suite.

**Endpoint:** `POST /api/agent/test/golden`

**Request Body:**
```json
{
  "task_ids": ["G001", "G002"],
  "task_type": "code"
}
```

**Response:**
```json
{
  "run_id": "test_1640995200",
  "total_tasks": 20,
  "passed_tasks": 18,
  "failed_tasks": 2,
  "pass_rate": 0.9,
  "average_latency": 450,
  "results": [
    {
      "taskId": "G001",
      "passed": true,
      "latencyMs": 400,
      "acceptanceCriteria": [
        {
          "criterion": "latency<600",
          "passed": true,
          "details": "Actual: 400ms, Max: 600ms"
        }
      ]
    }
  ]
}
```

## Slack Integration Endpoints

### Events Webhook

Handle Slack events (mentions, messages).

**Endpoint:** `POST /slack/events`

**Headers:**
- `X-Slack-Request-Timestamp`: Request timestamp
- `X-Slack-Signature`: Request signature

**Request Body:**
```json
{
  "type": "event_callback",
  "event": {
    "type": "app_mention",
    "text": "<@U123456> help me with TypeScript",
    "user": "U789012",
    "channel": "C345678"
  }
}
```

### Slash Commands

Handle Slack slash commands.

**Endpoint:** `POST /slack/commands`

**Form Data:**
- `command`: The slash command (e.g., `/luna`)
- `text`: Command arguments
- `user_id`: Slack user ID
- `channel_id`: Slack channel ID

**Response:**
```json
{
  "response_type": "in_channel",
  "text": "I'll help you with that TypeScript question..."
}
```

### Interactive Components

Handle Slack interactive components (buttons, modals).

**Endpoint:** `POST /slack/interactive`

**Form Data:**
- `payload`: JSON payload with interaction data

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional error details"
  }
}
```

### Common Error Codes

- `400`: Bad Request - Invalid input parameters
- `401`: Unauthorized - Authentication required
- `403`: Forbidden - Insufficient permissions
- `404`: Not Found - Resource not found
- `429`: Too Many Requests - Rate limit exceeded
- `500`: Internal Server Error - Server error
- `503`: Service Unavailable - Agent not available

## Rate Limiting

API endpoints are rate limited to prevent abuse:

- **Agent endpoints**: 100 requests per minute per IP
- **Slack endpoints**: 1000 requests per minute per workspace
- **Telemetry endpoints**: 10 requests per minute per IP

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: Window reset time (Unix timestamp)

## Webhooks

### Telemetry Webhook

Configure a webhook to receive real-time telemetry events.

**Configuration:**
```json
{
  "webhook_url": "https://your-app.com/webhooks/telemetry",
  "events": ["request_completed", "error_occurred"],
  "secret": "your_webhook_secret"
}
```

**Webhook Payload:**
```json
{
  "event_type": "request_completed",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "sessionId": "user_123",
    "latencyMs": 450,
    "success": true
  },
  "signature": "sha256=..."
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { LunaAgentClient } from '@luna/agent-sdk';

const client = new LunaAgentClient({
  baseUrl: 'http://localhost:5000',
  apiKey: 'your-api-key'
});

// Process a request
const response = await client.process({
  input: 'Help me debug this code',
  sessionId: 'user_123',
  language: 'en'
});

console.log(response.content);
```

### Python

```python
from luna_agent import LunaClient

client = LunaClient(
    base_url='http://localhost:5000',
    api_key='your-api-key'
)

# Process a request
response = client.process(
    input='Help me debug this code',
    session_id='user_123',
    language='en'
)

print(response.content)
```

### cURL

```bash
# Process a request
curl -X POST http://localhost:5000/api/agent/process \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Help me debug this code",
    "sessionId": "user_123",
    "language": "en"
  }'

# Check health
curl http://localhost:5000/api/agent/health
```

## WebSocket API

For real-time communication, Luna Agent supports WebSocket connections.

**Endpoint:** `ws://localhost:5000/ws`

### Connection

```javascript
const ws = new WebSocket('ws://localhost:5000/ws');

ws.onopen = () => {
  console.log('Connected to Luna Agent');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### Message Format

**Client to Server:**
```json
{
  "type": "process_request",
  "data": {
    "input": "Help me with TypeScript",
    "sessionId": "user_123"
  }
}
```

**Server to Client:**
```json
{
  "type": "response",
  "data": {
    "content": "I'll help you with TypeScript...",
    "confidence": 0.95,
    "sessionId": "user_123"
  }
}
```

## Changelog

### v1.0.0 (2024-01-01)
- Initial API release
- Agent processing endpoints
- Slack integration
- Telemetry export
- Golden test execution

---

For more information, visit the [Luna Agent Documentation](https://docs.luna-agent.com).

