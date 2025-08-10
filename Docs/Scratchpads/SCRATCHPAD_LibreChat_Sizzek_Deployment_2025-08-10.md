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
  - [ ] Public HTTPS endpoints for `chat.<domain>`, `sizzek.<domain>`, `admin.<domain>`
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
