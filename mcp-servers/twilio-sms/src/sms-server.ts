/**
 * Twilio SMS Server with LibreChat Agent Integration
 * 
 * Required Environment Variables:
 * - EXTERNAL_MESSAGE_API_KEY: API key for LibreChat external messages
 * - SSL_KEY_PATH: Path to SSL private key file
 * - SSL_CERT_PATH: Path to SSL certificate file
 * - LIBRECHAT_AGENT_ID: ID of the LibreChat agent to use (optional, defaults to example from docs)
 * - LIBRECHAT_AGENT_MODEL: Model to use for the agent (optional, defaults to gpt-4o)
 * - PORT: Server port (optional, defaults to 3081)
 */

import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import https from 'https';
import fs from 'fs';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '..', '.env');
console.error('[SMS-SERVER] Loading .env file from:', envPath);
dotenv.config({ path: envPath });

const app = express();
const PORT = process.env.PORT || 3081;
const API_KEY = process.env.EXTERNAL_MESSAGE_API_KEY;

// SSL/TLS Configuration (Optional)
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;

// Check if SSL certificates are configured and valid
let httpsOptions = null;
let sslEnabled = false;

if (SSL_KEY_PATH && SSL_CERT_PATH) {
    // Check if SSL certificates exist
    if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
        httpsOptions = {
            key: fs.readFileSync(SSL_KEY_PATH),
            cert: fs.readFileSync(SSL_CERT_PATH)
        };
        sslEnabled = true;
        console.error('[SMS-SERVER] SSL certificates found - HTTPS enabled');
    } else {
        console.error('[SMS-SERVER] SSL certificate paths provided but files not found:');
        console.error(`[SMS-SERVER] - Private Key: ${SSL_KEY_PATH}`);
        console.error(`[SMS-SERVER] - Certificate: ${SSL_CERT_PATH}`);
        console.error('[SMS-SERVER] Running in HTTP-only mode');
    }
} else {
    console.error('[SMS-SERVER] SSL certificates not configured - running in HTTP-only mode');
    console.error('[SMS-SERVER] This is appropriate for Tailscale networks with end-to-end encryption');
}

// Agent Configuration
const AGENT_ID = process.env.LIBRECHAT_AGENT_ID || 'agent_G5HmZ0jJtfPMXIykL81Nx'; // Default from docs
const AGENT_MODEL = process.env.LIBRECHAT_AGENT_MODEL || 'gpt-4o';

// Add request logging middleware
app.use((req, res, next) => {
    console.error(`[SMS-SERVER] ${new Date().toISOString()} ${req.method} ${req.url}`);
    console.error('[SMS-SERVER] Headers:', JSON.stringify(req.headers, null, 2));
    next();
});

app.use(bodyParser.json());

interface SMSPayload {
    from: string;
    body: string;
    metadata?: {
        conversationId?: string;
        phoneNumber?: string;
        [key: string]: any;
    };
    [key: string]: any;
}

// Helper function for time availability - always returns true since agents are available 24/7
function currentDateANDTime(): string {
    const now = new Date();
    return now.toISOString(); // Agents are available 24/7
}

// Simple in-memory store for phone number to conversation ID mapping
// In production, this should be replaced with a persistent store (Redis, DB, etc.)
const phoneConversationMap = new Map<string, string>();

// Helper function to get or create conversation ID for a phone number
function getConversationIdForPhone(phoneNumber: string, providedConversationId?: string): string {
    // If a conversation ID is explicitly provided, use it and update the mapping
    if (providedConversationId) {
        phoneConversationMap.set(phoneNumber, providedConversationId);
        return providedConversationId;
    }

    // Check if we have an existing conversation for this phone number
    const existingConversationId = phoneConversationMap.get(phoneNumber);
    if (existingConversationId) {
        console.error(`[SMS-SERVER] Using existing conversation for ${phoneNumber}: ${existingConversationId}`);
        return existingConversationId;
    }

    // Generate new conversation ID and store the mapping
    const newConversationId = crypto.randomUUID();
    phoneConversationMap.set(phoneNumber, newConversationId);
    console.error(`[SMS-SERVER] Created new conversation for ${phoneNumber}: ${newConversationId}`);
    return newConversationId;
}

function appendPhoneNumberToMessage(message: string, phoneNumber: string): string {
    return `${message} ${phoneNumber}`;
}

async function forwardToClient(conversationId: string, message: string, apiKey: string, phoneNumber: string, from: string) {
    const url = `http://localhost:3080/api/messages/${conversationId}`;

    const contentsWithPhoneNumber = appendPhoneNumberToMessage(message, phoneNumber);

    // Create conversation title for new conversations
    const conversationTitle = `SMS Agent Chat with ${phoneNumber}`;

    const payload = {
        role: "external",
        content: contentsWithPhoneNumber,
        from: from,
        metadata: {
            endpoint: "agents",
            agent_id: AGENT_ID,
            model: AGENT_MODEL,
            phoneNumber: phoneNumber,
            source: 'sms',
            title: conversationTitle,
            // Additional metadata to help with conversation creation
            conversationMetadata: {
                title: conversationTitle,
                endpoint: "agents",
                agent_id: AGENT_ID,
                model: AGENT_MODEL
            }
        }
    };

    console.error('[SMS-SERVER] === Forwarding to LibreChat Agent ===');
    console.error('[SMS-SERVER] URL:', url);
    console.error('[SMS-SERVER] Agent ID:', AGENT_ID);
    console.error('[SMS-SERVER] Model:', AGENT_MODEL);
    console.error('[SMS-SERVER] Current Time:', currentDateANDTime());
    console.error('[SMS-SERVER] Conversation Title:', conversationTitle);
    console.error('[SMS-SERVER] Headers:', {
        'Content-Type': 'application/json',
        'x-api-key': '***REDACTED***',
        'Accept': 'application/json'
    });
    console.error('[SMS-SERVER] Payload:', JSON.stringify(payload, null, 2));

    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Accept': 'application/json'
    };
    try {
        console.error('[SMS-SERVER] Sending request to LibreChat...');
        const response = await axios.post(url, payload, {
            headers,
            validateStatus: (status) => status < 500  // Accept any non-500 response
        });

        console.error('[SMS-SERVER] Response Status:', response.status);
        console.error('[SMS-SERVER] Response Headers:', JSON.stringify(response.headers, null, 2));
        console.error('[SMS-SERVER] Response Data:', JSON.stringify(response.data, null, 2));

        // Check if we got HTML back (indicating SSE attempt)
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
            console.error('[SMS-SERVER] Received HTML response, retrying with different headers');
            // Retry with different headers to force JSON response
            const jsonResponse = await axios.post(url, payload, {
                headers: {
                    ...headers,
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            console.error('[SMS-SERVER] Retry Response:', JSON.stringify(jsonResponse.data, null, 2));
            return jsonResponse.data;
        }

        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('[SMS-SERVER] Error forwarding to Client:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                headers: error.response?.headers,
                data: error.response?.data,
                message: error.message,
                code: error.code
            });
        } else {
            console.error('[SMS-SERVER] Error forwarding to Client:', error);
        }
        throw error;
    }
}

app.post('/api/receive-sms', async (req, res) => {
    console.error('[SMS-SERVER] === Incoming SMS Request ===');
    console.error('[SMS-SERVER] Request body:', JSON.stringify(req.body, null, 2));
    console.error('[SMS-SERVER] Headers:', JSON.stringify(req.headers, null, 2));

    const authHeader = req.headers['authorization'];

    if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
        console.error('[SMS-SERVER] Unauthorized request: missing or invalid authorization header');
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { from, body, metadata } = req.body as SMSPayload;
    if (!from || !body) {
        console.error('[SMS-SERVER] Bad request: missing required fields', { from, body });
        res.status(400).json({ error: 'Missing required fields: from, body' });
        return;
    }

    const externalMessageApiKey = process.env.EXTERNAL_MESSAGE_API_KEY;
    if (!externalMessageApiKey) {
        console.error('[SMS-SERVER] Missing EXTERNAL_MESSAGE_API_KEY in environment');
        res.status(500).json({ error: 'Server misconfiguration' });
        return;
    }

    // Get phone number and manage conversation ID
    const phoneNumber = metadata?.phoneNumber || from;  // Use metadata phone number or fallback to from
    const conversationId = getConversationIdForPhone(phoneNumber, metadata?.conversationId);
    const isGeneratedId = !metadata?.conversationId;

    const receivedAt = new Date().toISOString();
    console.error(`[SMS-SERVER] === Message Details ===`);
    console.error(`[SMS-SERVER] From: ${from}`);
    console.error(`[SMS-SERVER] Body: ${body}`);
    console.error(`[SMS-SERVER] Phone Number: ${phoneNumber}`);
    console.error(`[SMS-SERVER] Conversation ID: ${conversationId}`);
    console.error(`[SMS-SERVER] Is Generated ID: ${isGeneratedId}`);
    console.error(`[SMS-SERVER] Agent ID: ${AGENT_ID}`);
    console.error(`[SMS-SERVER] Conversation Status: ${isGeneratedId ? 'NEW' : 'EXISTING'}`);
    console.error(`[SMS-SERVER] Total Tracked Conversations: ${phoneConversationMap.size}`);
    console.error(`[SMS-SERVER] Received at: ${receivedAt}`);

    try {
        await forwardToClient(conversationId, body, externalMessageApiKey, phoneNumber, from);
        console.error('[SMS-SERVER] Successfully processed and forwarded message');

        // Log success with conversation details
        if (isGeneratedId) {
            console.error(`[SMS-SERVER] Created new agent conversation: ${conversationId}`);
        } else {
            console.error(`[SMS-SERVER] Used existing conversation: ${conversationId}`);
        }
    } catch (err) {
        console.error('[SMS-SERVER] Error forwarding to client:', err);
        res.status(500).json({ error: 'Failed to forward message' });
        return;
    }

    res.status(200).json({
        status: 'processed',
        received_at: receivedAt,
        message_id: `${from}-${Date.now()}`,
        conversation_id: conversationId,
        is_generated_id: isGeneratedId,
        agent_id: AGENT_ID
    });
});

// Start the appropriate server(s)
if (sslEnabled && httpsOptions) {
    // Start HTTPS server
    https.createServer(httpsOptions, app).listen(PORT, () => {
        console.error(`[SMS-SERVER] HTTPS Server started and listening on port ${PORT}`);
        console.error('[SMS-SERVER] Environment:', {
            port: PORT,
            apiKeyPresent: !!API_KEY,
            externalApiKeyPresent: !!process.env.EXTERNAL_MESSAGE_API_KEY,
            sslEnabled: true,
            agentId: AGENT_ID,
            agentModel: AGENT_MODEL,
            currentTime: currentDateANDTime()
        });
        console.error('[SMS-SERVER] ==========================================');
        console.error('[SMS-SERVER] CONNECTION ENDPOINT:');
        console.error(`[SMS-SERVER] HTTPS: https://100.92.179.100:${PORT}/api/receive-sms`);
        console.error('[SMS-SERVER] ==========================================');
    });
} else {
    // Start HTTP-only server
    app.listen(PORT, () => {
        console.error(`[SMS-SERVER] HTTP Server started and listening on port ${PORT}`);
        console.error('[SMS-SERVER] Environment:', {
            port: PORT,
            apiKeyPresent: !!API_KEY,
            externalApiKeyPresent: !!process.env.EXTERNAL_MESSAGE_API_KEY,
            sslEnabled: false,
            agentId: AGENT_ID,
            agentModel: AGENT_MODEL,
            currentTime: currentDateANDTime()
        });
        console.error('[SMS-SERVER] ==========================================');
        console.error('[SMS-SERVER] CONNECTION ENDPOINT:');
        console.error(`[SMS-SERVER] HTTP: http://100.92.179.100:${PORT}/api/receive-sms`);
        console.error('[SMS-SERVER] ==========================================');
    });
} 