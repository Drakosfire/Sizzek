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
    - Normalized Mongo vars so either `MONGODB_URI` or `MONGODB_CONNECTION_STRING` is accepted; both are set when only one exists.
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
      node -e "console.log(process.env.MONGODB_URI||process.env.MONGODB_CONNECTION_STRING, process.env.MONGODB_DATABASE, process.env.MONGODB_COLLECTION||process.env.MONGODB_COLLECTION_PREFIX)"
      ```
    - DB collections/counts (requires mongosh):
      ```bash
      mongosh "$MONGODB_CONNECTION_STRING/$MONGODB_DATABASE" --eval "db.getCollectionNames().forEach(c=>print(c, db[c].countDocuments()))"
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
