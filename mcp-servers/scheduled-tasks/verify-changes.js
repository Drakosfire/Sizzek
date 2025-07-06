#!/usr/bin/env node

/**
 * Verification script for dynamic conversation discovery changes
 * 
 * This script demonstrates the new approach:
 * 1. Uses user lookup service to find agent's user ID AND phone number
 * 2. Sends scheduled messages as regular SMS messages using agent's phone number
 * 3. Lets SMS conversation pipeline handle all conversation discovery/creation
 */

import { createUserLookupService } from './src/http/user-lookup.js';
import { LibreChatClient } from './src/http/librechat-client.js';

async function verifyDynamicConversationDiscovery() {
    console.log('🔍 Verifying Dynamic Conversation Discovery Changes\n');

    // 1. Test User Lookup Service
    console.log('1. Testing User Lookup Service...');

    const userLookupService = createUserLookupService();

    try {
        await userLookupService.initialize();

        const agentName = process.env.LIBRECHAT_AGENT_NAME || 'sizzek';
        const userId = await userLookupService.lookupUserIdByAgentName(agentName);

        if (!userId) {
            console.log('❌ User lookup failed - no user found for agent:', agentName);
            return;
        }

        console.log('✅ User lookup successful:', { userId, agentName });

        // Get full user object to check phone number
        const user = await userLookupService.lookupUserById(userId);
        if (!user) {
            console.log('❌ User object lookup failed');
            return;
        }

        console.log('✅ User object retrieved:', {
            userId: user._id.toString(),
            hasPhoneNumber: !!user.phoneNumber,
            phoneNumber: user.phoneNumber ? '[PRESENT]' : '[MISSING]'
        });

        if (!user.phoneNumber) {
            console.log('❌ Agent user does not have a phone number. Cannot send scheduled messages.');
            return;
        }

        // 2. Test LibreChat Client Configuration
        console.log('\n2. Testing LibreChat Client Configuration...');

        const librechatClient = new LibreChatClient({
            endpoint: process.env.LIBRECHAT_ENDPOINT || 'http://localhost:3080',
            apiKey: process.env.LIBRECHAT_API_KEY || 'test-key',
            timeout: 30000,
            retryAttempts: 3,
            retryDelay: 1000,
            userLookupService: userLookupService,
            agentName: agentName
        });

        console.log('✅ LibreChat client configured successfully');

        // 3. Test Message Routing (dry run)
        console.log('\n3. Testing Message Routing (dry run)...');

        // Mock fetch to capture the request
        let capturedRequest = null;
        global.fetch = async (url, options) => {
            capturedRequest = { url, options };
            return {
                ok: true,
                status: 200,
                text: async () => 'Success'
            };
        };

        // Create a test task
        const testTask = {
            id: 'verify-001',
            name: 'Verification Task',
            description: 'Testing new dynamic conversation discovery',
            message: 'This is a test message to verify the new approach works correctly.',
            schedule: {
                type: 'once',
                runAt: new Date(Date.now() + 60000) // 1 minute from now
            }
        };

        // Trigger the task (dry run)
        await librechatClient.triggerTask(testTask);

        // Verify the request structure
        if (capturedRequest) {
            console.log('✅ Request captured successfully');
            console.log('  URL:', capturedRequest.url);

            const payload = JSON.parse(capturedRequest.options.body);
            console.log('  Payload structure:');
            console.log('    - Role:', payload.role);
            console.log('    - From (phone number):', payload.from);
            console.log('    - Has content:', !!payload.content);
            console.log('    - Source:', payload.metadata?.source);
            console.log('    - Endpoint:', payload.metadata?.endpoint);
            console.log('    - Agent ID:', payload.metadata?.agent_id);
            console.log('    - Phone number in metadata:', payload.metadata?.phoneNumber);

            // Verify the approach
            const isCorrectApproach =
                capturedRequest.url.includes('/api/messages/sms-conversation') &&
                payload.role === 'external' &&
                payload.from === user.phoneNumber &&
                payload.metadata?.source === 'scheduled' &&
                payload.metadata?.endpoint === 'agents' &&
                !payload.conversationId; // Should not have hardcoded conversation ID

            if (isCorrectApproach) {
                console.log('✅ New approach verified successfully!');
                console.log('\n🎉 Dynamic Conversation Discovery Implementation Summary:');
                console.log('1. ✅ Uses user lookup service to find agent by name');
                console.log('2. ✅ Retrieves agent\'s actual phone number');
                console.log('3. ✅ Sends scheduled messages as regular SMS messages');
                console.log('4. ✅ Routes through SMS conversation pipeline');
                console.log('5. ✅ Lets External Client handle conversation discovery/creation');
                console.log('6. ✅ No hardcoded conversation IDs required');
                console.log('\nThe system is now much more flexible and follows the standard SMS flow!');
            } else {
                console.log('❌ New approach verification failed');
                console.log('Expected:');
                console.log('  - URL to include /api/messages/sms-conversation');
                console.log('  - Role to be "external"');
                console.log('  - From to be agent\'s phone number');
                console.log('  - Source to be "scheduled"');
                console.log('  - Endpoint to be "agents"');
                console.log('  - No hardcoded conversationId');
            }
        } else {
            console.log('❌ No request captured');
        }

    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        await userLookupService.disconnect();
    }
}

// Run the verification
verifyDynamicConversationDiscovery().catch(console.error); 