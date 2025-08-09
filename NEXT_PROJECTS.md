# DungeonMind Next Projects
**Strategic Development Roadmap**

*Last Updated: December 2024*

---

## 🎯 Core Infrastructure & Architecture

### 1. Sizzek Container Development
**Status**: Planning  
**Priority**: High  

Create a dedicated containerized service for Sizzek and related processes to separate SMS/communication functionality from the core DungeonMind services.

**Key Components:**
- New Docker container for Sizzek service
- Dedicated FastAPI application
- Independent deployment pipeline
- Service discovery integration

### 2. Twilio Router Migration
**Status**: Planning  
**Priority**: High  
**Dependencies**: Sizzek Container

Migrate the existing Twilio SMS router from DungeonMindServer to the new Sizzek project for better separation of concerns.

**Migration Tasks:**
- Extract SMS router from `DungeonMindServer/sms/sms_router.py`
- Port authentication and session handling
- Update service endpoints and routing
- Test SMS functionality in new environment

### 3. CI/CD Pipeline Implementation
**Status**: Planning  
**Priority**: High  

Establish proper continuous integration and deployment pipeline to reduce deployment headaches and enable faster iteration on new ideas.

**Pipeline Requirements:**
- Automated testing for all services
- Docker image building and registry
- Staging environment deployment
- Production deployment with rollback capability
- Environment variable management
- Health check integration

---

## 🔧 Service Modernization

### 4. Statblock Generator Rebuild
**Status**: Planning  
**Priority**: Medium  

Fully rebuild the Statblock Generator as a proper extension of the DungeonMind ecosystem, applying lessons learned from CardGenerator and other services.

**Rebuild Goals:**
- Integration with global authentication system
- Unified UI components using Mantine
- Project-based organization
- AI-powered generation with fallbacks
- Export/sharing capabilities

### 5. StoreGenerator Modernization
**Status**: Planning  
**Priority**: Medium  

Revisit and rebuild StoreGenerator incorporating lessons learned from other service implementations.

**Modernization Focus:**
- Apply current architecture patterns
- Integrate with global storage system
- Improve AI generation quality
- Enhanced user experience
- Better project management

### 6. Shared Components Analysis & Optimization
**Status**: Planning  
**Priority**: Medium  

Identify shared components and patterns across projects to optimize code reuse and move towards config-driven design.

**Analysis Scope:**
- **UI Components**: Common Mantine components used across services
- **Authentication Logic**: Shared auth patterns and implementations
- **AI Integration**: Common prompt handling, validation, and fallback patterns
- **Data Models**: Shared schemas and validation logic
- **Configuration**: Environment variables, API endpoints, service configs

**Optimization Goals:**
- **Component Library**: Extract reusable UI components to dungeonmind-shared
- **Config-Driven Design**: Replace hardcoded values with configurable parameters
- **Service Templates**: Create standardized templates for new services
- **Shared Utilities**: Centralize common functionality (logging, error handling, etc.)
- **API Standards**: Standardize request/response patterns across services

**Implementation Strategy:**
1. **Audit Phase**: Catalog all shared patterns and duplicated code
2. **Extraction Phase**: Move common components to shared libraries
3. **Standardization Phase**: Implement config-driven patterns
4. **Template Creation**: Build service templates and generators
5. **Migration Phase**: Update existing services to use shared components

---

## 📊 Data & Storage

### 7. Global Storage System Migration
**Status**: Planning  
**Priority**: Medium  

Bring all services under the unified global storage system for consistent data management and user experience.

**Migration Scope:**
- Standardize data schemas across services
- Implement unified project management
- Migrate existing data safely
- Update service APIs for consistency
- Ensure data privacy and security

---

## 🗂️ Repository Management & Organization

### Repository Organization Strategy
**Status**: Planning  
**Priority**: High  

Establish better organization across multiple repositories while maintaining separation of concerns. Use git organizational structures to coordinate related projects without forcing them into a monorepo.

**Proposed Repository Structure:**
```
DungeonMind Organization/
├── dungeonmind-core/           # Main coordination repo
│   ├── docs/                   # Cross-project documentation
│   ├── infrastructure/         # Shared deployment configs
│   ├── scripts/                # Multi-repo management scripts
│   └── shared-configs/         # Common configuration templates
├── dungeonmind-server/         # Central API & Auth Server (FastAPI)
├── dungeonmind-frontend/       # Unified React Frontend (LandingPage)
├── sizzek/                     # SMS & Communication Service
├── dungeonmind-cardgen/        # Card Generation Service
├── dungeonmind-stores/         # Store Generation Service
├── dungeonmind-rules/          # D&D Rules Assistant
├── dungeonmind-statblocks/     # Creature Statblock Service
└── dungeonmind-shared/         # Shared libraries & components
    ├── auth-lib/               # Common authentication logic
    ├── schemas/                # Shared data models
    └── ui-components/          # Reusable UI components
```

**Git Organization Options:**
1. **Git Submodules**: Include related repos as submodules in dungeonmind-core
2. **GitHub/GitLab Organizations**: Group repositories under DungeonMind organization
3. **Coordinated Releases**: Use tags and releases across repos with shared versioning
4. **Documentation Links**: Cross-reference between repos in README files

**Management Benefits:**
- **Repository Autonomy**: Each service maintains its own repo and deployment
- **Coordinated Development**: Shared documentation and standards
- **Flexible CI/CD**: Each repo can have its own pipeline while sharing configs
- **Code Sharing**: Dedicated shared libraries repo for common functionality
- **Independent Scaling**: Services can evolve at their own pace

**Organization Strategy:**
1. **Phase 1**: Create GitHub/GitLab organization for DungeonMind
2. **Phase 2**: Establish dungeonmind-core for coordination and docs
3. **Phase 3**: Create dungeonmind-shared for common libraries
4. **Phase 4**: Rename/reorganize existing repos under consistent naming
5. **Phase 5**: Set up cross-repo coordination workflows

---

## 🤖 Developer Tools & Ideas

### 8. MCP Server Ideas Storage System
**Status**: Planning  
**Priority**: Medium  

Create a better system for storing and organizing MCP (Model Context Protocol) server ideas and implementations.

**System Features:**
- Centralized idea repository
- Categorization and tagging
- Implementation status tracking
- Code snippet storage
- Collaboration tools
- Integration examples
- Documentation templates

**Potential Structure:**
```
mcp-ideas/
├── servers/
│   ├── implemented/
│   ├── in-progress/
│   └── planned/
├── protocols/
├── examples/
└── documentation/
```

---

## 📅 Implementation Strategy

### Phase 1: Infrastructure (Q1 2025)
- Sizzek Container + Twilio Migration
- CI/CD Pipeline Setup
- MCP Ideas Storage System

### Phase 2: Service Modernization (Q2 2025)
- Statblock Generator Rebuild
- StoreGenerator Modernization

### Phase 3: Unification (Q3 2025)
- Global Storage System Migration
- Cross-service integration improvements

---

## 🎯 Success Metrics

- **Deployment Time**: Reduce from hours to minutes
- **Service Reliability**: >99.9% uptime across all services
- **Development Velocity**: Faster feature iteration
- **Code Quality**: Unified patterns and standards
- **User Experience**: Seamless cross-service workflows

---

## 📝 Notes

- All new services should follow the established DungeonMind architecture patterns
- Maintain backward compatibility during migrations where possible
- Document architectural decisions in ADRs
- Focus on user workflows over technical perfectionism
- Prioritize shipping over extensive planning

---

*This document should be updated as priorities shift and projects are completed.*