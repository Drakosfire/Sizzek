#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testTools() {
    try {
        // Start the server process
        const serverProcess = spawn('node', ['dist/index.js'], {
            stdio: ['pipe', 'pipe', 'inherit'],
            cwd: process.cwd()
        });

        // Create client and transport
        const transport = new StdioClientTransport({
            reader: serverProcess.stdout,
            writer: serverProcess.stdin
        });

        const client = new Client({
            name: "test-client",
            version: "1.0.0"
        }, {
            capabilities: {}
        });

        // Connect
        await client.connect(transport);

        // List tools
        console.log('Testing tool listing...');
        const result = await client.listTools();

        console.log(`\nFound ${result.tools.length} tools:`);
        result.tools.forEach((tool, index) => {
            console.log(`${index + 1}. ${tool.name} - ${tool.description}`);
        });

        // Clean up
        await client.close();
        serverProcess.kill();

    } catch (error) {
        console.error('Error testing tools:', error);
        process.exit(1);
    }
}

testTools(); 