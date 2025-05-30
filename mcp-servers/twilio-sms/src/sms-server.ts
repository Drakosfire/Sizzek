import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

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
        [key: string]: any;
    };
    [key: string]: any;
}

async function forwardToClient(conversationId: string, message: string, apiKey: string) {
    const url = `http://localhost:3080/api/messages/${conversationId}`;
    const payload = {
        role: "external",
        content: message,
        isStream: false  // Explicitly tell the server we don't want streaming
    };
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Accept': 'application/json'
    };
    try {
        console.error('[SMS-SERVER] Forwarding message to client:', {
            url,
            conversationId,
            messageLength: message.length
        });
        const response = await axios.post(url, payload, {
            headers,
            validateStatus: (status) => status < 500  // Accept any non-500 response
        });

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
            console.error('[SMS-SERVER] Successfully forwarded to Client:', jsonResponse.data);
            return jsonResponse.data;
        }

        console.error('[SMS-SERVER] Successfully forwarded to Client:', response.data);
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('[SMS-SERVER] Error forwarding to Client:', {
                status: error.response?.status,
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

    // Use existing conversation ID from metadata if available, otherwise generate one
    const conversationId = metadata?.conversationId || ""

    const receivedAt = new Date().toISOString();
    console.error(`[SMS-SERVER] === Message Details ===`);
    console.error(`[SMS-SERVER] From: ${from}`);
    console.error(`[SMS-SERVER] Body: ${body}`);
    console.error(`[SMS-SERVER] Conversation ID: ${conversationId}`);
    console.error(`[SMS-SERVER] Received at: ${receivedAt}`);

    try {
        await forwardToClient(conversationId, body, externalMessageApiKey);
        console.error('[SMS-SERVER] Successfully processed and forwarded message');
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
        is_generated_id: false
    });
});

// Start the server immediately
app.listen(PORT, () => {
    console.error(`[SMS-SERVER] Server started and listening on port ${PORT}`);
    console.error('[SMS-SERVER] Environment:', {
        port: PORT,
        apiKeyPresent: !!API_KEY,
        externalApiKeyPresent: !!process.env.EXTERNAL_MESSAGE_API_KEY
    });
}); 