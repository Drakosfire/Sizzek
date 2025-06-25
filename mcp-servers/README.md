# MCP Servers Ecosystem

A comprehensive collection of production-ready Model Context Protocol (MCP) servers designed for integration with [LibreChat](https://github.com/danny-avila/LibreChat) and other MCP-compatible hosts.

## 🌟 **Overview**

This ecosystem provides a suite of specialized MCP servers that extend AI capabilities with real-world integrations. Each server is built with:

- **🔒 Security-First Design**: Multi-tenant isolation, input validation, and encryption
- **📦 Unified Storage**: Powered by [@sizzek/mcp-data](https://github.com/Drakosfire/mcp-data) package
- **🔧 Production-Ready**: Comprehensive error handling, logging, and monitoring
- **📚 LibreChat Integration**: Optimized for seamless LibreChat deployment
- **🎯 TypeScript**: Full type safety and comprehensive documentation

---

## 🚀 **Available MCP Servers**

### **📝 Core Productivity**

#### **1. Todoodles** - Advanced Task Management
- **Purpose**: Time-stamped todo list with categories, priorities, and due dates
- **Features**: 
  - Priority levels (low 🟢, medium 🟡, high 🟠, urgent 🔴)
  - Category organization (work, personal, shopping, etc.)
  - Due date tracking with overdue detection
  - Smart search and filtering
  - Time tracking for completed tasks
- **Best For**: Personal productivity, project management
- **[Documentation](./todoodles/README.md)**

#### **2. Memory** - Knowledge Graph Storage
- **Purpose**: Persistent memory system using knowledge graphs
- **Features**:
  - Entity-relationship modeling
  - Cross-session memory retention
  - Semantic search capabilities
  - Observation tracking
  - Graph visualization ready
- **Best For**: Long-term context retention, relationship mapping
- **[Documentation](./memory/README.md)**

#### **3. Scheduled Tasks** - Automation & Reminders
- **Purpose**: Cron-like scheduling for recurring tasks and reminders
- **Features**:
  - Flexible scheduling (daily, weekly, monthly, custom cron)
  - Task automation triggers
  - LibreChat integration for reminders
  - Backup and restore functionality
- **Best For**: Automation, recurring reminders, workflow triggers
- **[Documentation](./scheduled-tasks/README.md)**

### **📱 Communication & Integration**

#### **4. Twilio SMS** - SMS Messaging
- **Purpose**: Send and receive SMS messages through Twilio
- **Features**:
  - E.164 phone number validation
  - Message status tracking
  - Contact management
  - Integration with LibreChat conversations
  - Loop prevention for LLM interactions
- **Best For**: SMS notifications, two-way communication
- **[Documentation](./twilio-sms/README.md)**

#### **5. Gmail MCP Server** - Email Management
- **Purpose**: Full Gmail integration for email management
- **Features**:
  - Email reading, sending, and organizing
  - Label management
  - Attachment handling
  - Advanced search capabilities
- **Best For**: Email automation, inbox management
- **[Documentation](./Gmail-MCP-Server/README.md)**

### **📅 Calendar & Scheduling**

#### **6. Google Calendar** - Calendar Management
- **Purpose**: Comprehensive Google Calendar integration
- **Features**:
  - Multi-calendar support
  - Event creation, updating, deletion
  - Recurring event management
  - Free/busy queries
  - Cross-calendar availability checking
  - Image-based event creation
- **Best For**: Calendar automation, scheduling coordination
- **[Documentation](./google-calendar-mcp/README.md)**

---

## 🏗️ **Architecture**

### **Unified Storage Layer**
All servers use the [@sizzek/mcp-data](https://github.com/Drakosfire/mcp-data) package for:
- **Multi-backend storage** (JSON, MongoDB)
- **User isolation** and multi-tenant security
- **Encryption** for sensitive data
- **Consistent APIs** across all servers

### **Security Architecture**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Server    │    │  Storage Layer  │    │   Data Store    │
│                 │    │                 │    │                 │
│ • Input Valid.  │───▶│ • User Isolation│───▶│ • Encrypted     │
│ • Rate Limiting │    │ • Tenant Scope  │    │ • Validated     │
│ • Auth Checks   │    │ • Data Encrypt. │    │ • Backed Up     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **LibreChat Integration Flow**
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ LibreChat   │───▶│ MCP Server  │───▶│ Storage     │───▶│ External    │
│ User Input  │    │ Processing  │    │ Layer       │    │ APIs        │
│             │◀───│             │◀───│             │◀───│             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+ with npm
- [LibreChat](https://github.com/danny-avila/LibreChat) installation
- MongoDB (for production storage) or file system access

### **Installation**

#### **Option 1: Individual Server Setup**
```bash
# Clone the ecosystem
git clone https://github.com/your-org/sizzek-mcp-ecosystem.git
cd sizzek-mcp-ecosystem/mcp-servers

# Choose a server (e.g., todoodles)
cd todoodles
npm install
npm run build

# Configure LibreChat (see individual server docs)
```

#### **Option 2: Full Ecosystem Deploy**
```bash
# Use the deployment script
./deploy-mcp-servers.sh

# This will:
# - Install all dependencies
# - Build all servers  
# - Configure environment files
# - Set up MongoDB connections
# - Generate sample LibreChat configs
```

### **LibreChat Configuration**
Add to your `librechat.yaml`:

```yaml
mcpServers:
  todoodles:
    type: stdio
    command: node
    args: ["/path/to/mcp-servers/todoodles/dist/index.js"]
    env:
      MONGODB_CONNECTION_STRING: "mongodb://localhost:27017"
      MONGODB_DATABASE: "sizzek_mcp"
      STORAGE_TYPE: "mongodb"
      USER_ID: "user123"
      TENANT_ID: "tenant123"
    timeout: 30000
    
  memory:
    type: stdio
    command: node  
    args: ["/path/to/mcp-servers/memory/dist/index.js"]
    env:
      MONGODB_CONNECTION_STRING: "mongodb://localhost:27017"
      MONGODB_DATABASE: "sizzek_mcp"
      STORAGE_TYPE: "mongodb"
    timeout: 30000
```

---

## 🔒 **Security & Best Practices**

### **Environment Configuration**
```bash
# Required for all servers
MONGODB_CONNECTION_STRING=mongodb://localhost:27017
MONGODB_DATABASE=sizzek_mcp
STORAGE_TYPE=mongodb  # or 'json' for file-based storage
USER_ID=unique_user_identifier
TENANT_ID=tenant_organization_id

# Server-specific variables
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
GOOGLE_OAUTH_CREDENTIALS=/path/to/google-credentials.json
```

### **Security Features**
- **🔐 User Isolation**: Every data operation scoped to user/tenant
- **🛡️ Input Validation**: All inputs sanitized and validated
- **🔒 Encryption**: Sensitive data encrypted at rest
- **⚡ Rate Limiting**: Protection against abuse
- **📝 Audit Logging**: Comprehensive operation tracking

### **Production Considerations**
1. **Database Security**: Use MongoDB authentication and TLS
2. **Environment Variables**: Never commit secrets to version control
3. **Network Security**: Run servers in isolated containers
4. **Monitoring**: Enable comprehensive logging and metrics
5. **Backup Strategy**: Regular data backups with encryption

---

## 📊 **Monitoring & Observability**

### **Built-in Logging**
All servers include:
- **Structured logging** with timestamps and correlation IDs
- **Request/response tracking** for debugging
- **Error logging** with stack traces
- **Performance metrics** for operation timing

### **Health Checks**
```bash
# Check server health
curl -X POST http://localhost:3000/health

# Monitor storage connections
node -e "const { StorageFactory } = require('@sizzek/mcp-data'); console.log('Storage OK');"
```

### **Debugging**
```bash
# Enable debug logging
export DEBUG=mcp:*
npm start

# Check storage connectivity
node debug-storage-connection.js
```

---

## 🧪 **Testing**

### **Run Tests**
```bash
# Individual server tests
cd mcp-servers/todoodles
npm test

# Full ecosystem tests
npm run test:all

# Integration tests with LibreChat
npm run test:integration
```

### **Test Coverage**
- Unit tests for all MCP tools
- Integration tests with storage layer
- End-to-end tests with LibreChat
- Security penetration testing
- Performance benchmarking

---

## 🤝 **Contributing**

### **Development Setup**
```bash
# Clone and setup
git clone <repo-url>
cd mcp-servers
npm install

# Install @sizzek/mcp-data package
npm install @sizzek/mcp-data

# Build all servers
npm run build:all
```

### **Adding New Servers**
1. **Create server directory**: `mkdir mcp-servers/your-server`
2. **Use template**: Copy from `mcp-servers/todoodles` as a starting point
3. **Install dependencies**: Including `@sizzek/mcp-data`
4. **Follow patterns**: Use StorageFactory for data persistence
5. **Add tests**: Comprehensive test coverage required
6. **Update documentation**: Add to this README and create server-specific docs

### **Code Standards**
- **TypeScript**: Strict mode with comprehensive types
- **ESLint**: Consistent code formatting
- **Security**: Follow security-first development principles
- **Testing**: 100% test coverage for new features
- **Documentation**: Comprehensive inline and external docs

---

## 📚 **Documentation**

### **Individual Server Docs**
- [**Todoodles**](./todoodles/README.md) - Task management with priorities and categories
- [**Memory**](./memory/README.md) - Knowledge graph storage system
- [**Scheduled Tasks**](./scheduled-tasks/README.md) - Cron-like automation
- [**Twilio SMS**](./twilio-sms/README.md) - SMS messaging integration
- [**Gmail**](./Gmail-MCP-Server/README.md) - Email management
- [**Google Calendar**](./google-calendar-mcp/README.md) - Calendar integration

### **Architecture Documentation**
- [**Storage Architecture**](https://github.com/Drakosfire/mcp-data) - @sizzek/mcp-data package
- [**Security Guide**](../rules/security/) - Security implementation details
- [**Deployment Guide**](../deploy-mcp-servers.sh) - Production deployment
- [**LibreChat Integration**](../Docs/LibreChat/) - Integration examples

---

## 🔗 **Related Projects**

- **[@sizzek/mcp-data](https://github.com/Drakosfire/mcp-data)** - Unified storage abstraction
- **[LibreChat](https://github.com/danny-avila/LibreChat)** - Open-source ChatGPT alternative
- **[Model Context Protocol](https://modelcontextprotocol.io/)** - MCP specification

---

## 📄 **License**

MIT License - see individual server LICENSE files for details.

---

## 🆘 **Support**

- **📋 Issues**: [GitHub Issues](https://github.com/your-org/sizzek-mcp-ecosystem/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/your-org/sizzek-mcp-ecosystem/discussions)
- **📧 Contact**: Open an issue for support requests

---

## 🏆 **Success Stories**

> *"The MCP server ecosystem transformed our LibreChat deployment. The unified storage layer and security-first design made integration seamless."* - Production User

> *"Having standardized storage across all MCP servers eliminated data silos and simplified our architecture."* - Enterprise Team

---

**Ready to extend your AI capabilities?** Choose a server above and follow its documentation to get started! 🚀 