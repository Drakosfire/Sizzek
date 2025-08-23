# Project Scratchpad — LibreChat + Sizzek Cloud Deployment

- Title: LibreChat + Sizzek Cloud Deployment
- Date: 2025-08-10
- Project: DungeonMind Platform (Deployment)
- Author: system
- Version: 0.1 (draft)
- Related doc: `Sizzek/LibreChat_Sizzek_Deployment_Guide.md`

---

## 0) Summary & Objectives
- Problem: Host LibreChat (multi-tenant home agent) and Sizzek (SMS service) alongside DungeonMind, with secure public access and operational simplicity.
- Goal: Deploy a Hybrid Separation architecture using shared infra (Traefik, MongoDB, Redis, Prom/Grafana) and independent stacks for LibreChat and Sizzek.
- Primary users: platform admin, invited users (initially), future public users.
- Success criteria:
  - [X] Public HTTPS endpoints for `chat.<domain>`, `sizzek.<domain>`, `admin.<domain>`
  - [ ] Stacks deployable/rollback via scripts
  - [ ] Health checks green; monitoring dashboards accessible
  - [ ] Invite-only or controlled onboarding live
- Non-goals: Full unified platform, deep DM integration, auto-scale in v1.

## 1) Constraints & Assumptions
- Runtime: Docker + Docker Compose on Ubuntu 20.04+
- Infra: Single VM; Traefik proxy; shared MongoDB/Redis; Prometheus/Grafana
- DNS: `dm`, `chat`, `sizzek`, `admin` subdomains
- Security: Let’s Encrypt TLS; auth rate-limits; fail2ban (optional)
- Solo-dev ops: simple scripts; incremental rollout; easy rollback

## 2) Users & Access Model
- Access: Invite-only initially (registration disabled or gated)
- Roles: admin (LibreChat), standard users
- Onboarding: manual create-user script; future SMS OTP via Sizzek

## 3) Data Model & Interfaces
- Core services:
  - LibreChat app (HTTP, WebSocket)
  - Sizzek agent (HTTP API, SMS via Twilio)
  - Shared infrastructure: Traefik, MongoDB, Redis, Prom/Grafana
- Interfaces/endpoints (internal/private):
  - POST `/internal/provision-user` (provision LibreChat users)
  - POST `/auth/otp/request`, POST `/auth/otp/verify` (future OTP)
  - Health: `/api/health` (LibreChat), `/health` (Sizzek)
- Webhooks: Twilio inbound SMS → Sizzek webhook endpoint (to define)
- Config binding via environment variables (see §5)

## 4) Tooling / API Inventory
- LibreChat
  - Health: GET `/api/health`
  - Admin create-user (container script)
  - CORS, rate-limit, session settings via config
- Sizzek
  - Health: GET `/health`
  - Internal APIs: provisioning; OTP (future)
  - Twilio webhook handler (to implement)
- Traefik
  - Routers for `chat.*`, `sizzek.*`, `admin.*`
  - Middlewares: headers, rate limiting, basic auth (admin)

## 5) Storage & Configuration
- Storage: MongoDB databases `LibreChat`, `Sizzek`, `DungeonMind`; Redis with password
- Paths: shared-infrastructure compose stack for volumes
- Key env vars (see guide §3.1):
  - DOMAIN, ACME_EMAIL
  - MONGO_ROOT_USER/PASSWORD; LIBRECHAT_DB_PASSWORD; SIZZEK_DB_PASSWORD; DUNGEONMIND_DB_PASSWORD
  - REDIS_PASSWORD
  - JWT_SECRET, JWT_REFRESH_SECRET, CREDS_KEY, CREDS_IV
  - OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY
  - SIZZEK_API_KEY, SIZZEK_WEBHOOK_SECRET
  - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

## 6) Web/UI Plan
- Public UIs: LibreChat at `https://chat.<domain>`; Sizzek API (no public UI) at `https://sizzek.<domain>`
- Admin: Traefik, Grafana, Prometheus dashboards at `https://admin.<domain>` (basic auth + optional IP allowlist)
- Registration: invite-only v1; toggle strategy later

## 7) Security & Privacy
- TLS via Let’s Encrypt; HSTS; security headers
- Nginx/Traefik rate limits for API endpoints
- Block public registration endpoints or restrict to internal network
- Secrets in `.env` only; no logs of credentials; redact in outputs
- Fail2ban optional for extra hardening

## 8) Observability & Error Handling
- Prometheus scrape targets: Traefik, LibreChat, Sizzek, exporters
- Grafana dashboards
- Health checks and scripts (phase 4.2)
- Structured logs for stacks; log rotation configured per service

## 9) Testing Plan
- Proving test: Public HTTPS for `chat.<domain>` responds; `/api/health` 200
- Unit: N/A (infra focus)
- Integration:
  - Compose stacks up; services healthy
  - LibreChat create-user command succeeds
  - Sizzek health returns 200; Twilio webhook endpoint reachable (stub)
- E2E:
  - Login to LibreChat; basic chat roundtrip
  - Optional SMS flow (later): request OTP, verify

## 10) Performance & SLAs
- Target latencies: p95 < 500ms for API; websockets stable
- Throughput: low initial; scale by VM size
- Resource: 4 cores/8GB min; monitor CPU/mem via node-exporter (future)

## 11) Risks & Mitigations
- Public exposure of admin endpoints → Basic auth + IP allowlist + rate-limit
- DB credentials misconfig → enforce auth, use non-root app users, verify health
- SSL renewal failure → daily cron auto-renew; alerts
- Data loss → backups before deploy; scheduled backups thereafter
- Overly permissive registration → invite-only; proxy block

## 12) Milestones & Tasks
- M1: Shared Infrastructure
  - [ ] Bring up Traefik, MongoDB, Redis, Prometheus, Grafana
  - [ ] DNS and TLS certificates issued
- M2: LibreChat + Sizzek Stack
  - [X] Nginx proxy configured: `https://sizzek.dungeonmind.net` → `127.0.0.1:3080` (LibreChat)
  - [ ] Build Sizzek image; compose up
  - [ ] Wire LibreChat envs; health 200
  - [ ] Traefik routes and headers configured
- M3: Security Hardening
  - [ ] Proxy rules for registration gating
  - [ ] Rate limiting, basic auth for admin
  - [ ] Fail2ban (optional)
- M4: Monitoring & Backups
  - [ ] Dashboards accessible; alerts configured
  - [ ] Backup scripts scheduled
- M5: Onboarding Flow (Optional)
  - [ ] Internal provisioning endpoint
  - [ ] OTP flow via Sizzek

## 13) Validation Checklist (Acceptance)
- [ ] All containers healthy; expected ports routed via Traefik
- [ ] `https://chat.<domain>` accessible; login works for created user
- [X] `https://sizzek.<domain>` serves LibreChat UI
- [ ] `https://sizzek.<domain>/health` 200
- [ ] Admin dashboards reachable and secured
- [ ] SSL certs valid; auto-renew in place
- [ ] Backups and health scripts working

## 14) Release & Ops
- Scripts:
  - Deploy: `scripts/deploy.sh`
  - Health: `scripts/health-check.sh`
  - SSL/nginx: `scripts/setup-ssl.sh`
  - Security/monitoring: `scripts/security-monitor.sh`
  - Backup: `scripts/backup-users.sh`
- Rollout: Infrastructure → stacks → security → monitoring; rollback via volume/compose strategy

---

### Notes & References
- Source guide: `Sizzek/LibreChat_Sizzek_Deployment_Guide.md`
- Consider future Strategy 2/3 once usage grows (isolation/unified stack)

## 15) Progress Log

- 2025-08-10
  - Configured Nginx to proxy `sizzek.dungeonmind.net` (HTTPS) to LibreChat at `http://127.0.0.1:3080`.
  - Kept the default `server { listen 80 default_server; }` block generic (no proxy) to avoid exposing LibreChat on all hostnames.
  - Validated public access: `curl https://sizzek.dungeonmind.net` returns LibreChat UI. `/api/health` via public path currently returns 404; health check to be addressed later.
  - Commands used:

```bash
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak.$(date +%F-%H%M%S)
sudo tee /etc/nginx/sites-available/default >/dev/null <<'NGINX_CONF'
# ... default 80 server with try_files ...
server {
    root /var/www/html;
    index index.html index.htm index.nginx-debian.html;
    server_name sizzek.dungeonmind.net;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_buffering off;
        client_max_body_size 25m;
    }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl;                  # managed by Certbot
    ssl_certificate     /etc/letsencrypt/live/sizzek.dungeonmind.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sizzek.dungeonmind.net/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
NGINX_CONF
sudo nginx -t && sudo systemctl reload nginx
```

  - Next: create LibreChat admin user, decide registration gating, and expose a link from `dungeonmind.net` to `sizzek.dungeonmind.net`.

- 2025-08-11
  - Standardized MCP server environment loading and remote secrets deployment.
    - Generic dotenv loader added to: `mcp-servers/{memory,movies,grocery-list,todoodles,scheduled-tasks,twilio-sms,google-calendar-mcp}` entry files.
    - Load order: `ENV_PATH` (if set) → `.env.local` → `.env` → `.env.production` (when `NODE_ENV=production`).
    - Normalized Mongo vars so either `MONGODB_URI` or `MONGO_URI` is accepted; both are set when only one exists.
    - Startup logs now mask credentials and print the resolved env file path.
  - Remote secrets procedure
    - Local staging: `Sizzek/secrets-deploy/<server>/.env`
    - Sync: `rsync -av --rsync-path="mkdir -p ~/projects/Sizzek/mcp-servers && rsync" ./secrets-deploy/ alan@srv586875:~/projects/Sizzek/mcp-servers/`
    - Harden: `ssh alan@srv586875 'find ~/projects/Sizzek/mcp-servers -maxdepth 2 -name ".env" -exec chmod 600 {} +'`
    - Runtime: set service working directory to each server folder so `.env` is found, or pass `ENV_PATH=/home/alan/projects/Sizzek/mcp-servers/<server>/.env`.
  - Fixed DNS error `getaddrinfo EAI_AGAIN mongodb`
    - Root cause: a process running with `mongodb://mongodb:27017` host from an old config.
    - Resolution: ensure all `.env` files use `mongodb://srv586875:27017/?directConnection=true` and redeploy; restart processes.
    - Memory MCP was using JSON storage; switched to Mongo: `MCP_STORAGE_TYPE=mongodb` in `memory/.env` and restarted.
  - Expected env per MCP server (DB/collections)
    - `memory`: `MONGODB_DATABASE=mcp_data`, `MONGODB_COLLECTION=user_memory`
    - `movies`: `MONGODB_DATABASE=mcp_data`, `MONGODB_COLLECTION=user_movies`
    - `grocery-list`: `MONGODB_DATABASE=mcp_data`, `MONGODB_COLLECTION=user_grocery_data`
    - `todoodles`: `MONGODB_DATABASE=mcp_data`, `MONGODB_COLLECTION=user_todoodles`
    - `scheduled-tasks`: `MONGODB_DATABASE=LibreChat`, `MONGODB_COLLECTION=scheduled_tasks`
    - `twilio-sms`: `MONGODB_COLLECTION=users` (LibreChat users; DB as designed)
    - `google-calendar-mcp`: uses dotenv as well; add `GOOGLE_OAUTH_CREDENTIALS`/token vars per its README
  - Quick verification after restart
    - Print env in runtime: `printenv | grep -E '^MONGODB_|^TWILIO_|^GOOGLE_'`
    - Sanity check values:
      ```bash
      node -e "console.log(process.env.MONGODB_URI||process.env.MONGO_URI, process.env.MONGODB_DATABASE, process.env.MONGODB_COLLECTION||process.env.MONGODB_COLLECTION_PREFIX)"
      ```
    - DB collections/counts (requires mongosh):
      ```bash
      mongosh "$MONGO_URI/$MONGODB_DATABASE" --eval "db.getCollectionNames().forEach(c=>print(c, db[c].countDocuments()))"
      ```
  - Notes
    - Keep provider secrets (TWILIO_*, GOOGLE_*, API keys) only in remote `.env` files; never commit.
    - If using docker-compose, ensure each service has `env_file: .env` in its context directory.

- 2025-08-17
  - **CRITICAL: LibreChat MongoDB Container Dependency**
    - **Issue**: LibreChat failing with `ECONNREFUSED ::1:27017, connect ECONNREFUSED 127.0.0.1:27017`
    - **Root Cause**: LibreChat expects MongoDB container (`chat-mongodb`) to be running, but it was stopped
    - **Solution**: Start required containers before running LibreChat
    - **Quick Fix**: `cd ~/projects/External-Endpoint && docker-compose up -d mongodb`
    - **Full Fix**: `cd ~/projects/External-Endpoint && docker-compose up -d mongodb meilisearch vectordb`
    - **Verification**: `docker-compose ps` to ensure all containers are running
    - **Connection String**: LibreChat expects `mongodb://localhost:27017/LibreChat` when running outside Docker
    - **Container Dependencies**: LibreChat requires `chat-mongodb`, `chat-meilisearch`, `vectordb`, and `rag_api` containers
    - **Troubleshooting Step**: Always check `docker-compose ps` first when LibreChat fails to start
    - **Documentation Need**: Add this to ongoing support documentation and troubleshooting guide

- 2025-08-17 (Continued)
  - **✅ MongoDB Migration Completed Successfully**
    - **Migration Method**: Direct export/import using `mongodump`/`mongorestore`
    - **Data Migrated**: LibreChat (12 users, 1565 conversations, 2872 messages), mcp_data (45 memory entities, 13 groceries, 3 todoodles, 2 scheduled tasks, 1 movie), config, debug_todoodles
    - **Target**: Remote server `alan@srv586875` running `chat-mongodb` container
    - **Verification**: All data verified with matching document counts
    - **Script Created**: `scripts/migrate-to-server.sh` for future migrations

  - **✅ MCP Environment Management System Implemented**
    - **Problem**: Multiple MCP servers had inconsistent `.env` configurations and manual management was error-prone
    - **Solution**: Created centralized deployment script `scripts/deploy-mcp-envs.sh`
    - **Process**: Automatically copies all `.env` files from local `./mcp-servers/` to remote server
    - **Coverage**: Deploys 8 `.env` files (todoodles, twilio-sms, google-calendar-mcp, movies, grocery-list, scheduled-tasks, memory)
    - **Benefits**: Eliminates configuration drift, ensures consistent MongoDB connection strings, automated deployment
    - **Integration**: Added to `scripts/build-all-mcps.sh` for automatic deployment during builds
    - **Verification**: All `.env` files verified on remote server after deployment

  - **✅ Todoodles MCP Database Access Fixed**
    - **Issue**: Todoodles MCP was returning 0 todos despite data being in MongoDB
    - **Root Cause**: MCP server `.env` configuration was using wrong storage type or connection string
    - **Solution**: Deployed updated `.env` files using new centralized deployment system
    - **Result**: Todoodles MCP now successfully accesses MongoDB data
    - **Verification**: User can see their todoodles data in LibreChat interface

  - **📋 Next Priority: Web UI Ephemeral Pages**
    - **Goal**: Enable MCP servers to serve web UI pages for enhanced user interaction
    - **Current State**: MCP servers can access data but lack web interface capabilities
    - **Requirements**: 
      - Configure nginx to serve static files from MCP server directories
      - Set up routing for ephemeral web pages
      - Ensure proper security and access controls
      - Test with existing MCP servers (todoodles, grocery-list, etc.)
    - **Technical Approach**: 
      - Extend nginx configuration to handle `/mcp/*` routes
      - Create static file serving for MCP web UIs
      - Implement proper URL routing and security headers
    - **Success Criteria**: Users can access web interfaces for MCP functionality via browser

- 2025-08-17 Continued
  - **Web UI Ephemeral Pages - Implementation Completed**
    - **Architecture**: Dynamic port allocation (11000-12000 range), multi-tenant security, direct access
    - **URL Structure**: `https://sizzek.dungeonmind.net:{random-port}/?token={uuid}` (e.g., `https://sizzek.dungeonmind.net:37949/?token=9049f179-0cbd-4729-97aa-9513654d4312`)
    - **Security**: Token-based authentication with 30-minute expiration, session isolation
    - **Firewall**: Opened ports 11000-12000/tcp for ephemeral web UI access
    - **Fix Applied**: Updated `MCP_WEB_UI_BASE_URL` from internal IP to public domain
    - **Next Steps**: Implement rate limiting and monitoring for production security

- 2025-08-17 Continued
  - **Security Considerations for Ephemeral Web UIs**
    - **Current Measures**: Token auth, session isolation, 30-min expiration, port range limitation
    - **Recommended Additions**:
      - **Rate Limiting**: Implement per-IP rate limiting on ephemeral ports
      - **Monitoring**: Log access attempts and failed token validations
      - **Port Scanning Protection**: Monitor for port scanning attempts
      - **Session Cleanup**: Ensure expired sessions are properly cleaned up
    - **Firewall Rules**: Ports 11000-12000/tcp opened for ephemeral web UI access
    - **Security Status**: Good baseline, needs monitoring and rate limiting for production

- 2025-08-17 Evening
  - **🔄 MCP Web UI Package Update and Build Issues**
    - **Package Published**: Successfully published `mcp-web-ui@1.1.0` to npm with protocol configuration fix
    - **Dependencies Updated**: Updated MCP server `package.json` files to use `mcp-web-ui@^1.1.0`
    - **Build Script Fixed**: Updated `build-all-mcps.sh` to handle `package-lock.json` mismatches gracefully
    - **Current Issue**: MCP servers still generating malformed URLs like `http://https://sizzek.dungeonmind.net:11241?token=...`
    - **Root Cause**: MCP servers haven't been rebuilt with the new package version yet
    - **Build Status**: 
      - ✅ Gmail-MCP-Server: Built successfully
      - ✅ google-calendar-mcp: Built successfully  
      - ❌ grocery-list: Failed due to lock file mismatch (script now handles this)
      - ❌ movies: Failed due to TypeScript error (`Cannot find name 'envPath'`)
    - **Next Steps**: 
      1. Fix TypeScript error in movies MCP server
      2. Rebuild all MCP servers to pick up the new `mcp-web-ui@1.1.0` package
      3. Test that URLs are no longer malformed
      4. Verify ephemeral web UI functionality works correctly

- 2025-08-18
  - **🔒 CRITICAL: LibreChat MongoDB Security Hardening**
    - **Vulnerability Identified**: LibreChat running with `--noauth` and exposed MongoDB port 27017
    - **Security Fixes Applied**:
      - **MongoDB Authentication**: Enabled `--auth` in docker-compose.yml and deploy-compose.yml
      - **User Creation**: Created `librechat_user` with `readWrite` and `dbAdmin` roles
      - **Environment Variables**: Added `MONGO_PASSWORD`, `MONGO_ROOT_PASSWORD`, proper `authSource` configuration
      - **Health Checks**: Added MongoDB health checks with proper authentication
      - **Port Security**: Removed MongoDB port exposure (27017) from internet
    - **Configuration Changes**:
      - `LibreChat/docker-compose.yml`: Added auth, health checks, env_file loading
      - `LibreChat/deploy-compose.yml`: Production security hardening, local Dockerfile builds
      - `LibreChat/mongodb/init-scripts/01-create-librechat-user.js`: User creation script
      - `LibreChat/env.secure.example`: Secure environment template
      - `LibreChat/SECURITY_SETUP.md`: Security documentation and procedures
    - **Deployment Automation**:
      - `LibreChat/build-local.sh`: Local build and testing script
      - `LibreChat/deploy-to-server.sh`: Secure server deployment script
    - **Security Status**: MongoDB now properly authenticated, no longer exposed to internet

  - **🌐 Nginx Configuration Security Hardening**
    - **Conflict Resolution**: Fixed conflicting server_name configurations for sizzek.dungeonmind.net
    - **Security Enhancements**:
      - **Rate Limiting**: Added `limit_req_zone` and `limit_req` directives
      - **SSL/TLS Hardening**: Enhanced SSL protocols, ciphers, session caching
      - **Security Headers**: Added X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Content-Security-Policy
      - **File Access Control**: Blocked access to hidden files and backup files
      - **Health Endpoints**: Added `/health` endpoints for monitoring
    - **Configuration Changes**:
      - `DungeonMind/nginx/dungeonmind.net`: Removed conflicting MCP routes, enhanced security
      - `DungeonMind/nginx/sizzek.dungeonmind.net`: Enhanced security headers, rate limiting
      - `DungeonMind/nginx/deploy-all-configs.sh`: Nginx deployment automation
      - `DungeonMind/nginx/security-monitor.sh`: Security monitoring script
    - **Domain Separation**: Removed MCP UI routes from dungeonmind.net to avoid conflicts with sizzek.dungeonmind.net
    - **Security Status**: Nginx configurations hardened with modern security practices

  - **📋 Next Priority: Deployment and Testing**
    - **Immediate Actions**:
      1. Deploy updated nginx configurations to server
      2. Test LibreChat authentication with new MongoDB user
      3. Verify ephemeral MCP web UI functionality on sizzek.dungeonmind.net
      4. Monitor security logs for any unauthorized access attempts
    - **Security Monitoring**: Implement ongoing monitoring for MongoDB access attempts and nginx security events
    - **Documentation**: Update deployment guides with new security requirements and procedures
    - **🔒 Container Security Consolidation**: 
      - **Goal**: Move all services into unified container environment for better security isolation
      - **Current State**: Multiple separate containers (LibreChat, MongoDB, MCP servers, nginx) with complex networking
      - **Target State**: Single containerized environment with internal networking, no external port exposure
      - **Benefits**: Reduced attack surface, simplified security management, unified monitoring
      - **Implementation**: 
        1. Create unified docker-compose stack for all services
        2. Remove external port exposures (27017, 3080, etc.)
        3. Implement internal service discovery and communication
        4. Add unified logging and monitoring
        5. Create single deployment pipeline

  - **🔧 LibreChat Container Build Issues (Current Blockers)**
    - **Local Build Error**: `Cannot find module '/app/node_modules/@librechat/api/dist/index.js'`
      - **Root Cause**: `npm prune --production` removes workspace dependencies after building
      - **Investigation Steps**:
        1. ✅ Verified `packages/api/dist/index.js` exists in source
        2. ✅ Confirmed Dockerfile runs `npm run frontend` which includes API build
        3. ❌ Found `npm prune --production` removes built workspace packages
        4. ✅ Identified workspace dependency linking issue
      - **Solution Applied**: 
        - Modified Dockerfile to explicitly build all packages before frontend
        - Removed `npm prune --production` to preserve built workspace packages
        - Added explicit build steps: `npm run build:data-provider && npm run build:data-schemas && npm run build:api && npm run build:client-package`
      - **Debug Commands**:
        ```bash
        # Check Dockerfile build stages
        cat LibreChat/Dockerfile
        cat LibreChat/Dockerfile.multi
        
        # Verify package.json scripts
        grep -A 10 '"scripts"' LibreChat/package.json
        
        # Test build locally
        cd LibreChat && npm run build:api
        
        # Verify built packages exist
        ls -la LibreChat/packages/api/dist/
        ```
    - **Remote MongoDB Permission Error**: `Permission denied [system:13]: "/data/db/journal"`
      - **Root Cause**: MongoDB container running as wrong user or volume permissions issue
      - **Investigation Steps**:
        1. Check MongoDB container user/group configuration
        2. Verify volume mount permissions on host
        3. Check if data directory ownership is correct
        4. Ensure Docker volume permissions are set properly
      - **Debug Commands**:
        ```bash
        # Check container user
        docker exec -it chat-mongodb id
        
        # Check volume permissions
        ls -la /path/to/mongodb/data/
        
        # Check Docker volume info
        docker volume ls
        docker volume inspect <volume_name>
        
        # Fix permissions if needed
        sudo chown -R 999:999 /path/to/mongodb/data/
        ```
      - **Quick Fix**: Add `user: "999:999"` to MongoDB service in docker-compose.yml
    - **Next Steps**:
      1. ✅ Fix LibreChat Dockerfile build process (completed)
      2. Resolve MongoDB volume permissions
      3. Test local builds before remote deployment
      4. Update deployment scripts with proper error handling

- 2025-08-19 
  - **🔧 LibreChat Dockerfile Build Issue - ROOT CAUSE IDENTIFIED**
    - **Problem**: Container still failing with `Cannot find module '/app/node_modules/@librechat/api/dist/index.js'`
    - **Root Cause Analysis**: 
      - ✅ `packages/api/dist/index.js` exists in source code
      - ✅ **Local build works**: `npm run build:api` succeeds outside container
      - ❌ **CRITICAL FINDING**: Build process crashes with JavaScript heap out of memory in Docker
      - ❌ **FATAL ERROR**: `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`
      - ❌ **DOCKER BUILD DECEPTION**: Docker reports build success despite npm crash due to `--force` flag
      - ❌ **NEW FINDING**: Package-lock.json out of sync causing multi-stage build to fail
    - **Deeper Investigation**:
      - **Local vs Container**: Build works locally but fails in Docker environment
      - **Memory Issue**: Even 4GB insufficient for Docker build (container memory constraints)
      - **Package Lock**: `npm ci` fails due to package-lock.json mismatch with package.json
      - **npm --force behavior**: When process crashes, npm uses `--force` and reports success
      - **Verification**: `/app/packages/api/dist/` directory doesn't exist in built container
    - **Updated Solution**: 
      - **Fix package-lock.json**: Run `npm install` to sync package-lock.json with package.json
      - **Alternative approach**: Use pre-built packages or different build strategy
      - **Memory optimization**: Consider building packages separately or using different Node.js version
    - **Key Learning**: 
      - **Never trust Docker build success blindly**
      - **Always check for npm --force warnings in build logs**
      - **Verify build artifacts exist in the container**
      - **Package-lock.json drift can cause build failures**
    - **Verification**: 
      - 🔄 Ready for testing with package-lock.json fix
    - **Next**: Fix package-lock.json and test Docker build

- 2025-08-19
  - **🎉 LibreChat Dockerfile Build Issue - RESOLVED!**
    - **BREAKTHROUGH**: Identified **redundant package building** as the root cause
    - **The Problem**: Dockerfile was building packages, then running `npm run frontend` which builds packages again
    - **Root Cause**: 
      - Dockerfile: `npm run build:data-provider && npm run build:data-schemas && npm run build:api && npm run build:client-package`
      - Then: `npm run frontend` which includes: `npm run build:data-provider && npm run build:data-schemas && npm run build:api && npm run build:client-package && cd client && npm run build`
      - **Result**: Packages built twice, causing memory exhaustion
    - **Solution Applied**: 
      - Changed Dockerfile from `npm run frontend` to `cd client && npm run build`
      - Eliminated redundant package builds
      - Kept symlinks for workspace packages
    - **Result**: ✅ **Container builds successfully without memory errors**
    - **Key Learning**: 
      - **Always trace through build scripts to understand what they actually do**
      - **Redundant operations can cause resource exhaustion**
      - **The obvious fix isn't always the right fix - dig deeper into the process**
    - **Status**: ✅ **RESOLVED** - LibreChat container now builds and runs successfully

- 2025-08-20
  - **🔧 SMS Router Security & Configuration Optimization**
    - **Problem**: Hardcoded URLs and poor configuration management in SMS router
    - **Issues Found**:
      - Hardcoded IP address `100.92.179.100:3081` in default endpoint
      - Hardcoded webhook URL `https://www.dungeonmind.net/api/sms/receive`
      - No configuration validation on startup
      - Sensitive data logged in headers
      - Fixed retry/timeout values
    - **Security Improvements Applied**:
      - **Centralized Configuration Class**: Created `SMSConfig` class with validation
      - **Environment Variable Management**: All hardcoded values moved to env vars
      - **Configuration Validation**: Startup validation prevents misconfiguration
      - **Secure Logging**: Authorization headers masked in logs
      - **Flexible Endpoints**: Easy to change from `sizzek.dungeonmind.net:3081` to `sizzek.dungeonmind.net:3001`
    - **New Environment Variables**:
      - `EXTERNAL_SMS_ENDPOINT=https://sizzek.dungeonmind.net:3001/api/receive-sms`
      - `TWILIO_WEBHOOK_URL=https://www.dungeonmind.net/api/sms/receive`
      - `SMS_MAX_RETRIES=3`, `SMS_RETRY_DELAY=1`, `SMS_REQUEST_TIMEOUT=10`
    - **Benefits**:
      - **Security**: No hardcoded credentials or URLs
      - **Flexibility**: Easy endpoint changes without code modifications
      - **Maintainability**: Centralized configuration management
      - **Observability**: Better logging without sensitive data exposure
      - **Validation**: Prevents deployment with missing configuration
    - **Next Steps**: Update production environment variables and test SMS flow

- 2025-08-20 (Continued)
  - **✅ SMS Router Forwarding Working**
    - **Status**: SMS router successfully forwarding messages to external endpoint
    - **Current Flow**: Twilio → DungeonMind SMS Router → External Endpoint
    - **Next Priority**: Configure SMS reception and routing into Docker container
    - **Target**: Ensure SMS messages are properly received and routed into LibreChat container
    - **Requirements**:
      - Verify Sizzek MCP server is running on correct port (3001)
      - Ensure SMS messages flow through to LibreChat conversations
      - Test end-to-end SMS → LibreChat → AI response flow
    - **Configuration Needed**:
      - Update `EXTERNAL_SMS_ENDPOINT` to point to correct Sizzek port
      - Ensure Sizzek MCP server is accessible from DungeonMind
      - Verify LibreChat external message API is working

- 2025-08-20 (Continued)
  - **🔧 LibreChat Container MCP Server Integration**
    - **Problem**: LibreChat container can't access MCP servers built outside container
    - **Root Cause**: Relative paths like `../Sizzek/mcp-servers/` don't exist inside container
    - **Solution Applied**: Volume mounting MCP server directories into container
    - **Changes Made**:
      - **Docker Compose**: Added volume mount for MCP server binaries only
        ```yaml
        volumes:
          - ../Sizzek/mcp-servers:/app/mcp-servers:ro
        ```
      - **LibreChat Config**: Updated all MCP server paths to use absolute container paths
        - `../Sizzek/mcp-servers/memory/dist/index.js` → `/app/mcp-servers/memory/dist/index.js`
        - `../Sizzek/mcp-servers/todoodles/dist/index.js` → `/app/mcp-servers/todoodles/dist/index.js`
        - `../Sizzek/mcp-servers/twilio-sms/dist/index.js` → `/app/mcp-servers/twilio-sms/dist/index.js`
        - And all other MCP servers updated similarly
      - **Removed**: Credential and memory file mounts (not needed - MCP servers handle their own config)
    - **Architecture**:
      - **MCP Servers**: Run as host processes outside container
      - **Configuration**: MCP servers read their own `.env` files from host filesystem
      - **Networking**: MCP servers connect to MongoDB via `localhost:27017` (secure localhost-only binding)
      - **LibreChat Container**: Only needs access to compiled MCP server binaries
    - **Security Enhancement**:
      - **MongoDB Port**: Exposed only to localhost (`127.0.0.1:27017:27017`)
      - **External Access**: Blocked - MongoDB not accessible from internet
      - **MCP Access**: Allowed - MCP servers can connect via localhost
      - **Production Safe**: Prevents external MongoDB access while enabling local development
    - **Benefits**:
      - **Clean Separation**: MCP servers handle their own configuration and credentials
      - **Security**: No sensitive data mounted into container
      - **Flexibility**: MCP servers can be updated outside container and changes are immediately available
      - **Simplicity**: Minimal volume mounts needed
    - **Next Steps**: Restart LibreChat container and test MCP server functionality

- 2025-08-20 (Continued)
  - **🔧 LibreChat Configuration Mount Fix**
    - **Problem**: LibreChat container not recognizing MCP servers or configuration
    - **Root Cause**: `librechat.yaml` file not mounted into container
    - **Error**: `ENOENT: no such file or directory, open '/app/librechat.yaml'`
    - **Solution**: Added volume mount for `librechat.yaml` in docker-compose.yml
      ```yaml
      volumes:
        - ./librechat.yaml:/app/librechat.yaml:ro
      ```
    - **Status**: ✅ **FIXED** - Container now has access to MCP server configuration
    - **Next**: Rebuild container to pick up new volume mount

- 2025-08-20 (Continued)
  - **🔧 MCP Dependencies Installation Fix**
    - **Problem**: MCP servers failing with `ERR_MODULE_NOT_FOUND: Cannot find package 'mcp-data'`
    - **Root Cause**: MCP servers need Node.js dependencies (`mcp-data`, `@modelcontextprotocol/sdk`, etc.) but only compiled binaries were mounted
    - **Solution**: Created entrypoint script to install MCP dependencies inside container
      - `LibreChat/entrypoint.sh`: Installs npm dependencies for all MCP servers before starting LibreChat
      - Updated `docker-compose.yml` to use entrypoint script
    - **Status**: ✅ **FIXED** - Container will now install required MCP dependencies on startup
    - **Next**: Rebuild container to test MCP server functionality

- 2025-08-20 (Continued)
  - **🔧 MCP Environment Variable Standardization**
    - **Problem**: Multiple MCP servers have similar environment variable requirements but individual `.env` files
    - **Solution**: Create a shared `.env.sizzek` file for common MCP server configuration
    - **Goal**: Standardize MongoDB connection strings, API keys, and common settings across all MCP servers
    - **Benefits**:
      - **Consistency**: All MCP servers use same MongoDB connection and base configuration
      - **Maintainability**: Single source of truth for common settings
      - **Deployment**: Easier to manage one shared config file
      - **Security**: Centralized credential management
    - **Next Priority**: Update MCP server environment variable imports to use shared `.env.sizzek` file
    - **Implementation Plan**:
      1. Create `.env.sizzek` with common variables (MongoDB, API keys, etc.)
      2. Update each MCP server to import from shared config
      3. Maintain server-specific variables in individual `.env` files
      4. Test that all MCP servers can access shared configuration
    - **✅ COMPLETED**: Updated all MCP servers to load shared `.env.sizzek` file
      - **Updated Servers**: memory, todoodles, twilio-sms, grocery-list, movies, scheduled-tasks, google-calendar-mcp
      - **Load Order**: `ENV_PATH` → `Sizzek/config/.env.sizzek` → `.env.local` → `.env` → `.env.production`
      - **Implementation**: Added shared config path to each server's `loadEnv` function
      - **Benefits**: All MCP servers now load common configuration from unified source
    - **✅ COMPLETED**: CI/CD Build Script Updates
      - **Moved**: `build-all-mcps.sh` to `Sizzek/ci-cd/` directory
      - **Enhanced**: Added unified environment configuration verification
      - **Features**: 
        - Verifies `.env.sizzek` exists and contains required variables
        - Checks for `MONGO_URI` and `MCP_STORAGE_TYPE`
        - Provides clear error messages if configuration is missing
        - Maintains backward compatibility with remote deployment
      - **Organization**: All CI/CD scripts now centralized in `ci-cd/` directory
    - **File Organization**:
      - **Shared Config**: `Sizzek/config/.env.sizzek` - Common MCP server variables
      - **Credentials**: `Sizzek/credentials/` - API keys, OAuth secrets, etc.
      - **Server Configs**: Individual `.env` files in each MCP server directory
    - **Common Variables to Standardize**:
      - `MONGO_URI=mongodb://localhost:27017/LibreChat`
      - `MCP_STORAGE_TYPE=mongodb`
      - `MCP_USER_BASED=true`
      - API keys and authentication tokens
      - Base URLs and endpoints
