#!/usr/bin/env node

/**
 * Test script for Enhanced Memory MCP Server with comprehensive logging
 * This script sends a test create_entities request to track down where the abort error occurs
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('[Test] Starting enhanced logging test for Memory MCP Server');

// Path to the compiled memory server
const serverPath = path.join(__dirname, 'mcp-servers/memory/dist/index.js');

console.log(`[Test] Server path: ${serverPath}`);

// Test environment variables for MongoDB storage
const testEnv = {
    ...process.env,
    MCP_STORAGE_TYPE: 'mongodb',
    MCP_USER_BASED: 'true',
    MCP_DEBUG: 'true',
    MONGODB_CONNECTION_STRING: 'mongodb://localhost:27017/LibreChat',
    MONGODB_DATABASE: 'mcp-data',
    MONGODB_COLLECTION: 'mcp_memory_test',
    MCP_USER_ID: '680d0b736eab93a30b0f3c2f' // Same user ID from logs
};

console.log('[Test] Environment variables configured for MongoDB storage');

// Create the MCP server process
const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: testEnv,
    cwd: path.dirname(serverPath)
});

let messageId = 1;

// Helper function to send JSON-RPC messages
function sendMessage(method, params) {
    const message = {
        jsonrpc: '2.0',
        id: messageId++,
        method: method,
        params: params
    };

    const messageStr = JSON.stringify(message) + '\n';
    console.log(`[Test] Sending: ${messageStr.trim()}`);
    server.stdin.write(messageStr);
}

// Handle server output
server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
        try {
            const response = JSON.parse(line);
            console.log(`[Test] Server Response: ${JSON.stringify(response, null, 2)}`);
        } catch (e) {
            console.log(`[Test] Server Output: ${line}`);
        }
    });
});

// Handle server stderr (where our logging goes)
server.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
        console.log(`[Test] Server Log: ${line}`);
    });
});

// Handle server errors
server.on('error', (error) => {
    console.error(`[Test] Server Error: ${error.message}`);
});

// Handle server exit
server.on('exit', (code, signal) => {
    console.log(`[Test] Server exited with code ${code}, signal ${signal}`);
});

// Test sequence
console.log('[Test] Starting test sequence...');

// Wait a moment for server to initialize
setTimeout(() => {
    console.log('[Test] Step 1: Sending initialize request');
    sendMessage('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
            name: 'test-client',
            version: '1.0.0'
        }
    });
}, 1000);

setTimeout(() => {
    console.log('[Test] Step 2: Listing tools');
    sendMessage('tools/list', {});
}, 2000);

setTimeout(() => {
    console.log('[Test] Step 3: Testing create_entities (same call that was failing)');
    sendMessage('tools/call', {
        name: 'create_entities',
        arguments: {
            entities: [
                {
                    name: 'Building MongoDB for Sizzek',
                    entityType: 'project',
                    observations: ['We are building the MongoDB for Sizzek.']
                }
            ]
        },
        userId: '680d0b736eab93a30b0f3c2f'
    });
}, 3000);

// Auto-exit after test
setTimeout(() => {
    console.log('[Test] Test completed, shutting down...');
    server.stdin.end();
    server.kill();
    process.exit(0);
}, 10000);

console.log('[Test] Test script running, will auto-exit in 10 seconds...'); 