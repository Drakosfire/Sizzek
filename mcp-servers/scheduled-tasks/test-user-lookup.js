#!/usr/bin/env node

/**
 * Test the actual UserLookupService with real database
 */

import { createUserLookupService } from './dist/src/http/user-lookup.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testUserLookupService() {
    console.log('🧪 Testing UserLookupService with Real Database');
    console.log('===============================================');

    const userLookupService = createUserLookupService();

    try {
        console.log('🔌 Initializing UserLookupService...');
        await userLookupService.initialize();
        console.log('✅ UserLookupService initialized successfully');
        console.log('');

        // Test looking up user by agent name "Sizzek"
        console.log('🔍 Testing: lookupUserIdByAgentName("Sizzek")');
        const userId = await userLookupService.lookupUserIdByAgentName('Sizzek');

        if (userId) {
            console.log(`✅ Success! Found user ID: ${userId}`);

            // Also test looking up the user by ID
            console.log('🔍 Testing: lookupUserById() with found ID');
            const user = await userLookupService.lookupUserById(userId);
            if (user) {
                console.log('✅ User details:');
                console.log(`  📝 name: "${user.name}"`);
                console.log(`  📧 email: "${user.email}"`);
                console.log(`  📞 phoneNumber: "${user.phoneNumber}"`);
                console.log(`  🆔 _id: ${user._id}`);
            } else {
                console.log('❌ Failed to lookup user by ID');
            }
        } else {
            console.log('❌ Failed to find user with agent name "Sizzek"');
        }

        console.log('');

        // Test phone number pattern lookup
        console.log('🔍 Testing: lookupUserIdByAgentName("3022716778") - phone pattern');
        const phoneUserId = await userLookupService.lookupUserIdByAgentName('3022716778');

        if (phoneUserId) {
            console.log(`✅ Success! Found user by phone pattern: ${phoneUserId}`);
        } else {
            console.log('❌ Failed to find user by phone pattern');
        }

    } catch (error) {
        console.error('❌ Error testing UserLookupService:', error);
    } finally {
        console.log('');
        console.log('🔌 Disconnecting from database...');
        await userLookupService.disconnect();
        console.log('✅ Test completed');
    }
}

// Run the test
testUserLookupService().catch(console.error); 