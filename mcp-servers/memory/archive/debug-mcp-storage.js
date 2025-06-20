#!/usr/bin/env node

/**
 * MCP Memory Server Storage Debugging Tool
 * 
 * This script helps diagnose why the MCP memory server isn't storing data to MongoDB.
 * It provides real-time monitoring and step-by-step verification of the storage pipeline.
 */

import { MongoClient } from 'mongodb';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'LibreChat';
const COLLECTION_NAME = 'mcp_storage';

class MCPStorageDebugger {
    constructor() {
        this.client = null;
        this.db = null;
        this.collection = null;
        this.isMonitoring = false;
    }

    async connect() {
        try {
            console.log(`🔌 Connecting to MongoDB: ${MONGODB_URI}`);
            this.client = new MongoClient(MONGODB_URI);
            await this.client.connect();
            this.db = this.client.db(DATABASE_NAME);
            this.collection = this.db.collection(COLLECTION_NAME);
            console.log(`✅ Connected to database: ${DATABASE_NAME}.${COLLECTION_NAME}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to MongoDB:', error.message);
            return false;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            console.log('🔌 Disconnected from MongoDB');
        }
    }

    async checkEnvironmentVariables() {
        console.log('\n🔧 Checking Environment Variables...');

        const requiredVars = [
            'MCP_STORAGE_TYPE',
            'MCP_USER_BASED',
            'MONGODB_CONNECTION_STRING',
            'MONGODB_DATABASE',
            'MONGODB_COLLECTION'
        ];

        const mcpServerPath = '../memory';
        const librechatConfigPath = '../../librechat.yaml';

        // Check if MCP server files exist
        try {
            const memoryIndexExists = await fs.access(path.join(mcpServerPath, 'dist/index.js')).then(() => true).catch(() => false);
            const memoryPackageExists = await fs.access(path.join(mcpServerPath, 'package.json')).then(() => true).catch(() => false);

            console.log(`📁 MCP Memory Server files:`);
            console.log(`  - dist/index.js: ${memoryIndexExists ? '✅' : '❌'}`);
            console.log(`  - package.json: ${memoryPackageExists ? '✅' : '❌'}`);

            // Check librechat.yaml configuration
            const configExists = await fs.access(librechatConfigPath).then(() => true).catch(() => false);
            console.log(`📁 LibreChat config: ${configExists ? '✅' : '❌'}`);

            if (configExists) {
                const config = await fs.readFile(librechatConfigPath, 'utf-8');
                const hasMemoryServer = config.includes('memory:');
                const hasMongoDBConfig = config.includes('MONGODB_CONNECTION_STRING');
                const hasUserBased = config.includes('MCP_USER_BASED');

                console.log(`📋 LibreChat config analysis:`);
                console.log(`  - Has memory server: ${hasMemoryServer ? '✅' : '❌'}`);
                console.log(`  - Has MongoDB config: ${hasMongoDBConfig ? '✅' : '❌'}`);
                console.log(`  - Has user-based config: ${hasUserBased ? '✅' : '❌'}`);
            }

        } catch (error) {
            console.error('❌ Error checking MCP server files:', error.message);
        }

        // Check current process environment
        console.log(`\n🌍 Current Process Environment:`);
        requiredVars.forEach(varName => {
            const value = process.env[varName];
            console.log(`  - ${varName}: ${value ? '✅' : '❌'} ${value ? `(${value})` : '(not set)'}`);
        });
    }

    async checkMongoDBStatus() {
        console.log('\n🔍 Checking MongoDB Status...');

        try {
            // Check server status
            const serverStatus = await this.db.admin().serverStatus();
            console.log(`✅ MongoDB Server Version: ${serverStatus.version}`);
            console.log(`✅ MongoDB Uptime: ${Math.round(serverStatus.uptime / 60)} minutes`);

            // Check database
            const stats = await this.db.stats();
            console.log(`✅ Database '${DATABASE_NAME}' - Collections: ${stats.collections}, Size: ${Math.round(stats.dataSize / 1024)} KB`);

            // List all collections
            const collections = await this.db.listCollections().toArray();
            console.log(`📁 Available collections (${collections.length}):`);
            collections.forEach(col => {
                console.log(`  - ${col.name}`);
            });

            // Check specific collection
            const collectionExists = collections.some(c => c.name === COLLECTION_NAME);
            if (collectionExists) {
                const count = await this.collection.countDocuments();
                console.log(`📊 Collection '${COLLECTION_NAME}': ${count} documents`);
            } else {
                console.log(`❌ Collection '${COLLECTION_NAME}' does not exist`);
            }

        } catch (error) {
            console.error('❌ MongoDB status check failed:', error.message);
        }
    }

    async startRealTimeMonitoring() {
        console.log('\n👁️  Starting Real-Time Storage Monitoring...');
        console.log('   Watching for changes in mcp_storage collection...');
        console.log('   Press Ctrl+C to stop monitoring\n');

        this.isMonitoring = true;
        let lastCount = await this.collection.countDocuments();
        let lastUpdate = new Date();

        const monitorInterval = setInterval(async () => {
            if (!this.isMonitoring) {
                clearInterval(monitorInterval);
                return;
            }

            try {
                const currentCount = await this.collection.countDocuments();

                if (currentCount !== lastCount) {
                    console.log(`📈 Document count changed: ${lastCount} → ${currentCount} (${currentCount > lastCount ? '+' : ''}${currentCount - lastCount})`);

                    // Show recent documents
                    const recentDocs = await this.collection.find({
                        'metadata.updatedAt': { $gt: lastUpdate }
                    }).sort({ 'metadata.updatedAt': -1 }).limit(3).toArray();

                    recentDocs.forEach(doc => {
                        console.log(`   📄 New/Updated: User ${doc.userId}, ${doc.data.entities?.length || 0} entities`);
                    });

                    lastCount = currentCount;
                    lastUpdate = new Date();
                } else {
                    // Show heartbeat every 30 seconds
                    if (Date.now() % 30000 < 5000) {
                        console.log(`💓 Monitoring... (${currentCount} documents, ${new Date().toLocaleTimeString()})`);
                    }
                }
            } catch (error) {
                console.error('❌ Monitoring error:', error.message);
            }
        }, 5000);

        // Handle Ctrl+C
        process.on('SIGINT', () => {
            console.log('\n🛑 Stopping monitoring...');
            this.isMonitoring = false;
            clearInterval(monitorInterval);
            this.disconnect();
            process.exit(0);
        });
    }

    async testDirectStorageOperations() {
        console.log('\n🧪 Testing Direct Storage Operations...');

        const testData = {
            userId: 'debug-test-user',
            data: {
                entities: [
                    {
                        name: 'Debug-Test-Entity',
                        entityType: 'TestType',
                        observations: ['This is a debug test entity']
                    }
                ],
                relations: []
            },
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                source: 'debug-test',
                entityCount: 1,
                relationCount: 0
            }
        };

        try {
            // Test 1: Direct insertion
            console.log('🔬 Test 1: Direct document insertion...');
            const insertResult = await this.collection.insertOne(testData);
            console.log(`✅ Direct insertion successful: ${insertResult.insertedId}`);

            // Test 2: Retrieval
            console.log('🔬 Test 2: Document retrieval...');
            const retrieved = await this.collection.findOne({ userId: 'debug-test-user' });
            console.log(`✅ Retrieval successful: ${retrieved ? 'Found' : 'Not found'}`);

            // Test 3: Update operation
            console.log('🔬 Test 3: Document update...');
            const updateResult = await this.collection.updateOne(
                { userId: 'debug-test-user' },
                { $set: { 'metadata.updated': true, 'metadata.updatedAt': new Date() } }
            );
            console.log(`✅ Update successful: ${updateResult.modifiedCount} documents modified`);

            // Test 4: Cleanup
            console.log('🔬 Test 4: Document cleanup...');
            const deleteResult = await this.collection.deleteOne({ userId: 'debug-test-user' });
            console.log(`✅ Cleanup successful: ${deleteResult.deletedCount} documents deleted`);

            console.log('✅ All direct storage operations working correctly');

        } catch (error) {
            console.error('❌ Direct storage test failed:', error.message);
        }
    }

    async simulateMCPServerFlow() {
        console.log('\n🎭 Simulating MCP Server Data Flow...');

        // Simulate the exact flow that should happen in the MCP server
        const userId = '+1234567890';
        const scenario = {
            name: 'MCP-Simulation',
            data: {
                entities: [
                    {
                        name: 'Simulated-Entity',
                        entityType: 'Simulation',
                        observations: ['This entity was created by MCP server simulation']
                    }
                ],
                relations: []
            }
        };

        try {
            console.log(`🎯 Simulating MCP flow for user: ${userId}`);

            // Step 1: Check if user graph exists (like MCP server would)
            console.log('🔍 Step 1: Checking for existing user graph...');
            let existingGraph = await this.collection.findOne({ userId });
            console.log(`   Result: ${existingGraph ? 'Found existing graph' : 'No existing graph'}`);

            // Step 2: Create or update graph (like MCP server would)
            console.log('📝 Step 2: Creating/updating graph...');
            if (existingGraph) {
                // Update existing
                existingGraph.data.entities.push(...scenario.data.entities);
                existingGraph.metadata.updatedAt = new Date();
                existingGraph.metadata.entityCount = existingGraph.data.entities.length;

                const updateResult = await this.collection.replaceOne(
                    { userId },
                    existingGraph
                );
                console.log(`   Result: Updated existing graph (${updateResult.modifiedCount} documents)`);
            } else {
                // Create new
                const newGraph = {
                    userId,
                    data: scenario.data,
                    metadata: {
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        source: 'mcp-server-simulation',
                        entityCount: scenario.data.entities.length,
                        relationCount: scenario.data.relations.length
                    }
                };

                const insertResult = await this.collection.insertOne(newGraph);
                console.log(`   Result: Created new graph (${insertResult.insertedId})`);
            }

            // Step 3: Verify the operation
            console.log('✅ Step 3: Verifying storage...');
            const finalGraph = await this.collection.findOne({ userId });
            if (finalGraph) {
                console.log(`   ✅ Graph verified: ${finalGraph.data.entities.length} entities total`);

                // Find our simulated entity
                const simulatedEntity = finalGraph.data.entities.find(e => e.name === 'Simulated-Entity');
                console.log(`   ✅ Simulated entity found: ${simulatedEntity ? 'Yes' : 'No'}`);
            } else {
                console.log(`   ❌ Graph not found after operation`);
            }

            // Cleanup
            await this.collection.deleteOne({
                userId,
                'metadata.source': 'mcp-server-simulation'
            });
            console.log('🧹 Cleanup completed');

        } catch (error) {
            console.error('❌ MCP server simulation failed:', error.message);
        }
    }

    async analyzeLibreChatIntegration() {
        console.log('\n🔗 Analyzing LibreChat Integration...');

        try {
            // Check if LibreChat users exist
            const usersCollection = this.db.collection('users');
            const smsUsers = await usersCollection.find({ provider: 'sms' }).toArray();
            console.log(`📱 SMS users in LibreChat: ${smsUsers.length}`);

            smsUsers.forEach(user => {
                console.log(`   - ${user.phoneNumber || user.username}: ${user._id}`);
            });

            // Check conversations with metadata
            const conversationsCollection = this.db.collection('conversations');
            const smsConversations = await conversationsCollection.find({
                'metadata.source': 'sms'
            }).toArray();
            console.log(`💬 SMS conversations: ${smsConversations.length}`);

            // Check for MCP tool usage in messages
            const messagesCollection = this.db.collection('messages');
            const mcpMessages = await messagesCollection.find({
                $or: [
                    { 'content': { $regex: /memory|remember|entity/i } },
                    { 'toolCalls': { $exists: true } }
                ]
            }).limit(5).toArray();
            console.log(`🛠️  Messages potentially using MCP tools: ${mcpMessages.length}`);

            // Show recent activity
            const recentMessages = await messagesCollection.find({
                createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }).sort({ createdAt: -1 }).limit(3).toArray();

            console.log(`📊 Recent messages (last 24h): ${recentMessages.length}`);
            recentMessages.forEach((msg, i) => {
                console.log(`   ${i + 1}. ${msg.role}: ${msg.content?.substring(0, 50)}...`);
            });

        } catch (error) {
            console.error('❌ LibreChat integration analysis failed:', error.message);
        }
    }

    async generateReport() {
        console.log('\n📊 Generating Diagnostic Report...');

        const report = {
            timestamp: new Date().toISOString(),
            mongodb: {
                connected: !!this.client,
                database: DATABASE_NAME,
                collection: COLLECTION_NAME
            },
            collections: [],
            documents: 0,
            issues: [],
            recommendations: []
        };

        try {
            // Get collection info
            const collections = await this.db.listCollections().toArray();
            report.collections = collections.map(c => c.name);

            if (collections.some(c => c.name === COLLECTION_NAME)) {
                report.documents = await this.collection.countDocuments();
            }

            // Identify issues
            if (!report.collections.includes(COLLECTION_NAME)) {
                report.issues.push('MCP storage collection does not exist');
                report.recommendations.push('Check if MCP server is configured and running');
            }

            if (report.documents === 0) {
                report.issues.push('No documents in MCP storage collection');
                report.recommendations.push('Verify MCP server is receiving and processing requests');
                report.recommendations.push('Check LibreChat logs for MCP tool calls');
            }

            // Environment issues
            if (!process.env.MCP_STORAGE_TYPE) {
                report.issues.push('MCP_STORAGE_TYPE environment variable not set');
                report.recommendations.push('Set MCP_STORAGE_TYPE=mongodb in LibreChat configuration');
            }

            console.log('\n📋 DIAGNOSTIC REPORT');
            console.log('==================');
            console.log(`Timestamp: ${report.timestamp}`);
            console.log(`MongoDB Connected: ${report.mongodb.connected ? '✅' : '❌'}`);
            console.log(`Collections Found: ${report.collections.length}`);
            console.log(`MCP Documents: ${report.documents}`);

            if (report.issues.length > 0) {
                console.log('\n🚨 Issues Found:');
                report.issues.forEach((issue, i) => {
                    console.log(`  ${i + 1}. ${issue}`);
                });
            }

            if (report.recommendations.length > 0) {
                console.log('\n💡 Recommendations:');
                report.recommendations.forEach((rec, i) => {
                    console.log(`  ${i + 1}. ${rec}`);
                });
            }

            // Save report to file
            const reportPath = './mcp-storage-diagnostic-report.json';
            await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
            console.log(`\n💾 Report saved to: ${reportPath}`);

        } catch (error) {
            console.error('❌ Report generation failed:', error.message);
        }
    }
}

// CLI interface
async function main() {
    const diagnostic = new MCPStorageDebugger();

    const command = process.argv[2] || 'full';

    try {
        const connected = await diagnostic.connect();
        if (!connected) {
            process.exit(1);
        }

        switch (command) {
            case 'monitor':
                await diagnostic.startRealTimeMonitoring();
                break;

            case 'test':
                await diagnostic.testDirectStorageOperations();
                break;

            case 'simulate':
                await diagnostic.simulateMCPServerFlow();
                break;

            case 'analyze':
                await diagnostic.analyzeLibreChatIntegration();
                break;

            case 'report':
                await diagnostic.generateReport();
                break;

            case 'full':
            default:
                console.log('🚀 Starting Full MCP Storage Diagnostic\n');
                await diagnostic.checkEnvironmentVariables();
                await diagnostic.checkMongoDBStatus();
                await diagnostic.testDirectStorageOperations();
                await diagnostic.simulateMCPServerFlow();
                await diagnostic.analyzeLibreChatIntegration();
                await diagnostic.generateReport();
                break;
        }

    } catch (error) {
        console.error('❌ Diagnostic failed:', error);
    } finally {
        if (command !== 'monitor') {
            await diagnostic.disconnect();
        }
    }
}

// Show usage if called with --help
if (process.argv.includes('--help')) {
    console.log(`
MCP Storage Debugger Usage:

  node debug-mcp-storage.js [command]

Commands:
  full     - Run complete diagnostic (default)
  monitor  - Real-time monitoring of storage changes
  test     - Test direct MongoDB operations
  simulate - Simulate MCP server data flow
  analyze  - Analyze LibreChat integration
  report   - Generate diagnostic report only

Examples:
  node debug-mcp-storage.js
  node debug-mcp-storage.js monitor
  node debug-mcp-storage.js test
`);
    process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { MCPStorageDebugger }; 