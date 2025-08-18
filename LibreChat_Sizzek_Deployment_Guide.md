# LibreChat + Sizzek Cloud Deployment Guide
**Comprehensive Deployment Strategy for Multi-Tenant Home Agent System**

*Version: 1.0*  
*Created: December 2024*  
*Project Context: DungeonMind Infrastructure Integration*

---

## 🎯 **Deployment Overview**

This guide details the deployment of LibreChat (multi-tenant home agent) and Sizzek (SMS communication service) to a cloud server already running DungeonMind services. The strategy focuses on maintaining project independence while maximizing resource efficiency and operational simplicity for solo development.

### **Core Principles**
- **Project Autonomy**: Each system can be deployed, updated, and scaled independently
- **Resource Sharing**: Efficiently share infrastructure services (MongoDB, Redis, reverse proxy)
- **Operational Simplicity**: Minimize complexity for solo developer maintenance
- **Incremental Deployment**: Deploy and test components progressively
- **Rollback Safety**: Easy rollback if deployment issues arise

---

## 📋 **Prerequisites & Requirements**

### **Server Requirements**
```bash
# Minimum Server Specifications
CPU: 4 cores (8 recommended)
RAM: 8GB (16GB recommended) 
Storage: 100GB SSD (200GB recommended)
Network: Static IP with domain name
OS: Ubuntu 20.04+ or similar Docker-compatible Linux
```

### **Domain Setup**
```bash
# Required DNS Records
dm.yourdomain.com       -> Server IP    # DungeonMind (existing)
chat.yourdomain.com     -> Server IP    # LibreChat
sizzek.yourdomain.com   -> Server IP    # Sizzek API
admin.yourdomain.com    -> Server IP    # Admin dashboards
```

### **External Service Accounts**
- **Twilio Account**: SMS functionality for Sizzek
- **OpenAI API Key**: LLM integration for LibreChat
- **MongoDB Atlas** (optional): External database hosting
- **Cloudflare** (optional): DNS and SSL management

### **Local Development Setup**
```bash
# Required Tools
- Docker & Docker Compose
- Git
- Text editor with YAML support
- SSH access to deployment server
```

---

## 🏗️ **Deployment Architecture Strategies**

### **Strategy 1: Hybrid Separation (Recommended)**
**Best for**: Solo developers wanting balance of efficiency and maintainability

```mermaid
graph TB
    subgraph "Shared Infrastructure Layer"
        PROXY[Traefik Reverse Proxy]
        DB[MongoDB Shared]
        CACHE[Redis Shared]
        MONITORING[Prometheus/Grafana]
    end
    
    subgraph "DungeonMind Stack"
        DM_COMPOSE[docker-compose.dungeonmind.yml]
        DM_SERVICES[DM Services]
    end
    
    subgraph "LibreChat Stack" 
        LC_COMPOSE[docker-compose.librechat.yml]
        LC_APP[LibreChat App]
        SIZZEK[Sizzek Agent]
    end
    
    PROXY --> DM_SERVICES
    PROXY --> LC_APP
    PROXY --> SIZZEK
    
    DM_SERVICES --> DB
    DM_SERVICES --> CACHE
    LC_APP --> DB
    SIZZEK --> DB
    LC_APP --> CACHE
```

**Pros**: Resource efficient, clear boundaries, independent deployments  
**Cons**: Slight complexity in shared service coordination

### **Strategy 2: Complete Isolation**
**Best for**: Maximum separation, different team ownership

```yaml
# Separate everything including databases
LibreChat_Stack:
  - LibreChat App
  - Sizzek Agent  
  - MongoDB (LibreChat)
  - Redis (LibreChat)
  - Traefik (Port 8080)

DungeonMind_Stack:
  - DM Services
  - MongoDB (DungeonMind) 
  - Redis (DungeonMind)
  - Traefik (Port 80/443)
```

**Pros**: Complete isolation, no shared dependencies  
**Cons**: Higher resource usage, duplicate infrastructure

### **Strategy 3: Full Integration**
**Best for**: Unified platform approach (future consideration)

```yaml
# Single compose file for everything
Unified_Stack:
  - All DungeonMind services
  - LibreChat + Sizzek
  - Shared infrastructure
  - Unified authentication
  - Cross-service communication
```

**Pros**: Unified management, potential feature sharing  
**Cons**: High complexity, difficult rollbacks, coupling

---

## 🚀 **Implementation: Hybrid Separation Strategy**

### **Phase 1: Infrastructure Preparation**

#### **1.1 Create Project Structure**
```bash
# Server directory organization
/opt/dungeonmind-platform/
├── shared-infrastructure/
│   ├── docker-compose.infrastructure.yml
│   ├── traefik/
│   │   ├── dynamic.yml
│   │   └── acme.json
│   ├── mongodb/
│   │   └── init-scripts/
│   └── monitoring/
│       ├── prometheus.yml
│       └── grafana/
├── dungeonmind/
│   ├── docker-compose.dungeonmind.yml
│   └── [existing DM files]
├── librechat-sizzek/
│   ├── docker-compose.librechat.yml
│   ├── librechat/
│   │   ├── config/
│   │   └── data/
│   └── sizzek/
│       ├── Dockerfile
│       ├── src/
│       └── config/
├── scripts/
│   ├── deploy.sh
│   ├── backup.sh
│   └── health-check.sh
└── .env
```

#### **1.2 Shared Infrastructure Stack**
```yaml
# shared-infrastructure/docker-compose.infrastructure.yml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    container_name: shared-traefik
    restart: unless-stopped
    command:
      - --api.dashboard=true
      - --api.insecure=false
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.file.directory=/dynamic
      - --providers.file.watch=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --entrypoints.admin.address=:8080
      - --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.letsencrypt.acme.storage=/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
      - --log.level=INFO
      - --accesslog=true
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/acme.json:/acme.json
      - ./traefik/dynamic.yml:/dynamic/dynamic.yml:ro
    networks:
      - platform-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik.rule=Host(`admin.${DOMAIN}`) && PathPrefix(`/traefik`)"
      - "traefik.http.routers.traefik.entrypoints=websecure"
      - "traefik.http.routers.traefik.tls.certresolver=letsencrypt"
      - "traefik.http.routers.traefik.service=api@internal"
      - "traefik.http.middlewares.traefik-auth.basicauth.users=${TRAEFIK_AUTH}"

  mongodb:
    image: mongo:7
    container_name: shared-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
    volumes:
      - mongodb_data:/data/db
      - ./mongodb/init-scripts:/docker-entrypoint-initdb.d:ro
    ports:
      - "127.0.0.1:27017:27017"  # Only localhost access
    networks:
      - platform-network
    command: mongod --auth

  redis:
    image: redis:7-alpine
    container_name: shared-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:6379:6379"  # Only localhost access
    networks:
      - platform-network

  prometheus:
    image: prom/prometheus:latest
    container_name: shared-prometheus
    restart: unless-stopped
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
    networks:
      - platform-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.prometheus.rule=Host(`admin.${DOMAIN}`) && PathPrefix(`/prometheus`)"
      - "traefik.http.routers.prometheus.entrypoints=websecure"
      - "traefik.http.routers.prometheus.tls.certresolver=letsencrypt"

  grafana:
    image: grafana/grafana:latest
    container_name: shared-grafana
    restart: unless-stopped
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=https://admin.${DOMAIN}/grafana/
      - GF_SERVER_SERVE_FROM_SUB_PATH=true
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - platform-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.grafana.rule=Host(`admin.${DOMAIN}`) && PathPrefix(`/grafana`)"
      - "traefik.http.routers.grafana.entrypoints=websecure"
      - "traefik.http.routers.grafana.tls.certresolver=letsencrypt"

volumes:
  mongodb_data:
  redis_data:
  prometheus_data:
  grafana_data:

networks:
  platform-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

#### **1.3 MongoDB Initialization Script**
```javascript
// mongodb/init-scripts/01-create-databases.js
// This script runs when MongoDB container first starts

// Authenticate as admin
db = db.getSiblingDB('admin');

// Create LibreChat database and user
print('Creating LibreChat database and user...');
db = db.getSiblingDB('LibreChat');
db.createUser({
  user: 'librechat_user',
  pwd: 'LIBRECHAT_DB_PASSWORD_CHANGEME',
  roles: [
    { role: 'readWrite', db: 'LibreChat' }
  ]
});

// Create Sizzek database and user
print('Creating Sizzek database and user...');
db = db.getSiblingDB('Sizzek');
db.createUser({
  user: 'sizzek_user', 
  pwd: 'SIZZEK_DB_PASSWORD_CHANGEME',
  roles: [
    { role: 'readWrite', db: 'Sizzek' }
  ]
});

// Create DungeonMind database and user (if not already exists)
print('Creating DungeonMind database and user...');
db = db.getSiblingDB('DungeonMind');
db.createUser({
  user: 'dungeonmind_user',
  pwd: 'DUNGEONMIND_DB_PASSWORD_CHANGEME', 
  roles: [
    { role: 'readWrite', db: 'DungeonMind' }
  ]
});

print('Database initialization complete!');
```

### **Phase 2: LibreChat + Sizzek Stack**

#### **2.1 LibreChat + Sizzek Compose File**
```yaml
# librechat-sizzek/docker-compose.librechat.yml
version: '3.8'

services:
  librechat:
    image: ghcr.io/danny-avila/librechat:latest
    container_name: librechat-app
    restart: unless-stopped
    environment:
      # Database Configuration
      - MONGO_URI=mongodb://librechat_user:${LIBRECHAT_DB_PASSWORD}@shared-mongodb:27017/LibreChat?authSource=LibreChat
      
      # Redis Configuration  
      - REDIS_URI=redis://:${REDIS_PASSWORD}@shared-redis:6379
      
      # App Configuration
      - HOST=0.0.0.0
      - PORT=3080
      - DOMAIN_CLIENT=https://chat.${DOMAIN}
      - DOMAIN_SERVER=https://chat.${DOMAIN}
      
      # Security
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - CREDS_KEY=${CREDS_KEY}
      - CREDS_IV=${CREDS_IV}
      
      # AI Service Integration
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      
      # Features
      - ALLOW_REGISTRATION=${ALLOW_REGISTRATION:-true}
      - ALLOW_SOCIAL_LOGIN=${ALLOW_SOCIAL_LOGIN:-false}
      - ALLOW_SOCIAL_REGISTRATION=${ALLOW_SOCIAL_REGISTRATION:-false}
      
      # Sizzek Integration
      - SIZZEK_API_URL=http://sizzek-agent:8080
      - SIZZEK_API_KEY=${SIZZEK_API_KEY}
      
    volumes:
      - ./librechat/config:/app/librechat.yaml:ro
      - ./librechat/images:/app/client/public/images
      - ./librechat/logs:/app/api/logs
      - librechat_uploads:/app/client/public/images/uploads
    networks:
      - platform-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.librechat.rule=Host(`chat.${DOMAIN}`)"
      - "traefik.http.routers.librechat.entrypoints=websecure"
      - "traefik.http.routers.librechat.tls.certresolver=letsencrypt"
      - "traefik.http.services.librechat.loadbalancer.server.port=3080"
      # Security headers
      - "traefik.http.middlewares.librechat-headers.headers.customrequestheaders.X-Forwarded-Proto=https"
      - "traefik.http.routers.librechat.middlewares=librechat-headers"
    depends_on:
      - sizzek-agent
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  sizzek-agent:
    build:
      context: ./sizzek
      dockerfile: Dockerfile
    container_name: sizzek-agent
    restart: unless-stopped
    environment:
      # Database Configuration
      - MONGO_URI=mongodb://sizzek_user:${SIZZEK_DB_PASSWORD}@shared-mongodb:27017/Sizzek?authSource=Sizzek
      
      # Twilio Configuration
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
      - TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}
      
      # LibreChat Integration
      - LIBRECHAT_API_URL=http://librechat:3080
      - LIBRECHAT_API_KEY=${LIBRECHAT_API_KEY}
      
      # Service Configuration
      - PORT=8080
      - LOG_LEVEL=${SIZZEK_LOG_LEVEL:-INFO}
      - ENVIRONMENT=${ENVIRONMENT:-production}
      
      # Security
      - API_KEY=${SIZZEK_API_KEY}
      - WEBHOOK_SECRET=${SIZZEK_WEBHOOK_SECRET}
      
    volumes:
      - ./sizzek/logs:/app/logs
      - ./sizzek/data:/app/data
      - sizzek_storage:/app/storage
    networks:
      - platform-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.sizzek.rule=Host(`sizzek.${DOMAIN}`)"
      - "traefik.http.routers.sizzek.entrypoints=websecure"
      - "traefik.http.routers.sizzek.tls.certresolver=letsencrypt"
      - "traefik.http.services.sizzek.loadbalancer.server.port=8080"
      # API rate limiting
      - "traefik.http.middlewares.sizzek-ratelimit.ratelimit.burst=10"
      - "traefik.http.routers.sizzek.middlewares=sizzek-ratelimit"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  librechat_uploads:
  sizzek_storage:

networks:
  platform-network:
    external: true
```

#### **2.2 Sizzek Dockerfile**
```dockerfile
# sizzek/Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r sizzek && useradd -r -g sizzek sizzek

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY config/ ./config/

# Set ownership
RUN chown -R sizzek:sizzek /app

# Create necessary directories
RUN mkdir -p /app/logs /app/data /app/storage && \
    chown -R sizzek:sizzek /app/logs /app/data /app/storage

# Switch to non-root user
USER sizzek

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Expose port
EXPOSE 8080

# Start application
CMD ["python", "-m", "src.main"]
```

### **Phase 3: Configuration Management**

#### **3.1 Environment Variables**
```bash
# .env - Place in project root
# ========================================
# DOMAIN CONFIGURATION
# ========================================
DOMAIN=yourdomain.com
ACME_EMAIL=you@yourdomain.com

# ========================================
# AUTHENTICATION & SECURITY
# ========================================
# Generate with: openssl rand -base64 32
JWT_SECRET=your-super-secure-jwt-secret-here
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-here
CREDS_KEY=your-32-character-encryption-key
CREDS_IV=your-16-character-iv-here

# Basic auth for Traefik dashboard (htpasswd format)
# Generate with: htpasswd -nb admin your-password
TRAEFIK_AUTH=admin:$$2y$$10$$hashed-password-here

# ========================================
# DATABASE CONFIGURATION
# ========================================
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=your-super-secure-mongo-password

# Application-specific database passwords
LIBRECHAT_DB_PASSWORD=librechat-secure-password
SIZZEK_DB_PASSWORD=sizzek-secure-password  
DUNGEONMIND_DB_PASSWORD=dungeonmind-secure-password

# Redis password
REDIS_PASSWORD=your-redis-password

# ========================================
# LIBRECHAT CONFIGURATION
# ========================================
ALLOW_REGISTRATION=false
ALLOW_SOCIAL_LOGIN=false
ALLOW_SOCIAL_REGISTRATION=false

# API Keys for AI services
OPENAI_API_KEY=sk-your-openai-api-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
GOOGLE_API_KEY=your-google-api-key

# LibreChat API key for Sizzek integration
LIBRECHAT_API_KEY=lc-your-internal-api-key

# ========================================
# SIZZEK CONFIGURATION
# ========================================
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Sizzek API configuration
SIZZEK_API_KEY=szk-your-sizzek-api-key
SIZZEK_WEBHOOK_SECRET=your-webhook-secret
SIZZEK_LOG_LEVEL=INFO

# ========================================
# MONITORING
# ========================================
GRAFANA_PASSWORD=your-grafana-admin-password

# ========================================
# DEPLOYMENT ENVIRONMENT
# ========================================
ENVIRONMENT=production
```

#### **3.2 LibreChat Configuration**
```yaml
# librechat/config/librechat.yaml
version: 1.0.5

cache: true

endpoints:
  openAI:
    apiKey: "${OPENAI_API_KEY}"
    models:
      default: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"]
    titleConvo: true
    titleModel: "gpt-3.5-turbo"
    summarize: false
    summaryModel: "gpt-3.5-turbo"
    forcePrompt: false
    modelDisplayLabel: "OpenAI"

  anthropic:
    apiKey: "${ANTHROPIC_API_KEY}"
    models:
      default: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"]
    modelDisplayLabel: "Anthropic"

  custom:
    - name: "Sizzek Agent"
      apiKey: "${SIZZEK_API_KEY}"
      baseURL: "http://sizzek-agent:8080/api/v1"
      models:
        default: ["sizzek-agent"]
      titleConvo: true
      titleModel: "sizzek-agent"
      modelDisplayLabel: "Sizzek"

registration:
  socialLogins: ["google", "github"]
  
speech:
  tts:
    openai:
      apiKey: "${OPENAI_API_KEY}"
      model: "tts-1"
      voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
  stt:
    openai:
      apiKey: "${OPENAI_API_KEY}"
      model: "whisper-1"

fileConfig:
  endpoints:
    openAI:
      fileLimit: 20
      fileSizeLimit: 10  # MB
      totalSizeLimit: 50  # MB
      supportedMimeTypes:
        - "image/jpeg"
        - "image/png"
        - "image/gif"
        - "image/webp"
        - "text/plain"
        - "application/pdf"

rateLimits:
  login:
    max: 5
    windowMs: 900000  # 15 minutes
  register:
    max: 3
    windowMs: 3600000  # 1 hour
  fileUploads:
    max: 10
    windowMs: 3600000  # 1 hour
  conversationsImport:
    max: 5
    windowMs: 3600000  # 1 hour
```

### **Phase 4: Deployment Scripts**

#### **4.1 Main Deployment Script**
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

# Configuration
PROJECT_ROOT="/opt/dungeonmind-platform"
LOG_FILE="/var/log/platform-deployment.log"
BACKUP_DIR="/opt/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

# Pre-deployment checks
pre_deployment_checks() {
    log "🔍 Running pre-deployment checks..."
    
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root or with sudo"
    fi
    
    # Check if Docker is running
    if ! systemctl is-active --quiet docker; then
        error "Docker is not running. Please start Docker first."
    fi
    
    # Check available disk space (at least 5GB)
    available_space=$(df / | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 5242880 ]]; then  # 5GB in KB
        warn "Less than 5GB disk space available. Consider cleaning up."
    fi
    
    # Check if .env file exists
    if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        error ".env file not found at $PROJECT_ROOT/.env"
    fi
    
    # Validate required environment variables
    source "$PROJECT_ROOT/.env"
    required_vars=("DOMAIN" "MONGO_ROOT_PASSWORD" "REDIS_PASSWORD" "TWILIO_ACCOUNT_SID")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            error "Required environment variable $var is not set"
        fi
    done
    
    log "✅ Pre-deployment checks passed"
}

# Backup existing data
backup_data() {
    log "📦 Creating backup before deployment..."
    
    mkdir -p "$BACKUP_DIR"
    backup_timestamp=$(date +%Y%m%d_%H%M%S)
    backup_path="$BACKUP_DIR/pre_deployment_$backup_timestamp"
    
    # Backup MongoDB if it exists
    if docker ps | grep -q shared-mongodb; then
        log "Backing up MongoDB..."
        docker exec shared-mongodb mongodump --out /tmp/backup_$backup_timestamp
        docker cp shared-mongodb:/tmp/backup_$backup_timestamp "$backup_path/mongodb"
    fi
    
    # Backup application data volumes
    if docker volume ls | grep -q dungeonmind; then
        log "Backing up application volumes..."
        mkdir -p "$backup_path/volumes"
        for volume in $(docker volume ls --format "{{.Name}}" | grep -E "(dungeonmind|librechat|sizzek)"); do
            docker run --rm -v "$volume":/data -v "$backup_path/volumes":/backup alpine tar czf "/backup/$volume.tar.gz" /data
        done
    fi
    
    log "✅ Backup completed: $backup_path"
}

# Deploy infrastructure
deploy_infrastructure() {
    log "🏗️ Deploying shared infrastructure..."
    
    cd "$PROJECT_ROOT/shared-infrastructure"
    
    # Create networks if they don't exist
    docker network create platform-network 2>/dev/null || true
    
    # Deploy infrastructure services
    docker-compose -f docker-compose.infrastructure.yml up -d
    
    # Wait for MongoDB to be ready
    log "⏳ Waiting for MongoDB to be ready..."
    max_attempts=30
    attempt=0
    while ! docker exec shared-mongodb mongosh --quiet --eval 'db.runCommand("ping").ok' > /dev/null 2>&1; do
        if [[ $attempt -ge $max_attempts ]]; then
            error "MongoDB failed to start within expected time"
        fi
        sleep 2
        ((attempt++))
    done
    
    # Wait for Redis to be ready
    log "⏳ Waiting for Redis to be ready..."
    max_attempts=15
    attempt=0
    while ! docker exec shared-redis redis-cli -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; do
        if [[ $attempt -ge $max_attempts ]]; then
            error "Redis failed to start within expected time"
        fi
        sleep 2
        ((attempt++))
    done
    
    log "✅ Infrastructure deployment completed"
}

# Deploy LibreChat + Sizzek
deploy_librechat_sizzek() {
    log "💬 Deploying LibreChat + Sizzek stack..."
    
    cd "$PROJECT_ROOT/librechat-sizzek"
    
    # Build Sizzek image
    log "🔨 Building Sizzek image..."
    docker-compose -f docker-compose.librechat.yml build sizzek-agent
    
    # Deploy services
    docker-compose -f docker-compose.librechat.yml up -d
    
    # Health check for services
    log "🏥 Performing health checks..."
    services=("librechat-app" "sizzek-agent")
    for service in "${services[@]}"; do
        max_attempts=30
        attempt=0
        while ! docker exec "$service" curl -f http://localhost:$(docker port "$service" | cut -d: -f2)/health > /dev/null 2>&1; do
            if [[ $attempt -ge $max_attempts ]]; then
                warn "Health check failed for $service, but continuing..."
                break
            fi
            sleep 5
            ((attempt++))
        done
    done
    
    log "✅ LibreChat + Sizzek deployment completed"
}

# Update DungeonMind configuration
update_dungeonmind() {
    log "🎲 Updating DungeonMind configuration..."
    
    cd "$PROJECT_ROOT/dungeonmind"
    
    # Update compose file to use shared infrastructure
    # This would involve modifying the existing compose file
    # to point to shared-mongodb and shared-redis
    
    # Restart DungeonMind services with new configuration
    docker-compose -f docker-compose.dungeonmind.yml down
    docker-compose -f docker-compose.dungeonmind.yml up -d
    
    log "✅ DungeonMind configuration updated"
}

# Post-deployment verification
post_deployment_verification() {
    log "🔍 Running post-deployment verification..."
    
    # Check all containers are running
    failed_containers=()
    expected_containers=("shared-traefik" "shared-mongodb" "shared-redis" "librechat-app" "sizzek-agent")
    
    for container in "${expected_containers[@]}"; do
        if ! docker ps | grep -q "$container"; then
            failed_containers+=("$container")
        fi
    done
    
    if [[ ${#failed_containers[@]} -gt 0 ]]; then
        warn "The following containers are not running: ${failed_containers[*]}"
    else
        log "✅ All expected containers are running"
    fi
    
    # Test external connectivity
    log "🌐 Testing external connectivity..."
    if curl -f -s "https://chat.$DOMAIN" > /dev/null; then
        log "✅ LibreChat is accessible"
    else
        warn "LibreChat is not accessible at https://chat.$DOMAIN"
    fi
    
    if curl -f -s "https://sizzek.$DOMAIN/health" > /dev/null; then
        log "✅ Sizzek is accessible"
    else
        warn "Sizzek is not accessible at https://sizzek.$DOMAIN"
    fi
    
    log "✅ Post-deployment verification completed"
}

# Main deployment flow
main() {
    log "🚀 Starting LibreChat + Sizzek deployment..."
    
    pre_deployment_checks
    backup_data
    deploy_infrastructure
    deploy_librechat_sizzek
    # update_dungeonmind  # Uncomment when ready to integrate
    post_deployment_verification
    
    log "🎉 Deployment completed successfully!"
    log ""
    log "📋 Access Information:"
    log "  LibreChat: https://chat.$DOMAIN"
    log "  Sizzek API: https://sizzek.$DOMAIN"
    log "  Admin Dashboard: https://admin.$DOMAIN"
    log "  Traefik Dashboard: https://admin.$DOMAIN/traefik"
    log "  Grafana: https://admin.$DOMAIN/grafana"
    log ""
    log "📝 Next Steps:"
    log "  1. Test LibreChat functionality"
    log "  2. Configure Sizzek SMS integration"
    log "  3. Set up monitoring alerts"
    log "  4. Configure backup schedule"
}

# Handle script interruption
trap 'error "Deployment interrupted by user"' INT TERM

# Run main function
main "$@"
```

#### **4.2 Health Check Script**
```bash
#!/bin/bash
# scripts/health-check.sh

set -e

# Configuration
PROJECT_ROOT="/opt/dungeonmind-platform"
LOG_FILE="/var/log/platform-health.log"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load environment
source "$PROJECT_ROOT/.env"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

# Health check functions
check_containers() {
    log "🔍 Checking container health..."
    
    containers=("shared-traefik" "shared-mongodb" "shared-redis" "librechat-app" "sizzek-agent")
    unhealthy_containers=()
    
    for container in "${containers[@]}"; do
        if docker ps --filter "name=$container" --filter "status=running" | grep -q "$container"; then
            # Check if container has health check
            if docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy\|starting"; then
                log "✅ $container is healthy"
            else
                # Container is running but no health check or unhealthy
                health_status=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no-healthcheck")
                if [[ "$health_status" == "unhealthy" ]]; then
                    unhealthy_containers+=("$container")
                    error "❌ $container is unhealthy"
                else
                    log "⚠️ $container is running (no health check)"
                fi
            fi
        else
            unhealthy_containers+=("$container")
            error "❌ $container is not running"
        fi
    done
    
    return ${#unhealthy_containers[@]}
}

check_external_endpoints() {
    log "🌐 Checking external endpoints..."
    
    endpoints=(
        "https://chat.$DOMAIN:LibreChat"
        "https://sizzek.$DOMAIN/health:Sizzek Health"
        "https://admin.$DOMAIN/traefik:Traefik Dashboard"
    )
    
    failed_endpoints=()
    
    for endpoint_info in "${endpoints[@]}"; do
        IFS=':' read -r url name <<< "$endpoint_info"
        
        if curl -f -s --max-time 10 "$url" > /dev/null 2>&1; then
            log "✅ $name is accessible"
        else
            failed_endpoints+=("$name")
            error "❌ $name is not accessible at $url"
        fi
    done
    
    return ${#failed_endpoints[@]}
}

check_database_connectivity() {
    log "🗄️ Checking database connectivity..."
    
    # MongoDB check
    if docker exec shared-mongodb mongosh --quiet --eval 'db.runCommand("ping").ok' > /dev/null 2>&1; then
        log "✅ MongoDB is responsive"
        
        # Check database sizes
        db_info=$(docker exec shared-mongodb mongosh --quiet --eval 'JSON.stringify(db.adminCommand("listDatabases"))' 2>/dev/null)
        if [[ -n "$db_info" ]]; then
            log "📊 Database status: OK"
        fi
    else
        error "❌ MongoDB is not responsive"
        return 1
    fi
    
    # Redis check
    if docker exec shared-redis redis-cli -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
        log "✅ Redis is responsive"
        
        # Check Redis info
        redis_info=$(docker exec shared-redis redis-cli -a "$REDIS_PASSWORD" info server | grep redis_version)
        log "📊 Redis status: $redis_info"
    else
        error "❌ Redis is not responsive"
        return 1
    fi
    
    return 0
}

check_disk_space() {
    log "💾 Checking disk space..."
    
    # Check root filesystem
    root_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $root_usage -gt 85 ]]; then
        warn "Root filesystem is ${root_usage}% full"
    else
        log "✅ Root filesystem usage: ${root_usage}%"
    fi
    
    # Check Docker space
    docker_usage=$(docker system df --format "table {{.Type}}\t{{.Size}}\t{{.Reclaimable}}" | grep -v TYPE)
    if [[ -n "$docker_usage" ]]; then
        log "📊 Docker space usage:"
        echo "$docker_usage" | while read line; do
            log "   $line"
        done
    fi
}

check_resource_usage() {
    log "📈 Checking resource usage..."
    
    # Memory usage
    memory_info=$(free -h | grep Mem)
    log "💾 Memory: $memory_info"
    
    # Load average
    load_avg=$(uptime | awk -F'load average:' '{print $2}')
    log "⚡ Load average:$load_avg"
    
    # Docker container resource usage
    container_stats=$(docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}")
    log "🐳 Container resource usage:"
    echo "$container_stats" | while read line; do
        log "   $line"
    done
}

generate_health_report() {
    log "📋 Generating health report..."
    
    report_file="/tmp/platform-health-$(date +%Y%m%d_%H%M%S).txt"
    
    {
        echo "# Platform Health Report"
        echo "Generated: $(date)"
        echo ""
        echo "## Container Status"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        echo "## System Resources"
        free -h
        echo ""
        df -h
        echo ""
        echo "## Recent Logs"
        tail -20 "$LOG_FILE"
    } > "$report_file"
    
    log "📄 Health report saved to: $report_file"
}

# Main health check
main() {
    log "🏥 Starting platform health check..."
    
    exit_code=0
    
    check_containers || exit_code=1
    check_external_endpoints || exit_code=1
    check_database_connectivity || exit_code=1
    check_disk_space
    check_resource_usage
    generate_health_report
    
    if [[ $exit_code -eq 0 ]]; then
        log "✅ All health checks passed"
    else
        warn "⚠️ Some health checks failed - review the logs"
    fi
    
    return $exit_code
}

main "$@"
```

### Quickstart: Invite-Only Initial Deploy (Short-Term)

This minimal configuration lets you host LibreChat on the server without keeping your personal computer on, while tightly controlling access. No public signups; you manually provision users.

#### 1) Configure invite-only auth

Add to LibreChat environment (either `.env` or the compose service `environment:`):

```env
ALLOW_REGISTRATION=false
ALLOW_SOCIAL_LOGIN=false
ALLOW_SOCIAL_REGISTRATION=false
REQUIRE_EMAIL_VERIFICATION=true
```

If using Docker Compose, for the LibreChat service:

```yaml
environment:
  - ALLOW_REGISTRATION=false
  - ALLOW_SOCIAL_LOGIN=false
  - ALLOW_SOCIAL_REGISTRATION=false
  - REQUIRE_EMAIL_VERIFICATION=true
```

Restart LibreChat after changing these.

#### 2) Create users manually (admin and invited users)

Run inside the LibreChat container (service name may be `librechat` or `api`):

```bash
docker compose exec librechat npm run create-user
# or
docker compose exec api npm run create-user
```

Follow prompts (email, password, role). Use role `admin` for your own account.

#### 3) Optional edge hardening

Block the public register endpoint at the proxy to prevent accidental exposure:

```nginx
location = /api/auth/register { deny all; }
```

You can remove this later if you implement an internal provisioning path.

#### 4) Notes
- Keep login open but rely on strong passwords and rate limiting already configured in this guide.
- You can add users as needed via the `create-user` script.

---

### Future Exploration: SMS OTP Onboarding (Brainstorm)

Leverage Sizzek (SMS) as a controlled onboarding gate while keeping LibreChat registration disabled publicly.

- High-level flow
  - Admin adds phone + email in Sizzek (allowlist entry created: pending).
  - Sizzek calls an internal provisioning endpoint to create a LibreChat user (temp password or reset token).
  - Sizzek sends SMS with a one-time login link or OTP + password setup link.
  - First login forces password change; user marked active in Sizzek.

- Components
  - Sizzek: admin UI (allowlist), OTP service, SMS sender, provisioning job.
  - LibreChat: registration disabled; internal-only provisioning endpoint (or helper service alongside LibreChat) to create users and issue reset tokens.
  - Redis: short-lived OTP storage (TTL ~5 min) and attempt counters.

- API sketch (internal/private)

```http
POST /internal/provision-user
Auth: Bearer <SERVICE_KEY>
Body: { "email": "user@example.com", "name": "User", "phone": "+1..." }
→ 201 { "userId": "...", "passwordResetUrl": "https://chat.example.com/reset?token=..." }

POST /auth/otp/request
Body: { "phone": "+1..." }
→ 200 { "sent": true }

POST /auth/otp/verify
Body: { "phone": "+1...", "otp": "123456" }
→ 200 { "verified": true, "session": "..." }
```

- Minimal data model (Sizzek)

```json
{
  "AllowlistedUser": {
    "phone": "+15555555555",
    "email": "user@example.com",
    "name": "User",
    "status": "pending|provisioned|active|revoked",
    "createdAt": 1730000000,
    "notes": "invited by admin@example.com"
  },
  "OtpCode": {
    "phone": "+15555555555",
    "code": "123456",
    "expiresAt": 1730000300,
    "attempts": 0
  }
}
```

- Security considerations
  - Keep `/api/auth/register` blocked publicly; provisioning must be server-to-server with a secret.
  - Rate-limit OTP requests and verifications; lock out after N attempts.
  - Rotate service keys; log and alert on failures and anomalies.
  - Do not store OTPs in plaintext at rest beyond TTL; prefer hashed + TTL in Redis.
  - Always force password change on first login if using temp passwords.

- Nginx rules for later

```nginx
location = /api/auth/register {
  allow 172.20.0.0/16;  # internal docker network
  allow 127.0.0.1;
  deny all;
  proxy_pass http://localhost:3080;
}
```

- Open questions
  - Does LibreChat expose an admin API to create users and generate reset links? If not, add a tiny internal helper next to it.
  - Choose OTP length/TTL and resend limits (e.g., 6 digits, 5 min, max 3 resends per hour).

---

### **Phase 5: Nginx Configuration & Security**

#### **5.1 Nginx Reverse Proxy Setup**

```nginx
# /etc/nginx/sites-available/dungeonmind-platform
server {
    listen 80;
    server_name chat.yourdomain.com sizzek.yourdomain.com dm.yourdomain.com admin.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name chat.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/chat.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Rate Limiting (Balanced for legitimate users)
limit_req_zone $binary_remote_addr zone=librechat:10m rate=20r/s;
limit_req zone=librechat burst=50 nodelay;
    
    # Smart Bot Protection (Allow legitimate bots, block malicious ones)
if ($http_user_agent ~* (bot|crawler|spider|scraper)) {
    # Allow legitimate bots
    if ($http_user_agent ~* (googlebot|bingbot|slurp|duckduckbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegram)) {
        # Allow these bots
    }
    # Block others
    else {
        return 403;
    }
}
    
    # Block common attack patterns
    if ($request_uri ~* "\.(php|asp|aspx|jsp|cgi)$") {
        return 404;
    }
    
    # LibreChat Application
    location / {
        proxy_pass http://localhost:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        
        # WebSocket support
        proxy_set_header Sec-WebSocket-Extensions $http_sec_websocket_extensions;
        proxy_set_header Sec-WebSocket-Key $http_sec_websocket_key;
        proxy_set_header Sec-WebSocket-Version $http_sec_websocket_version;
    }
    
    # API Rate Limiting
    location /api/ {
        limit_req zone=librechat burst=5 nodelay;
        proxy_pass http://localhost:3080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Health Check (internal only)
    location /health {
        allow 127.0.0.1;
        deny all;
        proxy_pass http://localhost:3080;
    }
}

server {
    listen 443 ssl http2;
    server_name sizzek.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/sizzek.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sizzek.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Rate Limiting for API
    limit_req_zone $binary_remote_addr zone=sizzek:10m rate=5r/s;
    limit_req zone=sizzek burst=10 nodelay;
    
    # Sizzek API
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30;
        proxy_send_timeout 30;
    }
    
    # Health Check (public)
    location /health {
        proxy_pass http://localhost:8080;
        access_log off;
    }
}

server {
    listen 443 ssl http2;
    server_name admin.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/admin.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Basic Auth for Admin Access
    auth_basic "Admin Area";
    auth_basic_user_file /etc/nginx/.htpasswd;
    
    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # IP Whitelist (optional)
    allow 127.0.0.1;
    allow YOUR_IP_ADDRESS;
    deny all;
    
    # Admin Dashboards
    location /traefik {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /grafana {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /prometheus {
        proxy_pass http://localhost:9090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### **5.2 LibreChat Security Configuration**

```yaml
# librechat/config/librechat.yaml
version: 1.0.5

# Security Settings
registration:
  enabled: true  # Allow public registration
  socialLogins: ["google", "github"]  # Enable social logins for convenience
  requireEmailVerification: true  # Require email verification
  requireApproval: false  # Set to true if you want manual approval
  
# Rate Limiting
rateLimits:
  login:
    max: 10  # Allow more login attempts
    windowMs: 900000  # 15 minutes
  register:
    max: 3  # Allow registration but limit attempts
    windowMs: 3600000  # 1 hour
  fileUploads:
    max: 10
    windowMs: 3600000  # 1 hour
  conversationsImport:
    max: 5
    windowMs: 3600000  # 1 hour
  api:
    max: 100
    windowMs: 900000  # 15 minutes

# Access Control
accessControl:
  allowedDomains: ["yourdomain.com"]  # Restrict to your domain
  # Remove IP restrictions to allow global access
  # allowedIPs: []  # Commented out to allow all IPs
  
# Session Security
session:
  secret: "${JWT_SECRET}"
  cookie:
    secure: true
    httpOnly: true
    sameSite: "strict"
    maxAge: 86400000  # 24 hours

# API Security
api:
  cors:
    origin: ["https://chat.yourdomain.com", "https://yourdomain.com"]
    credentials: true
  rateLimit:
    windowMs: 900000  # 15 minutes
    max: 200  # Increased for legitimate users

# File Upload Security
fileConfig:
  endpoints:
    openAI:
      fileLimit: 10  # Allow more files for legitimate use
      fileSizeLimit: 10  # 10MB max per file
      totalSizeLimit: 50  # 50MB total
      supportedMimeTypes:
        - "image/jpeg"
        - "image/png"
        - "image/gif"
        - "image/webp"
        - "text/plain"
        - "application/pdf"

# Logging
logging:
  level: "info"
  format: "json"
  file: "/app/logs/librechat.log"

# User Management
userManagement:
  # Email verification settings
  emailVerification:
    required: true
    expiryHours: 24
  
  # Account settings
  accountSettings:
    allowProfileUpdates: true
    allowPasswordChanges: true
    requireCurrentPassword: true
  
  # Session management
  sessions:
    maxConcurrentSessions: 3
    sessionTimeoutHours: 24
    rememberMeDays: 30
  
  # Content moderation
  moderation:
    enableContentFiltering: true
    enableUserReporting: true
    autoModerationThreshold: 0.8

#### **5.3 Fail2ban Configuration**

```bash
# /etc/fail2ban/jail.local
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5

[librechat]
enabled = true
filter = librechat
logpath = /opt/dungeonmind-platform/librechat-sizzek/librechat/logs/librechat.log
maxretry = 5
bantime = 7200

[sizzek]
enabled = true
filter = sizzek
logpath = /opt/dungeonmind-platform/librechat-sizzek/sizzek/logs/sizzek.log
maxretry = 3
bantime = 3600
```

```bash
# /etc/fail2ban/filter.d/librechat.conf
[Definition]
failregex = ^.*Failed login attempt for user: <HOST>.*$
ignoreregex =
```

```bash
# /etc/fail2ban/filter.d/sizzek.conf
[Definition]
failregex = ^.*Failed API request from <HOST>.*$
ignoreregex =
```

#### **5.4 User Management & Security Considerations**

```bash
#!/bin/bash
# scripts/setup-user-management.sh

set -e

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Setup email service for verification
setup_email_service() {
    log "📧 Setting up email service for user verification..."
    
    # Install postfix for email sending
    apt-get update
    apt-get install -y postfix mailutils
    
    # Configure postfix for your domain
    cat > /etc/postfix/main.cf << EOF
# Basic configuration
myhostname = mail.yourdomain.com
mydomain = yourdomain.com
myorigin = \$mydomain
inet_interfaces = all
inet_protocols = ipv4
mydestination = \$myhostname, localhost.\$mydomain, localhost, \$mydomain
mynetworks = 127.0.0.0/8
home_mailbox = Maildir/
smtpd_banner = \$myhostname ESMTP \$mail_name
EOF
    
    systemctl enable postfix
    systemctl restart postfix
    
    log "✅ Email service configured"
}

# Setup admin user
setup_admin_user() {
    log "👤 Setting up admin user..."
    
    # Create admin user in LibreChat
    curl -X POST "https://chat.yourdomain.com/api/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "admin",
            "email": "admin@yourdomain.com",
            "password": "your-secure-admin-password",
            "role": "admin"
        }'
    
    log "✅ Admin user created"
}

# Setup monitoring for user activity
setup_user_monitoring() {
    log "📊 Setting up user activity monitoring..."
    
    # Create monitoring script
    cat > /opt/dungeonmind-platform/scripts/monitor-users.sh << 'EOF'
#!/bin/bash

# Monitor user registrations
echo "=== User Registration Report ==="
grep "User registered" /opt/dungeonmind-platform/librechat-sizzek/librechat/logs/librechat.log | tail -10

# Monitor failed login attempts
echo "=== Failed Login Attempts ==="
grep "Failed login" /opt/dungeonmind-platform/librechat-sizzek/librechat/logs/librechat.log | tail -10

# Monitor API usage
echo "=== API Usage Report ==="
grep "API request" /opt/dungeonmind-platform/librechat-sizzek/librechat/logs/librechat.log | tail -10
EOF
    
    chmod +x /opt/dungeonmind-platform/scripts/monitor-users.sh
    
    # Add to crontab for daily reports
    echo "0 9 * * * /opt/dungeonmind-platform/scripts/monitor-users.sh | mail -s 'LibreChat User Activity Report' admin@yourdomain.com" | crontab -
    
    log "✅ User monitoring configured"
}

# Setup backup for user data
setup_user_backup() {
    log "💾 Setting up user data backup..."
    
    # Create backup script
    cat > /opt/dungeonmind-platform/scripts/backup-users.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/backups/users"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup user data from MongoDB
mongodump --host localhost --port 27017 \
    --db LibreChat \
    --collection users \
    --out "$BACKUP_DIR/users_$DATE"

# Backup conversations (optional)
mongodump --host localhost --port 27017 \
    --db LibreChat \
    --collection conversations \
    --out "$BACKUP_DIR/conversations_$DATE"

# Compress backup
tar -czf "$BACKUP_DIR/users_backup_$DATE.tar.gz" -C "$BACKUP_DIR" "users_$DATE" "conversations_$DATE"

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "users_backup_*.tar.gz" -mtime +7 -delete

echo "User backup completed: $DATE"
EOF
    
    chmod +x /opt/dungeonmind-platform/scripts/backup-users.sh
    
    # Add to crontab for daily backups
    echo "0 2 * * * /opt/dungeonmind-platform/scripts/backup-users.sh" | crontab -
    
    log "✅ User backup configured"
}

main() {
    log "👥 Setting up user management..."
    
    setup_email_service
    setup_admin_user
    setup_user_monitoring
    setup_user_backup
    
    log "✅ User management setup completed!"
}

main "$@"
```

#### **5.5 Security Best Practices for Public Access**

```bash
# Additional security measures for public LibreChat instance

# 1. Regular security updates
apt-get update && apt-get upgrade -y

# 2. Monitor for suspicious activity
cat > /opt/dungeonmind-platform/scripts/security-monitor.sh << 'EOF'
#!/bin/bash

# Check for failed login attempts
failed_logins=$(grep "Failed login" /opt/dungeonmind-platform/librechat-sizzek/librechat/logs/librechat.log | wc -l)

if [ "$failed_logins" -gt 10 ]; then
    echo "WARNING: High number of failed login attempts detected: $failed_logins"
    # Send alert email
    echo "Security alert: $failed_logins failed login attempts" | mail -s "LibreChat Security Alert" admin@yourdomain.com
fi

# Check for unusual API usage
api_requests=$(grep "API request" /opt/dungeonmind-platform/librechat-sizzek/librechat/logs/librechat.log | wc -l)

if [ "$api_requests" -gt 1000 ]; then
    echo "WARNING: High API usage detected: $api_requests requests"
    # Send alert email
    echo "Security alert: $api_requests API requests" | mail -s "LibreChat Security Alert" admin@yourdomain.com
fi

# Check disk space
disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')

if [ "$disk_usage" -gt 80 ]; then
    echo "WARNING: High disk usage: ${disk_usage}%"
    # Send alert email
    echo "System alert: ${disk_usage}% disk usage" | mail -s "LibreChat System Alert" admin@yourdomain.com
fi
EOF

chmod +x /opt/dungeonmind-platform/scripts/security-monitor.sh

# Add to crontab for hourly monitoring
echo "0 * * * * /opt/dungeonmind-platform/scripts/security-monitor.sh" | crontab -
```

#### **5.6 SSL Certificate Setup**

```bash
#!/bin/bash
# scripts/setup-ssl.sh

set -e

DOMAIN="yourdomain.com"
EMAIL="you@yourdomain.com"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Install certbot
install_certbot() {
    log "📦 Installing certbot..."
    
    if ! command -v certbot &> /dev/null; then
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
    fi
}

# Generate SSL certificates
generate_certificates() {
    log "🔐 Generating SSL certificates..."
    
    # Create certificates for each subdomain
    domains=("chat.$DOMAIN" "sizzek.$DOMAIN" "admin.$DOMAIN" "dm.$DOMAIN")
    
    for domain in "${domains[@]}"; do
        log "Generating certificate for $domain"
        
        certbot certonly \
            --nginx \
            --non-interactive \
            --agree-tos \
            --email "$EMAIL" \
            --domains "$domain" \
            --expand
    done
}

# Setup auto-renewal
setup_auto_renewal() {
    log "🔄 Setting up auto-renewal..."
    
    # Create renewal script
    cat > /etc/cron.daily/certbot-renew << 'EOF'
#!/bin/bash
certbot renew --quiet --nginx
systemctl reload nginx
EOF
    
    chmod +x /etc/cron.daily/certbot-renew
    
    # Test renewal
    certbot renew --dry-run
}

# Create nginx configuration
setup_nginx() {
    log "🌐 Setting up nginx configuration..."
    
    # Copy configuration
    cp /opt/dungeonmind-platform/nginx/dungeonmind-platform /etc/nginx/sites-available/
    
    # Enable site
    ln -sf /etc/nginx/sites-available/dungeonmind-platform /etc/nginx/sites-enabled/
    
    # Create htpasswd for admin area
    htpasswd -c /etc/nginx/.htpasswd admin
    
    # Test configuration
    nginx -t
    
    # Reload nginx
    systemctl reload nginx
}

main() {
    log "🔐 Starting SSL and nginx setup..."
    
    install_certbot
    generate_certificates
    setup_auto_renewal
    setup_nginx
    
    log "✅ SSL and nginx setup completed!"
}

main "$@"
```

### **Phase 6: Custom Package Publishing**

#### **6.1 MCP Data Package Publishing**

```bash
#!/bin/bash
# scripts/publish-mcp-data.sh

set -e

PACKAGE_NAME="@dungeonmind/mcp-data"
PACKAGE_DIR="/path/to/your/mcp-data-package"
NPM_REGISTRY="https://registry.npmjs.org/"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Pre-publish checks
pre_publish_checks() {
    log "🔍 Running pre-publish checks..."
    
    cd "$PACKAGE_DIR"
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        error "package.json not found in $PACKAGE_DIR"
    fi
    
    # Check if logged into npm
    if ! npm whoami &> /dev/null; then
        error "Not logged into npm. Run 'npm login' first."
    fi
    
    # Check for uncommitted changes
    if [[ -d ".git" ]] && ! git diff-index --quiet HEAD --; then
        warn "⚠️ Uncommitted changes detected. Consider committing before publishing."
    fi
    
    # Run tests
    if npm test; then
        log "✅ Tests passed"
    else
        error "❌ Tests failed"
    fi
    
    # Build package
    if npm run build; then
        log "✅ Build successful"
    else
        error "❌ Build failed"
    fi
}

# Update version
update_version() {
    log "📦 Updating package version..."
    
    cd "$PACKAGE_DIR"
    
    # Get current version
    current_version=$(npm version --json | jq -r '.["$PACKAGE_NAME"]')
    log "Current version: $current_version"
    
    # Prompt for new version
    read -p "Enter new version (patch/minor/major): " version_type
    
    case $version_type in
        patch|minor|major)
            npm version $version_type
            new_version=$(npm version --json | jq -r '.["$PACKAGE_NAME"]')
            log "New version: $new_version"
            ;;
        *)
            error "Invalid version type. Use patch, minor, or major."
            ;;
    esac
}

# Publish package
publish_package() {
    log "🚀 Publishing package to npm..."
    
    cd "$PACKAGE_DIR"
    
    # Publish to npm
    if npm publish --access public; then
        log "✅ Package published successfully"
    else
        error "❌ Package publication failed"
    fi
}

# Verify publication
verify_publication() {
    log "🔍 Verifying publication..."
    
    # Wait a moment for npm to update
    sleep 10
    
    # Check if package is available
    if npm view "$PACKAGE_NAME" version &> /dev/null; then
        published_version=$(npm view "$PACKAGE_NAME" version)
        log "✅ Package published: $PACKAGE_NAME@$published_version"
    else
        error "❌ Package not found on npm"
    fi
}

# Update deployment configuration
update_deployment_config() {
    log "🔧 Updating deployment configuration..."
    
    # Update package.json in deployment
    cd /opt/dungeonmind-platform/librechat-sizzek
    
    # Update mcp-data dependency
    npm install "$PACKAGE_NAME@latest" --save
    
    log "✅ Deployment configuration updated"
}

main() {
    log "📦 Starting MCP data package publication..."
    
    pre_publish_checks
    update_version
    publish_package
    verify_publication
    update_deployment_config
    
    log "🎉 Package publication completed!"
}

main "$@"
```

#### **6.2 Web UI Framework Package Publishing**

```bash
#!/bin/bash
# scripts/publish-web-ui-framework.sh

set -e

PACKAGE_NAME="@dungeonmind/web-ui-framework"
PACKAGE_DIR="/path/to/your/web-ui-framework-package"
NPM_REGISTRY="https://registry.npmjs.org/"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Pre-publish checks
pre_publish_checks() {
    log "🔍 Running pre-publish checks..."
    
    cd "$PACKAGE_DIR"
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        error "package.json not found in $PACKAGE_DIR"
    fi
    
    # Check if logged into npm
    if ! npm whoami &> /dev/null; then
        error "Not logged into npm. Run 'npm login' first."
    fi
    
    # Check for uncommitted changes
    if [[ -d ".git" ]] && ! git diff-index --quiet HEAD --; then
        warn "⚠️ Uncommitted changes detected. Consider committing before publishing."
    fi
    
    # Run linting
    if npm run lint; then
        log "✅ Linting passed"
    else
        error "❌ Linting failed"
    fi
    
    # Run tests
    if npm test; then
        log "✅ Tests passed"
    else
        error "❌ Tests failed"
    fi
    
    # Build package
    if npm run build; then
        log "✅ Build successful"
    else
        error "❌ Build failed"
    fi
}

# Update version
update_version() {
    log "📦 Updating package version..."
    
    cd "$PACKAGE_DIR"
    
    # Get current version
    current_version=$(npm version --json | jq -r '.["$PACKAGE_NAME"]')
    log "Current version: $current_version"
    
    # Prompt for new version
    read -p "Enter new version (patch/minor/major): " version_type
    
    case $version_type in
        patch|minor|major)
            npm version $version_type
            new_version=$(npm version --json | jq -r '.["$PACKAGE_NAME"]')
            log "New version: $new_version"
            ;;
        *)
            error "Invalid version type. Use patch, minor, or major."
            ;;
    esac
}

# Publish package
publish_package() {
    log "🚀 Publishing package to npm..."
    
    cd "$PACKAGE_DIR"
    
    # Publish to npm
    if npm publish --access public; then
        log "✅ Package published successfully"
    else
        error "❌ Package publication failed"
    fi
}

# Verify publication
verify_publication() {
    log "🔍 Verifying publication..."
    
    # Wait a moment for npm to update
    sleep 10
    
    # Check if package is available
    if npm view "$PACKAGE_NAME" version &> /dev/null; then
        published_version=$(npm view "$PACKAGE_NAME" version)
        log "✅ Package published: $PACKAGE_NAME@$published_version"
    else
        error "❌ Package not found on npm"
    fi
}

# Update deployment configuration
update_deployment_config() {
    log "🔧 Updating deployment configuration..."
    
    # Update package.json in deployment
    cd /opt/dungeonmind-platform/librechat-sizzek
    
    # Update web-ui-framework dependency
    npm install "$PACKAGE_NAME@latest" --save
    
    log "✅ Deployment configuration updated"
}

main() {
    log "📦 Starting web UI framework package publication..."
    
    pre_publish_checks
    update_version
    publish_package
    verify_publication
    update_deployment_config
    
    log "🎉 Package publication completed!"
}

main "$@"
```

#### **6.3 Package.json Template for Custom Packages**

```json
{
  "name": "@dungeonmind/mcp-data",
  "version": "1.0.0",
  "description": "MCP data utilities for DungeonMind platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/**/*",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "prepublishOnly": "npm run build && npm test",
    "version": "git add -A src",
    "postversion": "git push && git push --tags"
  },
  "keywords": [
    "mcp",
    "dungeonmind",
    "data",
    "utilities"
  ],
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/dungeonmind-mcp-data.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/dungeonmind-mcp-data/issues"
  },
  "homepage": "https://github.com/yourusername/dungeonmind-mcp-data#readme",
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "typescript": "^5.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

### **Phase 7: Monitoring & Alerting**
```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "rules/*.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'traefik'
    static_configs:
      - targets: ['shared-traefik:8080']
    metrics_path: /metrics

  - job_name: 'librechat'
    static_configs:
      - targets: ['librechat-app:3080']
    metrics_path: /api/metrics
    scrape_interval: 30s

  - job_name: 'sizzek'
    static_configs:
      - targets: ['sizzek-agent:8080']
    metrics_path: /metrics
    scrape_interval: 30s

  - job_name: 'mongodb-exporter'
    static_configs:
      - targets: ['mongodb-exporter:9216']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

---

## 🔧 **Troubleshooting Guide**

### **Common Issues & Solutions**

#### **Container Startup Issues**
```bash
# Check container logs
docker logs librechat-app --tail 50
docker logs sizzek-agent --tail 50

# Check network connectivity
docker exec librechat-app ping shared-mongodb
docker exec sizzek-agent curl -f http://librechat:3080/health

# Restart individual services
docker-compose -f docker-compose.librechat.yml restart librechat
```

#### **Database Connection Issues**
```bash
# Test MongoDB connection
docker exec shared-mongodb mongosh --eval 'db.runCommand("ping")'

# Check MongoDB users
docker exec shared-mongodb mongosh --eval 'db.getUsers()'

# Test application database access
docker exec librechat-app mongosh "mongodb://librechat_user:password@shared-mongodb:27017/LibreChat"
```

#### **LibreChat MongoDB Container Dependency Issues**
```bash
# CRITICAL: LibreChat failing with ECONNREFUSED 127.0.0.1:27017
# Root Cause: MongoDB container not running when LibreChat starts

# Quick Fix: Start required containers
cd ~/projects/External-Endpoint
docker-compose up -d mongodb meilisearch vectordb

# Verify all containers are running
docker-compose ps

# Check LibreChat connection string
# When running outside Docker: mongodb://localhost:27017/LibreChat
# When running in Docker: mongodb://mongodb:27017/LibreChat

# Required container dependencies for LibreChat:
# - chat-mongodb (MongoDB)
# - chat-meilisearch (Meilisearch)
# - vectordb (PostgreSQL with pgvector)
# - rag_api (LibreChat RAG API)

# Always check container status first when LibreChat fails to start
```

#### **MCP Environment Management Issues**
```bash
# Problem: MCP servers have inconsistent .env configurations
# Solution: Use centralized deployment script

# Deploy all MCP .env files to remote server
./scripts/deploy-mcp-envs.sh

# Manual deployment (if needed)
scp ./mcp-servers/todoodles/.env alan@srv586875:~/projects/Sizzek/mcp-servers/todoodles/

# Verify deployment
ssh alan@srv586875 "find ~/projects/Sizzek/mcp-servers -name '.env' -exec ls -la {} \;"

# Check MCP server environment variables
ssh alan@srv586875 "cd ~/projects/Sizzek/mcp-servers/todoodles && printenv | grep -E '^MONGODB_|^MCP_STORAGE_TYPE'"

# Restart MCP servers after .env changes
ssh alan@srv586875 "cd ~/projects/Sizzek/mcp-servers/todoodles && npm restart"

# Expected MCP server configurations:
# - memory: MONGODB_DATABASE=mcp_data, MONGODB_COLLECTION=user_memory
# - movies: MONGODB_DATABASE=mcp_data, MONGODB_COLLECTION=user_movies
# - grocery-list: MONGODB_DATABASE=mcp_data, MONGODB_COLLECTION=user_groceries
# - todoodles: MONGODB_DATABASE=mcp_data, MONGODB_COLLECTION=user_todoodles
# - scheduled-tasks: MONGODB_DATABASE=LibreChat, MONGODB_COLLECTION=scheduled_tasks
# - twilio-sms: MONGODB_DATABASE=LibreChat, MONGODB_COLLECTION=users
```
```

#### **SSL/Domain Issues**
```bash
# Check Traefik configuration
docker logs shared-traefik --tail 50

# Verify SSL certificates
docker exec shared-traefik cat /acme.json | jq '.letsencrypt.Certificates'

# Test domain resolution
nslookup chat.yourdomain.com
curl -I https://chat.yourdomain.com
```

#### **Performance Issues**
```bash
# Check resource usage
docker stats

# Monitor MongoDB performance
docker exec shared-mongodb mongosh --eval 'db.serverStatus()'

# Check Redis memory usage
docker exec shared-redis redis-cli -a password info memory
```

---

## 🔧 **MCP Environment Management**

### **Overview**

The MCP (Model Context Protocol) servers require consistent environment configuration across all instances. This section covers the centralized environment management system that ensures all MCP servers use the correct MongoDB connection strings and storage configurations.

## 🔒 **MCP Ephemeral Web UI Security**

### **Overview**

The MCP ephemeral web UI system provides secure, temporary web interfaces for MCP server functionality. This section covers the security measures and monitoring for the ephemeral web UI system.

### **Security Architecture**

#### **Current Security Measures**

- **Token-Based Authentication**: Each ephemeral web UI uses a unique UUID token
- **Session Isolation**: Each user gets their own isolated session with 30-minute expiration
- **Multi-Tenant Architecture**: Users cannot access each other's data
- **Port Range Limitation**: Ephemeral UIs use ports 11000-12000 (1000 ports)
- **Temporary Nature**: Ephemeral UIs are designed to be temporary

#### **Firewall Configuration**

```bash
# Open port range for ephemeral web UIs
sudo ufw allow 11000:12000/tcp

# Verify the rule is active
sudo ufw status | grep "11000:12000"
```

#### **MCP Server Port Range Configuration**

Each MCP server with web UI support must be configured with the correct port range:

```bash
# Environment variables for ephemeral web UI port range
MCP_WEB_UI_PORT_MIN=11000
MCP_WEB_UI_PORT_MAX=12000
```

**Important**: The port range in the MCP server configuration must match the firewall rules. The MCP servers will only allocate ports within this range for ephemeral web UIs.

#### **Security Monitoring**

```bash
# Run security monitoring script
./scripts/monitor-ephemeral-ports.sh

# Set up automated monitoring (add to crontab)
# Run every 5 minutes
*/5 * * * * /path/to/scripts/monitor-ephemeral-ports.sh
```

#### **Recommended Security Enhancements**

1. **Rate Limiting**: Implement per-IP rate limiting on ephemeral ports
2. **Access Logging**: Monitor access attempts and failed token validations
3. **Port Scanning Protection**: Monitor for port scanning attempts
4. **Session Cleanup**: Ensure expired sessions are properly cleaned up
5. **Alert System**: Set up email alerts for suspicious activity

### **URL Structure**

Ephemeral web UIs are accessed via:
```
https://sizzek.dungeonmind.net:{random-port}/?token={uuid}
```

Example: `https://sizzek.dungeonmind.net:11889/?token=80f28135-0253-41f5-a5d8-8d1f34e344d1`

### **Troubleshooting Security Issues**

#### **Common Issues**

1. **Port Not Accessible**: Check firewall rules with `sudo ufw status`
2. **Token Expired**: Tokens expire after 30 minutes, generate new session
3. **High Connection Attempts**: Monitor with security script for potential attacks
4. **Session Isolation**: Verify users cannot access each other's data

#### **Security Monitoring Commands**

```bash
# Check active ephemeral servers
netstat -tlnp | grep -E ":(11[0-9]{3}|12[0-9]{3})"

# Monitor connection patterns
netstat -an | grep -E ":(11[0-9]{3}|12[0-9]{3})" | awk '{print $5}' | cut -d: -f1 | sort | uniq -c

# Check firewall status
sudo ufw status | grep "11000:12000"
```

### **Centralized Environment Deployment**

#### **Automated Deployment Script**

```bash
# Deploy all MCP .env files to remote server
./scripts/deploy-mcp-envs.sh

# Script automatically:
# - Finds all .env files in ./mcp-servers/
# - Creates remote directories if needed
# - Copies .env files to corresponding remote locations
# - Verifies deployment success
```

#### **Manual Deployment (if needed)**

```bash
# Deploy individual MCP server .env files
scp ./mcp-servers/todoodles/.env alan@srv586875:~/projects/Sizzek/mcp-servers/todoodles/
scp ./mcp-servers/memory/.env alan@srv586875:~/projects/Sizzek/mcp-servers/memory/
scp ./mcp-servers/grocery-list/.env alan@srv586875:~/projects/Sizzek/mcp-servers/grocery-list/

# Verify deployment
ssh alan@srv586875 "find ~/projects/Sizzek/mcp-servers -name '.env' -exec ls -la {} \;"
```

### **MCP Server Configuration Standards**

#### **Expected Environment Variables**

Each MCP server should have the following configuration in its `.env` file:

```bash
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/mcp_data
MONGODB_DATABASE=mcp_data
MCP_STORAGE_TYPE=mongodb

# Server-specific collection
MONGODB_COLLECTION=user_[service_name]

# Logging
LOG_LEVEL=info
```

#### **Server-Specific Configurations**

| MCP Server | Database | Collection | Purpose |
|------------|----------|------------|---------|
| `memory` | `mcp_data` | `user_memory` | User memory entities |
| `movies` | `mcp_data` | `user_movies` | Movie preferences |
| `grocery-list` | `mcp_data` | `user_groceries` | Shopping lists |
| `todoodles` | `mcp_data` | `user_todoodles` | Todo items |
| `scheduled-tasks` | `LibreChat` | `scheduled_tasks` | Scheduled notifications |
| `twilio-sms` | `LibreChat` | `users` | User management |
| `google-calendar-mcp` | `mcp_data` | `user_calendar` | Calendar integration |

### **Integration with Build Process**

The environment deployment is integrated into the MCP build process:

```bash
# Build all MCP servers and deploy environments
./scripts/build-all-mcps.sh

# This automatically runs:
# 1. Build each MCP server
# 2. Deploy .env files using deploy-mcp-envs.sh
# 3. Verify deployment success
```

### **Troubleshooting MCP Environment Issues**

#### **Common Issues and Solutions**

1. **MCP server can't access MongoDB data**
   ```bash
   # Check .env file exists and has correct configuration
   ssh alan@srv586875 "cat ~/projects/Sizzek/mcp-servers/todoodles/.env"
   
   # Verify MongoDB connection
   ssh alan@srv586875 "cd ~/projects/Sizzek/mcp-servers/todoodles && node -e \"console.log(process.env.MONGODB_URI)\""
   
   # Restart MCP server after .env changes
   ssh alan@srv586875 "cd ~/projects/Sizzek/mcp-servers/todoodles && npm restart"
   ```

2. **Configuration drift between servers**
   ```bash
   # Redeploy all .env files
   ./scripts/deploy-mcp-envs.sh
   
   # Verify all servers have consistent configuration
   ssh alan@srv586875 "find ~/projects/Sizzek/mcp-servers -name '.env' -exec grep -H 'MONGODB_URI' {} \;"
   ```

3. **MCP server using wrong storage type**
   ```bash
   # Check storage type configuration
   ssh alan@srv586875 "grep -r 'MCP_STORAGE_TYPE' ~/projects/Sizzek/mcp-servers/*/.env"
   
   # Should show: MCP_STORAGE_TYPE=mongodb for all servers
   ```

### **Best Practices**

1. **Always use the deployment script** instead of manual .env file management
2. **Verify deployment** after any environment changes
3. **Restart MCP servers** after .env file updates
4. **Keep local .env files** as the source of truth
5. **Version control** the deployment script but not the .env files themselves

---

## 📊 **Monitoring & Maintenance**

### **Daily Checks**
- [ ] Run health check script
- [ ] Review application logs
- [ ] Check disk space usage
- [ ] Verify backup completion

### **Weekly Tasks**
- [ ] Update container images
- [ ] Review security alerts
- [ ] Analyze performance metrics
- [ ] Test disaster recovery procedures

### **Monthly Tasks**
- [ ] Security audit
- [ ] Capacity planning review
- [ ] Documentation updates
- [ ] Dependency updates

---

## 🚀 **Next Steps After Deployment**

1. **Initial Testing**
   - [ ] Create LibreChat user account
   - [ ] Test AI chat functionality
   - [ ] Verify Sizzek SMS integration
   - [ ] Test cross-service communication

2. **Security Hardening**
   - [ ] Configure fail2ban
   - [ ] Set up automated backups
   - [ ] Enable log rotation
   - [ ] Configure monitoring alerts

3. **Integration Development**
   - [ ] Develop LibreChat ↔ Sizzek communication
   - [ ] Implement user management sync
   - [ ] Create shared authentication
   - [ ] Build admin interface

4. **Future Enhancements**
   - [ ] Multi-tenant user isolation
   - [ ] Advanced monitoring dashboards
   - [ ] Automated scaling
   - [ ] CI/CD pipeline integration

---

## 📊 **Data Migration Strategy**

### **MongoDB Migration Overview**

Moving your local MongoDB data to the server requires careful planning to ensure data integrity and minimal downtime. This section covers multiple migration strategies depending on your current setup and requirements.

#### **Migration Strategy Decision Tree**

```mermaid
graph TD
    A[Current Setup?] --> B{Local MongoDB?}
    B -->|Yes| C[Local MongoDB Migration]
    B -->|No| D[External MongoDB Migration]
    
    C --> E{Data Size?}
    E -->|Small < 1GB| F[Direct Export/Import]
    E -->|Large > 1GB| G[Incremental Migration]
    
    D --> H{Service Type?}
    H -->|MongoDB Atlas| I[Atlas Migration]
    H -->|Other Cloud| J[External Service Migration]
    
    F --> K[Export/Import Scripts]
    G --> L[Incremental Migration Scripts]
    I --> M[Atlas Migration Tools]
    J --> N[Service-Specific Migration]
```

### **Strategy 1: Local MongoDB Migration (Recommended for Development)**

#### **1.1 Pre-Migration Assessment**

```bash
#!/bin/bash
# scripts/assess-migration.sh

echo "🔍 Assessing MongoDB migration requirements..."

# Check if local MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    echo "❌ Local MongoDB is not running"
    exit 1
fi

# Get database sizes
echo "📊 Database sizes:"
mongo --quiet --eval "
db.adminCommand('listDatabases').databases.forEach(function(db) {
    print(db.name + ': ' + (db.sizeOnDisk / 1024 / 1024).toFixed(2) + ' MB');
});
"

# Count collections and documents
echo "📋 Collection counts:"
mongo --quiet --eval "
db.adminCommand('listDatabases').databases.forEach(function(dbName) {
    if (dbName.name !== 'admin' && dbName.name !== 'local') {
        print('\nDatabase: ' + dbName.name);
        db = db.getSiblingDB(dbName.name);
        db.getCollectionNames().forEach(function(collName) {
            var count = db.getCollection(collName).count();
            print('  ' + collName + ': ' + count + ' documents');
        });
    }
});
"

# Check for indexes
echo "🔍 Index information:"
mongo --quiet --eval "
db.adminCommand('listDatabases').databases.forEach(function(dbName) {
    if (dbName.name !== 'admin' && dbName.name !== 'local') {
        print('\nDatabase: ' + dbName.name);
        db = db.getSiblingDB(dbName.name);
        db.getCollectionNames().forEach(function(collName) {
            var indexes = db.getCollection(collName).getIndexes();
            print('  ' + collName + ': ' + indexes.length + ' indexes');
        });
    }
});
"
```

#### **1.2 Direct Export/Import (Small Datasets < 1GB)**

```bash
#!/bin/bash
# scripts/migrate-local-mongodb.sh

set -e

# Configuration
LOCAL_MONGO_HOST="localhost"
LOCAL_MONGO_PORT="27017"
LOCAL_MONGO_USER=""
LOCAL_MONGO_PASS=""

REMOTE_MONGO_HOST="your-server-ip"
REMOTE_MONGO_PORT="27017"
REMOTE_MONGO_USER="admin"
REMOTE_MONGO_PASS="your-secure-password"

BACKUP_DIR="/tmp/mongodb-migration"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Pre-migration checks
pre_migration_checks() {
    log "🔍 Running pre-migration checks..."
    
    # Check if local MongoDB is accessible
    if ! mongo --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --eval "db.runCommand('ping')" > /dev/null 2>&1; then
        error "Cannot connect to local MongoDB at $LOCAL_MONGO_HOST:$LOCAL_MONGO_PORT"
    fi
    
    # Check if remote MongoDB is accessible
    if ! mongo --host "$REMOTE_MONGO_HOST" --port "$REMOTE_MONGO_PORT" -u "$REMOTE_MONGO_USER" -p "$REMOTE_MONGO_PASS" --authenticationDatabase admin --eval "db.runCommand('ping')" > /dev/null 2>&1; then
        error "Cannot connect to remote MongoDB at $REMOTE_MONGO_HOST:$REMOTE_MONGO_PORT"
    fi
    
    # Check available disk space
    local_space=$(df /tmp | awk 'NR==2 {print $4}')
    if [[ $local_space -lt 1048576 ]]; then  # 1GB in KB
        warn "Less than 1GB available space in /tmp. Consider using different backup location."
    fi
    
    log "✅ Pre-migration checks passed"
}

# Export databases
export_databases() {
    log "📦 Exporting databases from local MongoDB..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Get list of databases to migrate
    databases=$(mongo --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "
        db.adminCommand('listDatabases').databases
            .filter(function(db) { return !['admin', 'local', 'config'].includes(db.name); })
            .map(function(db) { return db.name; })
            .join(' ');
    ")
    
    if [[ -z "$databases" ]]; then
        warn "No user databases found to migrate"
        return
    fi
    
    log "Found databases to migrate: $databases"
    
    for db in $databases; do
        log "Exporting database: $db"
        
        # Export database
        mongodump \
            --host "$LOCAL_MONGO_HOST" \
            --port "$LOCAL_MONGO_PORT" \
            --db "$db" \
            --out "$BACKUP_DIR" \
            --gzip
        
        if [[ $? -eq 0 ]]; then
            log "✅ Successfully exported $db"
        else
            error "Failed to export database $db"
        fi
    done
    
    log "✅ All databases exported to $BACKUP_DIR"
}

# Import databases
import_databases() {
    log "📥 Importing databases to remote MongoDB..."
    
    # Create application users if they don't exist
    log "Creating application users..."
    
    mongo --host "$REMOTE_MONGO_HOST" --port "$REMOTE_MONGO_PORT" -u "$REMOTE_MONGO_USER" -p "$REMOTE_MONGO_PASS" --authenticationDatabase admin --eval "
        // Create LibreChat user
        db = db.getSiblingDB('LibreChat');
        if (!db.getUser('librechat_user')) {
            db.createUser({
                user: 'librechat_user',
                pwd: '$LIBRECHAT_DB_PASSWORD',
                roles: [{ role: 'readWrite', db: 'LibreChat' }]
            });
        }
        
        // Create Sizzek user
        db = db.getSiblingDB('Sizzek');
        if (!db.getUser('sizzek_user')) {
            db.createUser({
                user: 'sizzek_user',
                pwd: '$SIZZEK_DB_PASSWORD',
                roles: [{ role: 'readWrite', db: 'Sizzek' }]
            });
        }
        
        // Create DungeonMind user
        db = db.getSiblingDB('DungeonMind');
        if (!db.getUser('dungeonmind_user')) {
            db.createUser({
                user: 'dungeonmind_user',
                pwd: '$DUNGEONMIND_DB_PASSWORD',
                roles: [{ role: 'readWrite', db: 'DungeonMind' }]
            });
        }
    "
    
    # Import each database
    for db_dir in "$BACKUP_DIR"/*/; do
        if [[ -d "$db_dir" ]]; then
            db_name=$(basename "$db_dir")
            log "Importing database: $db_name"
            
            mongorestore \
                --host "$REMOTE_MONGO_HOST" \
                --port "$REMOTE_MONGO_PORT" \
                -u "$REMOTE_MONGO_USER" \
                -p "$REMOTE_MONGO_PASS" \
                --authenticationDatabase admin \
                --db "$db_name" \
                --dir "$db_dir" \
                --gzip \
                --drop
            
            if [[ $? -eq 0 ]]; then
                log "✅ Successfully imported $db_name"
            else
                error "Failed to import database $db_name"
            fi
        fi
    done
    
    log "✅ All databases imported successfully"
}

# Verify migration
verify_migration() {
    log "🔍 Verifying migration..."
    
    # Check database counts
    local_count=$(mongo --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "
        db.adminCommand('listDatabases').databases
            .filter(function(db) { return !['admin', 'local', 'config'].includes(db.name); })
            .length;
    ")
    
    remote_count=$(mongo --host "$REMOTE_MONGO_HOST" --port "$REMOTE_MONGO_PORT" -u "$REMOTE_MONGO_USER" -p "$REMOTE_MONGO_PASS" --authenticationDatabase admin --quiet --eval "
        db.adminCommand('listDatabases').databases
            .filter(function(db) { return !['admin', 'local', 'config'].includes(db.name); })
            .length;
    ")
    
    if [[ "$local_count" == "$remote_count" ]]; then
        log "✅ Database count matches: $local_count databases"
    else
        warn "⚠️ Database count mismatch: Local=$local_count, Remote=$remote_count"
    fi
    
    # Check document counts for key collections
    log "📊 Document count verification:"
    
    mongo --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "
        db.adminCommand('listDatabases').databases.forEach(function(dbInfo) {
            if (!['admin', 'local', 'config'].includes(dbInfo.name)) {
                print('\nDatabase: ' + dbInfo.name);
                db = db.getSiblingDB(dbInfo.name);
                db.getCollectionNames().forEach(function(collName) {
                    var count = db.getCollection(collName).count();
                    print('  ' + collName + ': ' + count + ' documents');
                });
            }
        });
    " > /tmp/local_counts.txt
    
    mongo --host "$REMOTE_MONGO_HOST" --port "$REMOTE_MONGO_PORT" -u "$REMOTE_MONGO_USER" -p "$REMOTE_MONGO_PASS" --authenticationDatabase admin --quiet --eval "
        db.adminCommand('listDatabases').databases.forEach(function(dbInfo) {
            if (!['admin', 'local', 'config'].includes(dbInfo.name)) {
                print('\nDatabase: ' + dbInfo.name);
                db = db.getSiblingDB(dbInfo.name);
                db.getCollectionNames().forEach(function(collName) {
                    var count = db.getCollection(collName).count();
                    print('  ' + collName + ': ' + count + ' documents');
                });
            }
        });
    " > /tmp/remote_counts.txt
    
    if diff /tmp/local_counts.txt /tmp/remote_counts.txt > /dev/null; then
        log "✅ Document counts match between local and remote"
    else
        warn "⚠️ Document count differences detected. Check /tmp/local_counts.txt and /tmp/remote_counts.txt"
    fi
}

# Cleanup
cleanup() {
    log "🧹 Cleaning up temporary files..."
    rm -rf "$BACKUP_DIR"
    rm -f /tmp/local_counts.txt /tmp/remote_counts.txt
    log "✅ Cleanup completed"
}

# Main migration function
main() {
    log "🚀 Starting MongoDB migration from local to remote..."
    
    pre_migration_checks
    export_databases
    import_databases
    verify_migration
    cleanup
    
    log "🎉 Migration completed successfully!"
    log ""
    log "📋 Migration Summary:"
    log "  Source: $LOCAL_MONGO_HOST:$LOCAL_MONGO_PORT"
    log "  Destination: $REMOTE_MONGO_HOST:$REMOTE_MONGO_PORT"
    log "  Backup location: $BACKUP_DIR"
    log ""
    log "📝 Next Steps:"
    log "  1. Update application configurations to point to remote MongoDB"
    log "  2. Test application connectivity to remote database"
    log "  3. Monitor application logs for any connection issues"
    log "  4. Consider setting up automated backups for the remote database"
}

# Handle script interruption
trap 'error "Migration interrupted by user"' INT TERM

# Run main function
main "$@"
```

#### **1.3 Incremental Migration (Large Datasets > 1GB)**

```bash
#!/bin/bash
# scripts/incremental-migration.sh

set -e

# Configuration
LOCAL_MONGO_HOST="localhost"
LOCAL_MONGO_PORT="27017"
REMOTE_MONGO_HOST="your-server-ip"
REMOTE_MONGO_PORT="27017"
REMOTE_MONGO_USER="admin"
REMOTE_MONGO_PASS="your-secure-password"

BATCH_SIZE=1000
SLEEP_INTERVAL=5

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Get collection statistics
get_collection_stats() {
    local db_name="$1"
    local collection_name="$2"
    
    mongo --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "
        db = db.getSiblingDB('$db_name');
        print(db.getCollection('$collection_name').count());
    "
}

# Migrate collection in batches
migrate_collection_batches() {
    local db_name="$1"
    local collection_name="$2"
    local total_docs="$3"
    
    local processed=0
    local batch_num=1
    
    while [[ $processed -lt $total_docs ]]; do
        local batch_size=$((BATCH_SIZE))
        if [[ $((processed + BATCH_SIZE)) -gt $total_docs ]]; then
            batch_size=$((total_docs - processed))
        fi
        
        log "Migrating batch $batch_num for $db_name.$collection_name ($processed/$total_docs)"
        
        # Export batch
        mongoexport \
            --host "$LOCAL_MONGO_HOST" \
            --port "$LOCAL_MONGO_PORT" \
            --db "$db_name" \
            --collection "$collection_name" \
            --skip "$processed" \
            --limit "$batch_size" \
            --out "/tmp/batch_${db_name}_${collection_name}_${batch_num}.json"
        
        # Import batch
        mongoimport \
            --host "$REMOTE_MONGO_HOST" \
            --port "$REMOTE_MONGO_PORT" \
            -u "$REMOTE_MONGO_USER" \
            -p "$REMOTE_MONGO_PASS" \
            --authenticationDatabase admin \
            --db "$db_name" \
            --collection "$collection_name" \
            --file "/tmp/batch_${db_name}_${collection_name}_${batch_num}.json"
        
        processed=$((processed + batch_size))
        batch_num=$((batch_num + 1))
        
        # Cleanup batch file
        rm -f "/tmp/batch_${db_name}_${collection_name}_${batch_num}.json"
        
        # Sleep to prevent overwhelming the server
        sleep $SLEEP_INTERVAL
    done
    
    log "✅ Completed migration of $db_name.$collection_name"
}

# Main incremental migration
main() {
    log "🚀 Starting incremental MongoDB migration..."
    
    # Get list of databases
    databases=$(mongo --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "
        db.adminCommand('listDatabases').databases
            .filter(function(db) { return !['admin', 'local', 'config'].includes(db.name); })
            .map(function(db) { return db.name; })
            .join(' ');
    ")
    
    for db in $databases; do
        log "Processing database: $db"
        
        # Get collections in database
        collections=$(mongo --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "
            db = db.getSiblingDB('$db');
            db.getCollectionNames().join(' ');
        ")
        
        for collection in $collections; do
            total_docs=$(get_collection_stats "$db" "$collection")
            
            if [[ $total_docs -gt $BATCH_SIZE ]]; then
                log "Large collection detected: $db.$collection ($total_docs documents)"
                migrate_collection_batches "$db" "$collection" "$total_docs"
            else
                log "Small collection: $db.$collection ($total_docs documents)"
                # Use regular export/import for small collections
                mongoexport \
                    --host "$LOCAL_MONGO_HOST" \
                    --port "$LOCAL_MONGO_PORT" \
                    --db "$db" \
                    --collection "$collection" \
                    --out "/tmp/${db}_${collection}.json"
                
                mongoimport \
                    --host "$REMOTE_MONGO_HOST" \
                    --port "$REMOTE_MONGO_PORT" \
                    -u "$REMOTE_MONGO_USER" \
                    -p "$REMOTE_MONGO_PASS" \
                    --authenticationDatabase admin \
                    --db "$db" \
                    --collection "$collection" \
                    --file "/tmp/${db}_${collection}.json"
                
                rm -f "/tmp/${db}_${collection}.json"
            fi
        done
    done
    
    log "🎉 Incremental migration completed!"
}

main "$@"
```

### **Strategy 2: External MongoDB Migration**

#### **2.1 MongoDB Atlas Migration**

```bash
#!/bin/bash
# scripts/atlas-migration.sh

set -e

# Configuration
ATLAS_CLUSTER_URI="mongodb+srv://username:password@cluster.mongodb.net"
LOCAL_MONGO_HOST="localhost"
LOCAL_MONGO_PORT="27017"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Export from local MongoDB
export_to_atlas() {
    log "📦 Exporting from local MongoDB to Atlas..."
    
    # Get list of databases
    databases=$(mongo --host "$LOCAL_MONGO_HOST" --port "$LOCAL_MONGO_PORT" --quiet --eval "
        db.adminCommand('listDatabases').databases
            .filter(function(db) { return !['admin', 'local', 'config'].includes(db.name); })
            .map(function(db) { return db.name; })
            .join(' ');
    ")
    
    for db in $databases; do
        log "Exporting database: $db"
        
        mongodump \
            --host "$LOCAL_MONGO_HOST" \
            --port "$LOCAL_MONGO_PORT" \
            --db "$db" \
            --out "/tmp/atlas_migration" \
            --gzip
        
        # Import to Atlas
        mongorestore \
            --uri "$ATLAS_CLUSTER_URI" \
            --db "$db" \
            --dir "/tmp/atlas_migration/$db" \
            --gzip \
            --drop
        
        log "✅ Migrated $db to Atlas"
    done
    
    # Cleanup
    rm -rf "/tmp/atlas_migration"
}

# Update application configurations
update_app_configs() {
    log "🔧 Updating application configurations..."
    
    # Update LibreChat config
    if [[ -f "/opt/dungeonmind-platform/librechat-sizzek/librechat/config/librechat.yaml" ]]; then
        sed -i "s|mongodb://.*|mongodb+srv://username:password@cluster.mongodb.net/LibreChat?retryWrites=true&w=majority|" \
            "/opt/dungeonmind-platform/librechat-sizzek/librechat/config/librechat.yaml"
    fi
    
    # Update Sizzek config
    if [[ -f "/opt/dungeonmind-platform/librechat-sizzek/sizzek/config/config.py" ]]; then
        sed -i "s|mongodb://.*|mongodb+srv://username:password@cluster.mongodb.net/Sizzek?retryWrites=true&w=majority|" \
            "/opt/dungeonmind-platform/librechat-sizzek/sizzek/config/config.py"
    fi
    
    log "✅ Application configurations updated"
}

main() {
    log "🚀 Starting Atlas migration..."
    export_to_atlas
    update_app_configs
    log "🎉 Atlas migration completed!"
}

main "$@"
```

### **Strategy 3: Zero-Downtime Migration**

#### **3.1 Replica Set Migration**

```bash
#!/bin/bash
# scripts/zero-downtime-migration.sh

set -e

# Configuration
SOURCE_MONGO="mongodb://localhost:27017"
TARGET_MONGO="mongodb://your-server-ip:27017"
REPLICA_SET_NAME="dungeonmind-rs"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Setup replica set on target
setup_replica_set() {
    log "🏗️ Setting up replica set on target server..."
    
    # Initialize replica set
    mongo --host "$TARGET_MONGO" --eval "
        rs.initiate({
            _id: '$REPLICA_SET_NAME',
            members: [
                { _id: 0, host: 'your-server-ip:27017' }
            ]
        });
    "
    
    # Wait for replica set to be ready
    log "⏳ Waiting for replica set to be ready..."
    sleep 10
    
    # Check replica set status
    mongo --host "$TARGET_MONGO" --eval "rs.status()"
}

# Add source as secondary
add_source_as_secondary() {
    log "➕ Adding source MongoDB as secondary..."
    
    mongo --host "$TARGET_MONGO" --eval "
        rs.add('localhost:27017');
    "
    
    # Wait for replication to catch up
    log "⏳ Waiting for replication to sync..."
    sleep 30
}

# Promote target to primary
promote_target_to_primary() {
    log "👑 Promoting target to primary..."
    
    # Step down current primary (if source is primary)
    mongo --host "$SOURCE_MONGO" --eval "
        rs.stepDown();
    "
    
    # Wait for election
    sleep 10
    
    # Check new primary
    mongo --host "$TARGET_MONGO" --eval "rs.status()"
}

# Remove source from replica set
remove_source() {
    log "➖ Removing source from replica set..."
    
    mongo --host "$TARGET_MONGO" --eval "
        rs.remove('localhost:27017');
    "
}

# Update application configurations
update_app_configs() {
    log "🔧 Updating application configurations..."
    
    # Update all application configs to point to target
    find /opt/dungeonmind-platform -name "*.yml" -o -name "*.yaml" -o -name "*.env" | xargs sed -i "s|localhost:27017|your-server-ip:27017|g"
    
    log "✅ Application configurations updated"
}

main() {
    log "🚀 Starting zero-downtime migration..."
    
    setup_replica_set
    add_source_as_secondary
    promote_target_to_primary
    remove_source
    update_app_configs
    
    log "🎉 Zero-downtime migration completed!"
}

main "$@"
```

### **Migration Verification Scripts**

#### **Data Integrity Verification**

```bash
#!/bin/bash
# scripts/verify-migration.sh

set -e

SOURCE_MONGO="mongodb://localhost:27017"
TARGET_MONGO="mongodb://your-server-ip:27017"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Compare database counts
compare_database_counts() {
    log "📊 Comparing database counts..."
    
    source_dbs=$(mongo --quiet --uri "$SOURCE_MONGO" --eval "
        db.adminCommand('listDatabases').databases
            .filter(function(db) { return !['admin', 'local', 'config'].includes(db.name); })
            .map(function(db) { return db.name; })
            .sort();
    ")
    
    target_dbs=$(mongo --quiet --uri "$TARGET_MONGO" --eval "
        db.adminCommand('listDatabases').databases
            .filter(function(db) { return !['admin', 'local', 'config'].includes(db.name); })
            .map(function(db) { return db.name; })
            .sort();
    ")
    
    if [[ "$source_dbs" == "$target_dbs" ]]; then
        log "✅ Database lists match"
    else
        log "❌ Database lists differ"
        echo "Source: $source_dbs"
        echo "Target: $target_dbs"
    fi
}

# Compare document counts
compare_document_counts() {
    log "📋 Comparing document counts..."
    
    mongo --quiet --uri "$SOURCE_MONGO" --eval "
        var sourceCounts = {};
        db.adminCommand('listDatabases').databases.forEach(function(dbInfo) {
            if (!['admin', 'local', 'config'].includes(dbInfo.name)) {
                sourceCounts[dbInfo.name] = {};
                db = db.getSiblingDB(dbInfo.name);
                db.getCollectionNames().forEach(function(collName) {
                    sourceCounts[dbInfo.name][collName] = db.getCollection(collName).count();
                });
            }
        });
        print(JSON.stringify(sourceCounts));
    " > /tmp/source_counts.json
    
    mongo --quiet --uri "$TARGET_MONGO" --eval "
        var targetCounts = {};
        db.adminCommand('listDatabases').databases.forEach(function(dbInfo) {
            if (!['admin', 'local', 'config'].includes(dbInfo.name)) {
                targetCounts[dbInfo.name] = {};
                db = db.getSiblingDB(dbInfo.name);
                db.getCollectionNames().forEach(function(collName) {
                    targetCounts[dbInfo.name][collName] = db.getCollection(collName).count();
                });
            }
        });
        print(JSON.stringify(targetCounts));
    " > /tmp/target_counts.json
    
    if diff /tmp/source_counts.json /tmp/target_counts.json > /dev/null; then
        log "✅ Document counts match"
    else
        log "❌ Document counts differ"
        echo "Differences:"
        diff /tmp/source_counts.json /tmp/target_counts.json
    fi
    
    # Cleanup
    rm -f /tmp/source_counts.json /tmp/target_counts.json
}

# Test application connectivity
test_app_connectivity() {
    log "🔌 Testing application connectivity..."
    
    # Test LibreChat connection
    if curl -f -s "https://chat.yourdomain.com/api/health" > /dev/null; then
        log "✅ LibreChat connectivity test passed"
    else
        log "❌ LibreChat connectivity test failed"
    fi
    
    # Test Sizzek connection
    if curl -f -s "https://sizzek.yourdomain.com/health" > /dev/null; then
        log "✅ Sizzek connectivity test passed"
    else
        log "❌ Sizzek connectivity test failed"
    fi
}

main() {
    log "🔍 Starting migration verification..."
    
    compare_database_counts
    compare_document_counts
    test_app_connectivity
    
    log "✅ Migration verification completed"
}

main "$@"
```

### **Migration Rollback Plan**

```bash
#!/bin/bash
# scripts/rollback-migration.sh

set -e

BACKUP_DIR="/opt/backups/mongodb"
ROLLBACK_TIMESTAMP="$1"

if [[ -z "$ROLLBACK_TIMESTAMP" ]]; then
    echo "Usage: $0 <backup_timestamp>"
    echo "Available backups:"
    ls -la "$BACKUP_DIR"
    exit 1
fi

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Stop applications
stop_applications() {
    log "🛑 Stopping applications..."
    
    cd /opt/dungeonmind-platform/librechat-sizzek
    docker-compose -f docker-compose.librechat.yml down
    
    cd /opt/dungeonmind-platform/dungeonmind
    docker-compose -f docker-compose.dungeonmind.yml down
}

# Restore from backup
restore_from_backup() {
    log "📦 Restoring from backup: $ROLLBACK_TIMESTAMP"
    
    backup_path="$BACKUP_DIR/$ROLLBACK_TIMESTAMP"
    
    if [[ ! -d "$backup_path" ]]; then
        error "Backup $ROLLBACK_TIMESTAMP not found"
    fi
    
    # Stop MongoDB
    docker stop shared-mongodb
    
    # Remove MongoDB data
    docker volume rm shared-infrastructure_mongodb_data
    
    # Start MongoDB
    docker start shared-mongodb
    
    # Wait for MongoDB to be ready
    sleep 10
    
    # Restore databases
    for db_dir in "$backup_path"/*/; do
        if [[ -d "$db_dir" ]]; then
            db_name=$(basename "$db_dir")
            log "Restoring database: $db_name"
            
            mongorestore \
                --host "localhost" \
                --port "27017" \
                --db "$db_name" \
                --dir "$db_dir" \
                --gzip \
                --drop
        fi
    done
}

# Update configurations to point back to local
update_configs_local() {
    log "🔧 Updating configurations to point to local MongoDB..."
    
    # Update all configs to use localhost
    find /opt/dungeonmind-platform -name "*.yml" -o -name "*.yaml" -o -name "*.env" | xargs sed -i "s|your-server-ip:27017|localhost:27017|g"
}

# Start applications
start_applications() {
    log "🚀 Starting applications..."
    
    cd /opt/dungeonmind-platform/librechat-sizzek
    docker-compose -f docker-compose.librechat.yml up -d
    
    cd /opt/dungeonmind-platform/dungeonmind
    docker-compose -f docker-compose.dungeonmind.yml up -d
}

main() {
    log "🔄 Starting migration rollback..."
    
    stop_applications
    restore_from_backup
    update_configs_local
    start_applications
    
    log "✅ Migration rollback completed!"
    log "Applications are now using local MongoDB"
}

main "$@"
```

---

## 📚 **Additional Resources**

- **LibreChat Documentation**: [Official Docs](https://docs.librechat.ai)
- **Traefik Configuration**: [Traefik Docs](https://doc.traefik.io/traefik/)
- **MongoDB Administration**: [MongoDB Manual](https://docs.mongodb.com/manual/)
- **Docker Compose Reference**: [Compose File Reference](https://docs.docker.com/compose/compose-file/)
- **MongoDB Migration Guide**: [Official Migration Docs](https://docs.mongodb.com/manual/core/migration/)

---

*This guide provides a comprehensive approach to deploying LibreChat and Sizzek while maintaining the existing DungeonMind infrastructure. The modular design allows for incremental deployment and easy rollback if issues arise.*