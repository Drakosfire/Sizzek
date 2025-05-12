#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import twilio from 'twilio';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '..', '.env');
console.error('Loading .env file from:', envPath);
dotenv.config({ path: envPath });

// Environment variables validation
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+13022716778'; // Default to the working number

// Debug logging
console.error('Environment variables loaded:');
console.error('TWILIO_ACCOUNT_SID:', TWILIO_ACCOUNT_SID ? '✓ Set' : '✗ Not set');
console.error('TWILIO_AUTH_TOKEN:', TWILIO_AUTH_TOKEN ? '✓ Set' : '✗ Not set');
console.error('TWILIO_PHONE_NUMBER:', TWILIO_PHONE_NUMBER);

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error('Error: Required Twilio environment variables are not set');
    console.error('Please ensure your .env file contains:');
    console.error('TWILIO_ACCOUNT_SID=your_account_sid_here');
    console.error('TWILIO_AUTH_TOKEN=your_auth_token_here');
    console.error('TWILIO_PHONE_NUMBER=your_phone_number_here (optional)');
    process.exit(1);
}

// Initialize Twilio client
console.error('Initializing Twilio client...');
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
console.error('Twilio client initialized successfully');

// Create the MCP server
const server = new Server({
    name: "twilio-sms-server",
    version: "0.1.0",
}, {
    capabilities: {
        tools: {},
    },
});

// Helper function to wait for a specific duration
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to check message status
async function checkMessageStatus(messageSid: string): Promise<any> {
    return await twilioClient.messages(messageSid).fetch();
}

// Helper function to get status message
function getStatusMessage(status: string): string {
    switch (status) {
        case 'queued':
            return 'Message has been queued for delivery.';
        case 'sending':
            return 'Message is being sent.';
        case 'sent':
            return 'Message has been sent successfully.';
        case 'delivered':
            return 'Message has been delivered successfully.';
        case 'undelivered':
            return 'Message could not be delivered.';
        case 'failed':
            return 'Message failed to send.';
        default:
            return `Message status: ${status}`;
    }
}

// Helper function to check if status is final
function isFinalStatus(status: string): boolean {
    return ['sent', 'delivered', 'undelivered', 'failed'].includes(status);
}

// Define the tools we'll expose
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "send_sms",
                description: "Send a SINGLE SMS message to a specified phone number. IMPORTANT: This function should ONLY be called ONCE per message. Do not attempt to resend or retry the same message. The function will automatically handle delivery status checking and provide a final result.",
                inputSchema: {
                    type: "object",
                    properties: {
                        to: {
                            type: "string",
                            description: "The phone number to send the message to (E.164 format, e.g., +1234567890)"
                        },
                        message: {
                            type: "string",
                            description: "The message content to send"
                        },
                    },
                    required: ["to", "message"],
                },
            },
        ],
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
    }

    switch (name) {
        case "send_sms":
            try {
                console.error('Attempting to send SMS with credentials:');
                console.error('Account SID:', TWILIO_ACCOUNT_SID);
                console.error('From:', TWILIO_PHONE_NUMBER);
                console.error('To:', args.to);
                console.error('Message length:', (args.message as string).length);

                // Validate phone number format
                const phoneNumber = args.to as string;
                if (!phoneNumber.startsWith('+')) {
                    throw new Error('Phone number must be in E.164 format (e.g., +1234567890)');
                }

                // Send the message
                const message = await twilioClient.messages.create({
                    body: args.message as string,
                    to: phoneNumber,
                    from: TWILIO_PHONE_NUMBER,
                });

                console.error('Initial message status:', {
                    sid: message.sid,
                    status: message.status,
                    direction: message.direction,
                    errorCode: message.errorCode,
                    errorMessage: message.errorMessage
                });

                // Poll for status updates
                let currentMessage = message;
                let attempts = 0;
                const maxAttempts = 10; // Maximum number of status checks
                const pollInterval = 2000; // Check every 2 seconds

                while (attempts < maxAttempts) {
                    const statusMessage = getStatusMessage(currentMessage.status);
                    const isSuccess = ['sent', 'delivered'].includes(currentMessage.status);
                    const isFailure = ['undelivered', 'failed'].includes(currentMessage.status);

                    // Log the current status
                    console.error('Checking message status:', {
                        status: currentMessage.status,
                        isSuccess,
                        isFailure,
                        statusMessage,
                        attempts,
                        maxAttempts
                    });

                    // Return success response
                    if (isSuccess) {
                        const response = {
                            content: [{
                                type: "text",
                                text: "[FINAL] ✅ Message sent successfully. Do not attempt to resend this message."
                            }]
                        };
                        console.error('Sending success response:', response);
                        return response;
                    }

                    // Return failure response
                    if (isFailure) {
                        const response = {
                            content: [{
                                type: "text",
                                text: `[FINAL] ❌ Failed to send message: ${statusMessage}. Do not attempt to resend this message.`
                            }]
                        };
                        console.error('Sending failure response:', response);
                        return response;
                    }

                    // If we've reached max attempts, return timeout
                    if (attempts >= maxAttempts - 1) {
                        const response = {
                            content: [{
                                type: "text",
                                text: "[FINAL] ❌ Message status unknown after maximum attempts. Do not attempt to resend this message."
                            }]
                        };
                        console.error('Sending timeout response:', response);
                        return response;
                    }

                    // Wait and check status again
                    await wait(pollInterval);
                    currentMessage = await checkMessageStatus(message.sid);
                    attempts++;
                }
            } catch (error) {
                console.error('Error sending SMS:', error);
                if (error instanceof Error) {
                    // Handle specific Twilio errors
                    if (error.message.includes('Authentication Error')) {
                        throw new Error('Twilio authentication failed. Please check your Account SID and Auth Token.');
                    } else if (error.message.includes('Invalid phone number')) {
                        throw new Error('Invalid phone number format. Please use E.164 format (e.g., +1234567890)');
                    }
                }
                throw new Error(`Failed to send SMS: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Twilio SMS MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
