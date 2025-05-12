#!/usr/bin/env node

import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Function to send a message to the MCP server
async function sendToServer(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
        // Spawn the MCP server process
        const server: ChildProcess = spawn('node', ['dist/index.js'], {
            stdio: ['pipe', 'pipe', 'inherit']
        });

        let response = '';

        // Handle server response
        server.stdout?.on('data', (data: Buffer) => {
            response += data.toString();
            try {
                const parsed = JSON.parse(response);
                resolve(parsed);
                server.kill();
            } catch (e) {
                // Not a complete JSON response yet
            }
        });

        // Handle errors
        server.stderr?.on('data', (data: Buffer) => {
            console.error(`Server Error: ${data.toString()}`);
        });

        server.on('error', (error) => {
            reject(error);
        });

        // Send the message to the server
        server.stdin?.write(JSON.stringify(message) + '\n');
    });
}

// Test functions
async function listTools() {
    console.log('Listing available tools...');
    const response = await sendToServer({
        jsonrpc: "2.0",
        id: 1,
        method: "list_tools"
    });
    console.log('Available tools:', JSON.stringify(response, null, 2));
    return response;
}

async function sendSMS(to: string, message: string) {
    console.log(`Sending SMS to ${to}...`);
    const response = await sendToServer({
        jsonrpc: "2.0",
        id: 2,
        method: "call_tool",
        params: {
            name: "send_sms",
            arguments: {
                to,
                message
            }
        }
    });
    console.log('SMS Response:', JSON.stringify(response, null, 2));
    return response;
}

// Main test function
async function runTests() {
    try {
        // First, list available tools
        await listTools();

        // Then, send a test SMS
        // Replace with your test phone number
        const testPhone = process.env.TEST_PHONE_NUMBER || '+1234567890';
        const testMessage = 'Hello from MCP Test Client!';

        await sendSMS(testPhone, testMessage);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the tests
runTests().catch(console.error); 