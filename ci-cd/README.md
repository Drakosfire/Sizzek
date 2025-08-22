# Sizzek CI/CD Directory

This directory contains clean, maintained scripts and documentation for the Sizzek MCP server ecosystem deployment and build processes.

## Current Scripts

### `build-all-mcps.sh`
**Purpose**: Builds all TypeScript MCP servers with unified environment configuration

**What it does**:
- Installs dependencies for all MCP servers
- Builds TypeScript projects
- Verifies unified `.env.sizzek` configuration exists
- Checks for required environment variables
- Optionally deploys to remote environments

**Usage**:
```bash
./ci-cd/build-all-mcps.sh
```

**Prerequisites**:
- `Sizzek/config/.env.sizzek` must exist with common MCP server variables
- Node.js and npm installed
- All MCP server source code in `Sizzek/mcp-servers/`

### `deploy-mcp-envs.sh`
**Purpose**: Deploys environment configurations to remote servers

**Usage**:
```bash
./ci-cd/deploy-mcp-envs.sh
```

## Build Order

1. **MCP Servers**: Run `build-all-mcps.sh` to compile TypeScript and verify configuration
2. **LibreChat Container**: Rebuild container to pick up new volume mounts and config
3. **Test Integration**: Verify MCP servers are accessible from LibreChat

## Environment Configuration

All MCP servers now load from unified `Sizzek/config/.env.sizzek`:
- Common MongoDB connection strings
- Shared API keys and credentials  
- Standardized MCP server settings

Individual server-specific variables remain in their respective `.env` files.
