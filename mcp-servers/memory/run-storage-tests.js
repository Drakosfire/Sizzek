#!/usr/bin/env node

/**
 * MCP Memory Server Storage Test Runner
 * 
 * This script runs comprehensive tests for the MCP memory server MongoDB integration.
 * It helps identify why data isn't being stored and provides debugging information.
 */

import { MCPStorageTest } from './test-mongodb-storage.js';
import { MCPStorageDebugger } from './debug-mcp-storage.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// NEW: MCP Server Request Logger
class MCPServerRequestLogger extends EventEmitter {
    constructor() {
        super();
        this.mcpProcess = null;
        this.requestCount = 0;
        this.responses = [];
        this.logs = [];
    }

    async startMCPServer(env = {}) {
        return new Promise((resolve, reject) => {
            console.log('🚀 Starting MCP Server for request logging...');

            // Set up environment variables for testing
            const testEnv = {
                ...process.env,
                MCP_USER_ID: 'test-user-12345',
                MCP_STORAGE_TYPE: 'json',
                MCP_USER_BASED: 'true',
                MEMORY_FILE_PATH: './test-memory-files',
                NODE_ENV: 'test',
                ...env
            };

            console.log('🔧 Test Environment Variables:', {
                MCP_USER_ID: testEnv.MCP_USER_ID,
                MCP_STORAGE_TYPE: testEnv.MCP_STORAGE_TYPE,
                MCP_USER_BASED: testEnv.MCP_USER_BASED,
                MEMORY_FILE_PATH: testEnv.MEMORY_FILE_PATH
            });

            this.mcpProcess = spawn('node', ['dist/index.js'], {
                env: testEnv,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Capture stderr (where our logging goes)
            this.mcpProcess.stderr.on('data', (data) => {
                const logLine = data.toString();
                this.logs.push(logLine);
                console.log('📝 MCP LOG:', logLine.trim());
            });

            // Capture stdout (MCP responses)
            this.mcpProcess.stdout.on('data', (data) => {
                const response = data.toString();
                this.responses.push(response);
                console.log('📤 MCP RESPONSE:', response.trim());
            });

            this.mcpProcess.on('error', (error) => {
                console.error('❌ MCP Server error:', error);
                reject(error);
            });

            // Give the server time to start up
            setTimeout(() => {
                console.log('✅ MCP Server started, ready for requests');
                resolve();
            }, 2000);
        });
    }

    sendMCPRequest(request) {
        return new Promise((resolve, reject) => {
            this.requestCount++;
            const requestId = this.requestCount;

            console.log(`\n📨 Sending MCP Request #${requestId}:`, JSON.stringify(request, null, 2));

            // Set up response handler
            const responseHandler = (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.id === requestId) {
                        this.mcpProcess.stdout.removeListener('data', responseHandler);
                        resolve(response);
                    }
                } catch (e) {
                    // Not JSON, might be partial data
                }
            };

            this.mcpProcess.stdout.on('data', responseHandler);

            // Send the request
            const requestWithId = { ...request, id: requestId };
            this.mcpProcess.stdin.write(JSON.stringify(requestWithId) + '\n');

            // Timeout after 5 seconds
            setTimeout(() => {
                this.mcpProcess.stdout.removeListener('data', responseHandler);
                reject(new Error(`Request ${requestId} timed out`));
            }, 5000);
        });
    }

    async testListTools() {
        console.log('\n🛠️ Testing ListTools request...');

        try {
            const response = await this.sendMCPRequest({
                jsonrpc: '2.0',
                method: 'tools/list',
                params: {}
            });
            console.log('✅ ListTools response received');
            return response;
        } catch (error) {
            console.error('❌ ListTools failed:', error.message);
            throw error;
        }
    }

    async testCreateEntitiesWithUserId() {
        console.log('\n👤 Testing createEntities with userId...');

        try {
            const response = await this.sendMCPRequest({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'create_entities',
                    userId: 'sms-user-+1234567890',  // Simulate SMS user
                    arguments: {
                        entities: [
                            {
                                name: 'Test-Entity-With-UserId',
                                entityType: 'TestType',
                                observations: ['This entity was created with a userId parameter']
                            }
                        ]
                    }
                }
            });
            console.log('✅ CreateEntities with userId response received');
            return response;
        } catch (error) {
            console.error('❌ CreateEntities with userId failed:', error.message);
            throw error;
        }
    }

    async testCreateEntitiesWithoutUserId() {
        console.log('\n🔒 Testing createEntities without userId...');

        try {
            const response = await this.sendMCPRequest({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'create_entities',
                    arguments: {
                        entities: [
                            {
                                name: 'Test-Entity-No-UserId',
                                entityType: 'TestType',
                                observations: ['This entity was created without a userId parameter']
                            }
                        ]
                    }
                }
            });
            console.log('✅ CreateEntities without userId response received');
            return response;
        } catch (error) {
            console.error('❌ CreateEntities without userId failed:', error.message);
            throw error;
        }
    }

    async testWithLibreChatMetadata() {
        console.log('\n📱 Testing with LibreChat-style metadata...');

        try {
            const response = await this.sendMCPRequest({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'create_entities',
                    // Try various ways LibreChat might pass user context
                    userId: 'librechat-user-67890',
                    userContext: {
                        phoneNumber: '+1234567890',
                        conversationId: 'conv-12345'
                    },
                    metadata: {
                        source: 'librechat',
                        endpoint: 'external',
                        phoneNumber: '+1234567890'
                    },
                    arguments: {
                        entities: [
                            {
                                name: 'LibreChat-Style-Entity',
                                entityType: 'UserPreference',
                                observations: ['This entity simulates LibreChat usage with metadata']
                            }
                        ]
                    }
                }
            });
            console.log('✅ LibreChat-style request response received');
            return response;
        } catch (error) {
            console.error('❌ LibreChat-style request failed:', error.message);
            throw error;
        }
    }

    async stopMCPServer() {
        if (this.mcpProcess) {
            console.log('\n🛑 Stopping MCP Server...');
            this.mcpProcess.kill('SIGTERM');

            // Wait for graceful shutdown
            await new Promise(resolve => {
                this.mcpProcess.on('exit', resolve);
                setTimeout(resolve, 3000); // Force exit after 3s
            });

            console.log('✅ MCP Server stopped');
        }
    }

    generateLogReport() {
        console.log('\n📊 MCP Request Logging Report');
        console.log('================================');
        console.log(`📨 Total requests sent: ${this.requestCount}`);
        console.log(`📤 Total responses received: ${this.responses.length}`);
        console.log(`📝 Total log lines captured: ${this.logs.length}`);

        console.log('\n🔍 Key Log Analysis:');

        // Check for startup logs
        const startupLogs = this.logs.filter(log => log.includes('Environment Variables') || log.includes('starting up'));
        console.log(`🚀 Startup logs: ${startupLogs.length}`);

        // Check for request logs
        const requestLogs = this.logs.filter(log => log.includes('COMPLETE MCP REQUEST RECEIVED'));
        console.log(`📨 Complete request logs: ${requestLogs.length}`);

        // Check for userId detection
        const userIdLogs = this.logs.filter(log => log.includes('userId') || log.includes('User Context'));
        console.log(`👤 UserId-related logs: ${userIdLogs.length}`);

        // Check for storage operations
        const storageLogs = this.logs.filter(log => log.includes('storage') || log.includes('Creating') || log.includes('entities'));
        console.log(`💾 Storage operation logs: ${storageLogs.length}`);

        if (userIdLogs.length > 0) {
            console.log('\n👤 UserId Detection Analysis:');
            userIdLogs.forEach((log, index) => {
                console.log(`  ${index + 1}. ${log.trim()}`);
            });
        }

        return {
            requestCount: this.requestCount,
            responseCount: this.responses.length,
            logCount: this.logs.length,
            startupLogs: startupLogs.length,
            requestLogs: requestLogs.length,
            userIdLogs: userIdLogs.length,
            storageLogs: storageLogs.length,
            allLogs: this.logs
        };
    }
}

async function runMCPRequestLoggingTests() {
    console.log('\n📡 STEP 3: Testing MCP Server Request Handling...');
    console.log('This will show us exactly what the MCP server receives');

    const logger = new MCPServerRequestLogger();

    try {
        // Start the MCP server
        await logger.startMCPServer();

        // Test different request scenarios
        await logger.testListTools();
        await logger.testCreateEntitiesWithUserId();
        await logger.testCreateEntitiesWithoutUserId();
        await logger.testWithLibreChatMetadata();

        // Wait a moment for any final logs
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Generate report
        const report = logger.generateLogReport();

        console.log('\n🎯 Key Findings:');
        if (report.userIdLogs === 0) {
            console.log('⚠️  NO userId detection logs found - this indicates userId is not being passed or detected');
        } else {
            console.log('✅ UserId detection logs found - check the analysis above');
        }

        if (report.requestLogs === 0) {
            console.log('⚠️  NO complete request logs found - logging may not be working');
        } else {
            console.log('✅ Complete request logs captured - check stderr output above');
        }

        console.log('\n💡 Next Steps:');
        console.log('  1. Check the MCP logs above to see what userId/userContext is actually received');
        console.log('  2. If no userId is found, the issue is in LibreChat -> MCP integration');
        console.log('  3. If userId is found but not used, the issue is in MCP server storage logic');

        return report;

    } catch (error) {
        console.error('❌ MCP request logging test failed:', error);
        throw error;
    } finally {
        await logger.stopMCPServer();
    }
}

async function runFullTestSuite() {
    console.log('🚀 MCP Memory Server Storage Test Suite');
    console.log('======================================\n');

    // Step 1: Run diagnostic checks
    console.log('📋 STEP 1: Running Diagnostics...');
    const diagnostic = new MCPStorageDebugger();

    try {
        const connected = await diagnostic.connect();
        if (!connected) {
            console.log('❌ Cannot connect to MongoDB. Exiting.');
            process.exit(1);
        }

        await diagnostic.checkEnvironmentVariables();
        await diagnostic.checkMongoDBStatus();
        await diagnostic.testDirectStorageOperations();
        await diagnostic.generateReport();

    } catch (error) {
        console.error('❌ Diagnostic failed:', error.message);
        process.exit(1);
    } finally {
        await diagnostic.disconnect();
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Step 2: Run comprehensive storage tests
    console.log('📋 STEP 2: Running Storage Tests...');
    const tester = new MCPStorageTest();

    try {
        const connected = await tester.connect();
        if (!connected) {
            console.log('❌ Cannot connect to MongoDB for tests. Exiting.');
            process.exit(1);
        }

        // Clear any existing test data
        await tester.clearTestData();

        // Create comprehensive test data
        const inserted = await tester.createTestData();
        if (inserted === 0) {
            console.log('❌ No test data was inserted. There may be a storage issue.');
            process.exit(1);
        }

        // Run all validation tests
        await tester.testUserIsolation();
        await tester.testDataStructure();
        await tester.testRealisticQueries();
        await tester.runDiagnostics();
        await tester.verifyMCPIntegration();

        // Leave test data for manual inspection
        console.log('\n💡 Test data has been left in the database for inspection.');
        console.log('💡 Use MongoDB Compass or mongosh to examine the mcp_storage collection.');
        console.log('💡 Run with --cleanup flag to remove test data.');

    } catch (error) {
        console.error('❌ Storage tests failed:', error.message);
        process.exit(1);
    } finally {
        await tester.disconnect();
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Step 3: NEW - Test actual MCP server request handling
    try {
        const mcpReport = await runMCPRequestLoggingTests();

        console.log('\n' + '='.repeat(50) + '\n');
        console.log('🎯 FINAL ANALYSIS SUMMARY');
        console.log('========================');

        if (mcpReport.userIdLogs === 0) {
            console.log('❌ CRITICAL ISSUE: No userId detection in MCP server');
            console.log('   → LibreChat is not passing userId to MCP server');
            console.log('   → Need to check LibreChat MCP integration code');
        } else {
            console.log('✅ MCP server is receiving userId information');
            console.log('   → Check storage logs to see if data is being saved correctly');
        }

        if (mcpReport.storageLogs === 0) {
            console.log('❌ No storage operation logs found');
            console.log('   → MCP server may not be attempting to save data');
        } else {
            console.log('✅ Storage operations detected in logs');
        }

    } catch (error) {
        console.error('❌ MCP request logging tests failed:', error.message);
        console.log('⚠️  Unable to test actual MCP request handling');
    }

    console.log('\n✅ Full test suite completed!');
    console.log('\n📊 Next Steps:');
    console.log('  1. Check the generated diagnostic report');
    console.log('  2. Examine test data in MongoDB');
    console.log('  3. Review MCP request logs above');
    console.log('  4. Check LibreChat logs for MCP tool usage');
    console.log('  5. If no userId detected, investigate LibreChat -> MCP integration');
}

async function cleanupTestData() {
    console.log('🧹 Cleaning up test data...');
    const tester = new MCPStorageTest();

    try {
        const connected = await tester.connect();
        if (!connected) {
            console.log('❌ Cannot connect to MongoDB for cleanup.');
            process.exit(1);
        }

        await tester.clearTestData();
        console.log('✅ Test data cleanup completed.');

    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
    } finally {
        await tester.disconnect();
    }
}

// CLI interface
const command = process.argv[2];

if (command === '--help' || command === '-h') {
    console.log(`
MCP Storage Test Runner

Usage:
  node run-storage-tests.js [options]

Options:
  --cleanup    Remove test data from database
  --help, -h   Show this help message

Examples:
  node run-storage-tests.js          # Run full test suite
  node run-storage-tests.js --cleanup # Clean up test data
`);
    process.exit(0);
}

if (command === '--cleanup') {
    cleanupTestData();
} else {
    runFullTestSuite();
} 