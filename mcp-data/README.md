# Sizzek MCP Data Storage

**Independent storage abstraction layer for MCP servers with user isolation and encryption support**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/sizzek/mcp-data)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)

## 🎯 Overview

The Sizzek MCP Data project provides a robust, independent storage abstraction layer for Model Context Protocol (MCP) servers. Originally developed for SMS user management in LibreChat integration, it's designed to work with any MCP host while providing user isolation, encryption, and multiple storage backends.

### Key Features

- **🔒 User Isolation**: Each user gets their own data sandbox
- **🔐 Encryption**: Built-in AES-256-CTR encryption for sensitive data
- **🗄️ Multiple Backends**: JSON files and MongoDB support
- **⚡ LibreChat Compatible**: Seamless integration with LibreChat's encryption system
- **🏗️ Independent**: Works with any MCP host, not tied to specific platforms
- **📊 Health Monitoring**: Built-in health checks and statistics
- **🔄 Migration Support**: Easy data migration between storage types

## 🚀 Quick Start

### Installation

```bash
# In your MCP server project
npm install @sizzek/mcp-data

# Or with yarn
yarn add @sizzek/mcp-data
```

### Basic Usage

```typescript
import { StorageFactory } from '@sizzek/mcp-data';

// Create user-isolated storage
const storage = StorageFactory.createFromEnvironment(defaultData);

// Save data for a specific user (e.g., phone number for SMS)
await storage.saveForUser('+1234567890', userData);

// Load data for that user
const data = await storage.loadForUser('+1234567890');
```

## 📋 Storage Types

### JSON File Storage
Perfect for development and small deployments:

```typescript
import { StorageFactory } from '@sizzek/mcp-data';

const storage = StorageFactory.createUserStorage({
  type: 'json',
  json: {
    baseDir: './storage',
    backupEnabled: true
  }
}, defaultData);
```

### MongoDB Storage
Production-ready with encryption:

```typescript
import { StorageFactory } from '@sizzek/mcp-data';

const storage = StorageFactory.createUserStorage({
  type: 'mongodb',
  mongodb: {
    connectionString: 'mongodb://localhost:27017/mcp-data',
    collectionName: 'user_data'
  },
  encryptionKey: process.env.ENCRYPTION_KEY
}, defaultData);
```

## 🔐 Secure API Key Storage

For sensitive data like API credentials:

```typescript
import { StorageFactory } from '@sizzek/mcp-data';

// Create encrypted storage
const credentialsStorage = StorageFactory.createEncryptedFromEnvironment({
  clientId: '',
  clientSecret: '',
  accessToken: ''
});

// Store encrypted credentials per user
await credentialsStorage.saveEncrypted(userId, {
  clientId: 'google-client-id',
  clientSecret: 'google-client-secret',
  accessToken: 'oauth-token'
});

// Retrieve and decrypt
const creds = await credentialsStorage.loadDecrypted(userId);
```

## 🔧 Environment Configuration

Set these environment variables for automatic configuration:

```bash
# Storage type selection
MCP_STORAGE_TYPE=mongodb          # or 'json'

# MongoDB configuration
MONGODB_CONNECTION_STRING=mongodb://localhost:27017/mcp-data
MONGODB_DATABASE=mcp-data
MONGODB_COLLECTION=user_storage

# JSON configuration (fallback)
MCP_STORAGE_PATH=./storage_files

# Encryption (compatible with LibreChat)
CREDS_KEY=your-64-character-hex-encryption-key
# or
MCP_ENCRYPTION_KEY=your-encryption-key
```

## 📊 Database Architecture

### Separate Database Strategy
The system uses a dedicated `mcp-data` database, separate from your main application:

```
MongoDB Instance
├── your-main-app/           # Your main application database
│   └── ... (existing collections)
└── mcp-data/               # MCP data storage (isolated)
    ├── user_memory/            # Knowledge graphs per user
    ├── user_todos/             # Todo lists per user
    ├── scheduled_tasks/        # Scheduled events per user
    ├── api_credentials/        # Encrypted API keys per user
    └── [custom collections]
```

### Benefits of Separation
- **Clear boundaries** between main app and MCP data
- **Independent scaling** and backup strategies
- **Easier maintenance** and troubleshooting
- **Security isolation** for sensitive MCP data

## 🏗️ LibreChat Integration

### Compatible with LibreChat Encryption
The system automatically uses LibreChat's `CREDS_KEY` when available:

```typescript
// Automatically uses LibreChat's encryption system
const storage = StorageFactory.createForLibreChat(
  'user_memory',      // collection name
  defaultData,        // default data structure
  true               // enable encryption
);
```

### Environment Variables for LibreChat
```yaml
# In librechat.yaml
mcpServers:
  memory:
    env:
      MCP_STORAGE_TYPE: "mongodb"
      MCP_USER_ID: "${USER_ID}"  # LibreChat passes phone number
      MONGODB_CONNECTION_STRING: "mongodb://mongodb:27017/mcp-data"
      CREDS_KEY: "${CREDS_KEY}"  # LibreChat's encryption key
```

## 📝 Example: SMS User Memory System

```typescript
import { StorageFactory } from '@sizzek/mcp-data';

interface UserMemory {
  entities: Array<{name: string, type: string, facts: string[]}>;
  conversations: string[];
  preferences: Record<string, any>;
}

class SMSMemoryManager {
  private storage: UserStorageInterface<UserMemory>;

  constructor() {
    this.storage = StorageFactory.createFromEnvironment({
      entities: [],
      conversations: [],
      preferences: {}
    });
  }

  async rememberFact(phoneNumber: string, fact: string) {
    const memory = await this.storage.loadForUser(phoneNumber);
    
    // Process and store the fact
    memory.entities.push({
      name: extractEntityName(fact),
      type: 'user_fact',
      facts: [fact]
    });
    
    await this.storage.saveForUser(phoneNumber, memory);
  }

  async getMemoryForUser(phoneNumber: string): Promise<UserMemory> {
    return await this.storage.loadForUser(phoneNumber);
  }
}
```

## 🔒 Security Best Practices

### ✅ Safe for Production
- **Encrypted storage** using AES-256-CTR
- **Per-user encryption** with unique IVs
- **Key rotation** support
- **No plaintext sensitive data**

### ❌ Never Do This
- Don't send API keys over SMS
- Don't store encryption keys in code
- Don't use the same database for all data types
- Don't skip user isolation

### 🛡️ Recommended Flow for API Keys
<!-- This needs to be built into DungeonMind -->
```
1. SMS: "To use Google Products, visit: "
2. User completes OAuth in browser
3. System stores encrypted tokens in database
4. SMS: "✅ Google Calendar access configured!"
```

## 🧪 Testing

```typescript
import { StorageFactory } from '@sizzek/mcp-data';

// Create test storage (temporary)
const testStorage = StorageFactory.createTestStorage(defaultData);

// Your tests here
await testStorage.saveForUser('test-user', testData);
const retrieved = await testStorage.loadForUser('test-user');
```

## 📈 Monitoring and Health

```typescript
// Health check
const isHealthy = await storage.healthCheck();

// Get statistics
const stats = await storage.getStats();
console.log(`Total users: ${stats.totalUsers}`);
console.log(`Storage size: ${stats.totalSize} bytes`);

// Cleanup old data
await storage.cleanup();
```

## 🔄 Migration

### From JSON to MongoDB
```typescript
import { StorageFactory } from '@sizzek/mcp-data';

const jsonStorage = StorageFactory.createUserStorage({
  type: 'json',
  json: { baseDir: './old-storage' }
}, defaultData);

const mongoStorage = StorageFactory.createUserStorage({
  type: 'mongodb',
  mongodb: { 
    connectionString: 'mongodb://localhost:27017/mcp-data',
    collectionName: 'migrated_data'
  }
}, defaultData);

// Migrate all users
const users = await jsonStorage.listUsers();
for (const userId of users) {
  const data = await jsonStorage.loadForUser(userId);
  await mongoStorage.saveForUser(userId, data);
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by LibreChat's robust encryption system
- Built for the SMS integration project
- Designed with MCP server developers in mind

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/sizzek/mcp-data/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sizzek/mcp-data/discussions)
- **Documentation**: [Full Documentation](https://github.com/sizzek/mcp-data/wiki) 