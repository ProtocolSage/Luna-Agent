# Luna Agent Deployment Guide

This guide covers deploying Luna Agent in various environments, from development to production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Monitoring & Observability](#monitoring--observability)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Operating System**: Linux (Ubuntu 20.04+), macOS (10.15+), Windows 10+
- **Node.js**: 20.x or higher
- **Python**: 3.11 or higher
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 10GB free space minimum
- **Network**: Internet connection for API access

### Required Services

- **OpenAI API**: For GPT-4o model access
- **Anthropic API**: For Claude model access (optional)
- **Mistral API**: For Codestral access (optional)
- **Slack Workspace**: For Slack integration (optional)

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/luna-agent.git
cd luna-agent
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```bash
# Copy example environment file
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Model Configuration
LLM_PRIMARY=gpt-4o-202506
LLM_SECONDARY=claude-sonnet-4-20250514
LLM_CODE=codestral-2508
LLM_STT=voxtral-24b
LLM_FALLBACK_LOCAL=llama-3.1-70b

# API Keys
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
MISTRAL_API_KEY=your-mistral-key

# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# Telemetry
OTLP_ENDPOINT=http://localhost:4318/v1/traces
TELEMETRY_ENABLED=true

# Security
ENCRYPTION_KEY=your-32-character-encryption-key
MFA_REQUIRED=true

# Performance
MAX_CONCURRENT_REQUESTS=10
REQUEST_TIMEOUT_MS=30000
```

### 3. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Set up Python backend
cd luna-backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

## Local Development

### Development Mode

Start all services in development mode:

```bash
# Terminal 1: Start Electron app
npm run dev

# Terminal 2: Start Flask backend
cd luna-backend
source venv/bin/activate
python src/main.py
```

### Development Features

- **Hot Reload**: Automatic restart on code changes
- **Debug Mode**: Detailed logging and error messages
- **DevTools**: Electron DevTools for debugging
- **API Testing**: Built-in API testing interface

### Development URLs

- **Electron App**: Launches automatically
- **Flask Backend**: http://localhost:5000
- **API Documentation**: http://localhost:5000/docs
- **Health Check**: http://localhost:5000/api/agent/health

## Production Deployment

### 1. Build Application

```bash
# Build Electron app for production
npm run build

# Package for distribution
npm run package

# Build backend
cd luna-backend
source venv/bin/activate
pip freeze > requirements.txt
```

### 2. Server Setup

#### Ubuntu/Debian Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python
sudo apt install python3.11 python3.11-venv python3-pip

# Install PM2 for process management
sudo npm install -g pm2

# Create application user
sudo useradd -m -s /bin/bash luna
sudo usermod -aG sudo luna
```

#### Deploy Application

```bash
# Copy application files
sudo cp -r luna-agent /opt/
sudo chown -R luna:luna /opt/luna-agent

# Switch to application user
sudo su - luna
cd /opt/luna-agent

# Install dependencies
npm ci --production
cd luna-backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Process Management

Create PM2 ecosystem file:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "luna-backend",
      script: "src/main.py",
      cwd: "/opt/luna-agent/luna-backend",
      interpreter: "/opt/luna-agent/luna-backend/venv/bin/python",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      error_file: "/var/log/luna/backend-error.log",
      out_file: "/var/log/luna/backend-out.log",
      log_file: "/var/log/luna/backend.log",
    },
  ],
};
```

Start services:

```bash
# Create log directory
sudo mkdir -p /var/log/luna
sudo chown luna:luna /var/log/luna

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/luna-agent
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/luna-agent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL Certificate

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Docker Deployment

### 1. Docker Compose

Create `docker-compose.yml`:

```yaml
version: "3.8"

services:
  luna-backend:
    build:
      context: ./luna-backend
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/agent/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - luna-backend
    restart: unless-stopped

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

### 2. Backend Dockerfile

Create `luna-backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY config/ ./config/

# Create data directories
RUN mkdir -p data/vectors data/sessions data/telemetry logs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/agent/health || exit 1

# Run application
CMD ["python", "src/main.py"]
```

### 3. Deploy with Docker

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f luna-backend

# Scale backend
docker-compose up -d --scale luna-backend=3

# Update services
docker-compose pull
docker-compose up -d
```

## Cloud Deployment

### AWS Deployment

#### 1. EC2 Instance

```bash
# Launch EC2 instance (t3.medium or larger)
# Configure security groups:
# - HTTP (80)
# - HTTPS (443)
# - SSH (22)

# Connect and deploy
ssh -i your-key.pem ubuntu@your-instance-ip
# Follow production deployment steps
```

#### 2. ECS Deployment

Create `task-definition.json`:

```json
{
  "family": "luna-agent",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "luna-backend",
      "image": "your-account.dkr.ecr.region.amazonaws.com/luna-agent:latest",
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "OPENAI_API_KEY",
          "value": "your-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/luna-agent",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### Google Cloud Platform

#### 1. Cloud Run

```bash
# Build and push image
gcloud builds submit --tag gcr.io/your-project/luna-agent

# Deploy to Cloud Run
gcloud run deploy luna-agent \
  --image gcr.io/your-project/luna-agent \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=your-key
```

### Azure Deployment

#### 1. Container Instances

```bash
# Create resource group
az group create --name luna-agent-rg --location eastus

# Deploy container
az container create \
  --resource-group luna-agent-rg \
  --name luna-agent \
  --image your-registry/luna-agent:latest \
  --dns-name-label luna-agent \
  --ports 5000 \
  --environment-variables OPENAI_API_KEY=your-key
```

## Monitoring & Observability

### 1. Prometheus & Grafana

```yaml
# monitoring/docker-compose.yml
version: "3.8"

services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  grafana_data:
```

### 2. Application Metrics

Luna Agent exposes metrics at `/metrics`:

```bash
# View metrics
curl http://localhost:5000/metrics
```

### 3. Log Aggregation

Configure log shipping to ELK stack or similar:

```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    paths:
      - /var/log/luna/*.log
    fields:
      service: luna-agent
    fields_under_root: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

## Security Considerations

### 1. API Security

- Use HTTPS in production
- Implement rate limiting
- Validate all inputs
- Use API keys for authentication

### 2. Environment Security

```bash
# Secure file permissions
chmod 600 .env
chown luna:luna .env

# Firewall configuration
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Secrets Management

Use AWS Secrets Manager, Azure Key Vault, or similar:

```python
# Example: AWS Secrets Manager
import boto3

def get_secret(secret_name):
    client = boto3.client('secretsmanager')
    response = client.get_secret_value(SecretId=secret_name)
    return response['SecretString']
```

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

```bash
# Find process using port
sudo lsof -i :5000

# Kill process
sudo kill -9 <PID>
```

#### 2. Permission Denied

```bash
# Fix file permissions
sudo chown -R luna:luna /opt/luna-agent
chmod +x /opt/luna-agent/luna-backend/venv/bin/python
```

#### 3. Memory Issues

```bash
# Check memory usage
free -h
htop

# Increase swap if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 4. API Connection Issues

```bash
# Test API connectivity
curl -v https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check DNS resolution
nslookup api.openai.com
```

### Log Analysis

```bash
# View application logs
tail -f /var/log/luna/backend.log

# Search for errors
grep -i error /var/log/luna/backend.log

# Monitor in real-time
journalctl -u luna-agent -f
```

### Performance Tuning

#### 1. Backend Optimization

```python
# Increase worker processes
# In ecosystem.config.js
instances: 'max'  # Use all CPU cores
```

#### 2. Database Optimization

```bash
# Optimize SQLite
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 1000000;
```

#### 3. Memory Management

```bash
# Monitor memory usage
watch -n 1 'ps aux --sort=-%mem | head -20'

# Adjust Python memory limits
export PYTHONMALLOC=malloc
```

## Backup & Recovery

### 1. Data Backup

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/luna-agent"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup data
tar -czf $BACKUP_DIR/data_$DATE.tar.gz /opt/luna-agent/data
tar -czf $BACKUP_DIR/config_$DATE.tar.gz /opt/luna-agent/config

# Backup database
cp /opt/luna-agent/luna-backend/src/database/app.db $BACKUP_DIR/database_$DATE.db

# Clean old backups (keep 30 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

### 2. Automated Backups

```bash
# Add to crontab
crontab -e
# Add: 0 2 * * * /opt/luna-agent/scripts/backup.sh
```

### 3. Recovery

```bash
# Restore from backup
tar -xzf /backup/luna-agent/data_20240101_020000.tar.gz -C /
tar -xzf /backup/luna-agent/config_20240101_020000.tar.gz -C /
cp /backup/luna-agent/database_20240101_020000.db /opt/luna-agent/luna-backend/src/database/app.db

# Restart services
pm2 restart all
```

---

For additional support, consult the [Luna Agent Documentation](https://docs.luna-agent.com) or contact support@luna-agent.com.
