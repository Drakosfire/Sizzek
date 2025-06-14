#!/usr/bin/env node

/**
 * Simple debug test script for the Google Calendar MCP server
 * This script simulates a create-event tool call to test the logging
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'build', 'index.js');

console.log('Starting Google Calendar MCP Server for debugging...');
console.log('Server path:', serverPath);
console.log('='.repeat(60));

const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
});

server.stdout.on('data', (data) => {
    console.log('[STDOUT]', data.toString());
});

server.stderr.on('data', (data) => {
    console.error('[STDERR]', data.toString());
});

server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
});

// Send a simple ping first
setTimeout(() => {
    console.log('Sending ping...');
    const ping = {
        jsonrpc: "2.0",
        id: 1,
        method: "ping"
    };
    server.stdin.write(JSON.stringify(ping) + '\n');
}, 1000);

// Send a create-event tool call
setTimeout(() => {
    console.log('Sending create-event tool call...');
    const createEvent = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
            name: "create-event",
            arguments: {
                calendarId: "primary",
                summary: "Debug Test Event",
                description: "Testing logging functionality",
                start: "2024-12-20T10:00:00-05:00",
                end: "2024-12-20T11:00:00-05:00",
                timeZone: "America/Chicago"
            }
        }
    };
    server.stdin.write(JSON.stringify(createEvent) + '\n');
}, 2000);

// Keep the process alive for a bit to see responses
setTimeout(() => {
    console.log('Terminating test...');
    server.kill();
}, 10000);

process.on('SIGINT', () => {
    console.log('Received SIGINT, killing server...');
    server.kill();
    process.exit(0);
}); 