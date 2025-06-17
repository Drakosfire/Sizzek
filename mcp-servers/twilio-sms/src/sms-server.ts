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
import { ContactManager } from './contacts.js';

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
const AGENT_MODEL = process.env.LIBRECHAT_AGENT_MODEL || 'gpt-4.1';

// Initialize ContactManager with the default agent ID
const contactManager = new ContactManager();

// Add request logging middleware
app.use((req, res, next) => {
    // Only log essential request info, not full headers for every request
    if (req.url.includes('/api/')) {
        console.error(`[SMS-SERVER] ${req.method} ${req.url}`);
    }
    next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

interface SMSPayload {
    from: string;
    body: string;
    messageSid?: string; // Twilio message SID for true duplicate detection
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

// Add message deduplication tracking
const recentMessages = new Map<string, number>();
const MESSAGE_DEDUP_WINDOW = 5000; // 5 seconds

// Add Twilio webhook deduplication tracking (longer window for webhook retries)
const webhookMessages = new Map<string, number>();
const WEBHOOK_DEDUP_WINDOW = 60000; // 60 seconds (longer than Twilio retry window)

// Cleanup old entries from both deduplication maps every minute
setInterval(() => {
    const now = Date.now();

    // Clean up LibreChat message deduplication
    for (const [key, timestamp] of recentMessages.entries()) {
        if (now - timestamp > MESSAGE_DEDUP_WINDOW * 2) { // Keep for 2x the window
            recentMessages.delete(key);
        }
    }

    // Clean up webhook deduplication
    for (const [key, timestamp] of webhookMessages.entries()) {
        if (now - timestamp > WEBHOOK_DEDUP_WINDOW * 2) { // Keep for 2x the window
            webhookMessages.delete(key);
        }
    }

    console.error(`[SMS-SERVER] Cleaned up deduplication maps - LibreChat: ${recentMessages.size}, Webhook: ${webhookMessages.size}`);
}, 60000);

async function forwardToClient(message: string, apiKey: string, phoneNumber: string, from: string) {
    // Use placeholder conversation ID for SMS routing - let LibreChat handle phone-based discovery
    const url = `http://localhost:3080/api/messages/sms-conversation`;

    // Check for duplicate messages
    const messageKey = `${phoneNumber}:${message}`;
    const now = Date.now();
    const lastSent = recentMessages.get(messageKey);
    if (lastSent && (now - lastSent) < MESSAGE_DEDUP_WINDOW) {
        console.error('[SMS-SERVER] Duplicate message detected, skipping:', messageKey);
        return { status: 'skipped', reason: 'duplicate' };
    }
    recentMessages.set(messageKey, now);

    // Check if we need to prompt for name
    const needsNamePrompt = contactManager.needsNamePrompt(phoneNumber);
    let contentsWithPhoneNumber = message;

    if (needsNamePrompt) {
        contentsWithPhoneNumber = `[System: This is a new contact (${phoneNumber}). Please ask for their name. When they respond you need to call the /manage-contact endpoint and add their name and phone number. Then you can continue with the conversation.]\n\n${message}`;
    }

    // CRITICAL: Add phone number context to EVERY message so agent knows who to reply to
    const contact = contactManager.getContact(phoneNumber);
    const contactName = contact?.name || `Unknown Contact`;
    contentsWithPhoneNumber = `[SMS from ${contactName} (${phoneNumber})]: ${contentsWithPhoneNumber}`;

    // Get conversation title from contact manager
    const conversationTitle = contactManager.getConversationTitle(phoneNumber);

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
            additional_instructions: `CRITICAL SMS CONTEXT: You are responding to an SMS from ${phoneNumber}. If you need to send an SMS response, you MUST use the phone number ${phoneNumber} in the send_sms tool. This is the ONLY phone number you should use for SMS responses.`,
            conversationMetadata: {
                title: conversationTitle,
                endpoint: "agents",
                agent_id: AGENT_ID,
                model: AGENT_MODEL
            }
        }
    };

    // Log the payload being sent to LibreChat
    console.error('[SMS-SERVER] === Sending to LibreChat ===');
    console.error('[SMS-SERVER] URL:', url);
    console.error('[SMS-SERVER] Payload:', JSON.stringify(payload, null, 2));

    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest' // Add this by default to prevent HTML responses
    };

    try {
        console.error('[SMS-SERVER] Sending request to LibreChat...');
        const response = await axios.post(url, payload, {
            headers,
            validateStatus: (status) => status < 500  // Accept any non-500 response
        });

        console.error('[SMS-SERVER] Response Status:', response.status);
        // Only log response data if it's not successful or contains errors
        if (response.status !== 200) {
            console.error('[SMS-SERVER] Response Data:', JSON.stringify(response.data, null, 2));
        }

        // Only retry if we get HTML and it's not already a retry
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>') && !headers['X-Requested-With']) {
            console.error('[SMS-SERVER] Received HTML response, retrying with different headers');
            // Retry with different headers to force JSON response
            const jsonResponse = await axios.post(url, payload, {
                headers: {
                    ...headers,
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            return jsonResponse.data;
        }

        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('[SMS-SERVER] Error forwarding to Client:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message
            });
        } else {
            console.error('[SMS-SERVER] Error forwarding to Client:', error);
        }
        throw error;
    }
}

app.post('/api/receive-sms', async (req, res) => {
    console.error('[SMS-SERVER] === Incoming SMS ===');
    const { from, body, metadata, messageSid } = req.body as SMSPayload;
    console.error(`[SMS-SERVER] From: ${from}, Message: "${body}", MessageSid: ${messageSid || 'N/A'}`);

    const authHeader = req.headers['authorization'];

    if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
        console.error('[SMS-SERVER] Unauthorized request');
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

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

    // Get phone number - LibreChat will handle conversation ID management
    const phoneNumber = metadata?.phoneNumber || from;

    // Check for webhook-level duplicates (prevent Twilio retries from causing duplicate processing)
    // Use MessageSid if available (most reliable), otherwise fall back to content-based key
    const webhookKey = messageSid ? `sid:${messageSid}` : `${phoneNumber}:${body}`;
    const now = Date.now();
    const lastWebhookTime = webhookMessages.get(webhookKey);

    if (lastWebhookTime && (now - lastWebhookTime) < WEBHOOK_DEDUP_WINDOW) {
        console.error('[SMS-SERVER] Duplicate webhook detected (Twilio retry), responding success but skipping processing:', webhookKey);
        res.set('Content-Type', 'text/xml');
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        return;
    }

    // Record this webhook to prevent duplicates
    webhookMessages.set(webhookKey, now);
    console.error('[SMS-SERVER] Webhook recorded for deduplication:', webhookKey);

    // CRITICAL: Respond to Twilio immediately with empty TwiML to prevent webhook retries
    // This must happen BEFORE any long-running operations
    // Empty TwiML acknowledges receipt without sending a response SMS
    res.set('Content-Type', 'text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    // Process the message asynchronously after responding to Twilio
    setImmediate(async () => {
        try {
            console.error('[SMS-SERVER] Processing message asynchronously...');

            // Update contact information
            contactManager.addOrUpdateContact(phoneNumber, {}, '');

            // Check if the message contains a name response
            const nameMatch = body.match(/^Name:\s*(.+)$/i);
            if (nameMatch) {
                const name = nameMatch[1].trim();
                contactManager.updateContactName(phoneNumber, name);
                console.error('[SMS-SERVER] Name updated asynchronously:', name);
                return;
            }

            await forwardToClient(body, externalMessageApiKey, phoneNumber, from);
            console.error('[SMS-SERVER] Message processed successfully');
        } catch (error) {
            console.error('[SMS-SERVER] Error processing message asynchronously:', error);
            // Note: We can't respond to the client here since we already responded above
            // This is acceptable since the webhook was acknowledged
        }
    });
});

// Add new endpoint for contact management
app.post('/api/manage-contact', async (req, res) => {
    const { phoneNumber: contactPhone, name: contactName, metadata } = req.body;
    console.error(`[SMS-SERVER] === Contact Management: ${contactPhone} -> ${contactName} ===`);

    const authHeader = req.headers['authorization'];

    if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
        console.error('[SMS-SERVER] Unauthorized request');
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (!contactPhone) {
        console.error('[SMS-SERVER] Bad request: missing phone number');
        res.status(400).json({ error: 'Missing required field: phoneNumber' });
        return;
    }

    try {
        // Get existing contact or create new one
        const contact = contactManager.addOrUpdateContact(contactPhone, {
            name: contactName,
            metadata
        }, ''); // Empty conversation ID as this is just an update

        res.status(200).json({
            status: 'success',
            contact: {
                phoneNumber: contact.phoneNumber,
                name: contact.name,
                lastInteraction: contact.lastInteraction,
                metadata: contact.metadata
            }
        });
    } catch (error) {
        console.error('[SMS-SERVER] Error managing contact:', error);
        res.status(500).json({ error: 'Failed to manage contact' });
    }
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