#!/usr/bin/env node

// Test script to verify MongoDB user isolation in the memory MCP server
import { EnhancedStorageManager } from './dist/storage-manager.js';

async function testMongoDBIsolation() {
    console.log('🧪 Testing MongoDB User Isolation in Memory MCP Server\n');

    // Test with MongoDB storage
    process.env.MCP_STORAGE_TYPE = 'mongodb';
    process.env.MONGO_URI = 'mongodb://localhost:27017';
    process.env.MCP_DEBUG = 'true';

    try {
        console.log('📝 Creating MongoDB storage managers for different users...');

        // User 1 - SMS User
        process.env.MCP_USER_ID = '+1234567890';
        const smsUserStorage = new EnhancedStorageManager();

        // User 2 - Email User  
        process.env.MCP_USER_ID = 'user@example.com';
        const emailUserStorage = new EnhancedStorageManager();

        // Test creating entities for SMS user
        console.log('\n🔹 Creating entities for SMS user (+1234567890)...');
        const smsEntities = await smsUserStorage.createEntities([
            {
                name: 'SMS-Conversation',
                entityType: 'Conversation',
                observations: ['User asked about weather', 'Provided forecast for Seattle']
            }
        ]);
        console.log('✅ SMS user entities created:', smsEntities.length);

        // Test creating entities for email user
        console.log('\n🔹 Creating entities for email user...');
        const emailEntities = await emailUserStorage.createEntities([
            {
                name: 'Email-Project',
                entityType: 'Project',
                observations: ['Working on API integration', 'Need to add authentication']
            }
        ]);
        console.log('✅ Email user entities created:', emailEntities.length);

        // Test relations for SMS user
        console.log('\n🔹 Creating relations for SMS user...');
        const smsRelations = await smsUserStorage.createRelations([
            {
                from: 'SMS-Conversation',
                to: 'Weather-Service',
                relationType: 'uses'
            }
        ]);
        console.log('✅ SMS user relations created:', smsRelations.length);

        // Verify isolation - SMS user should only see their data
        console.log('\n🔍 Testing isolation - reading SMS user\'s graph...');
        const smsGraph = await smsUserStorage.readGraph();
        console.log('📊 SMS user sees entities:', smsGraph.entities.map(e => e.name));
        console.log('📊 SMS user sees relations:', smsGraph.relations.map(r => `${r.from} ${r.relationType} ${r.to}`));

        // Verify isolation - Email user should only see their data
        console.log('\n🔍 Testing isolation - reading email user\'s graph...');
        const emailGraph = await emailUserStorage.readGraph();
        console.log('📊 Email user sees entities:', emailGraph.entities.map(e => e.name));
        console.log('📊 Email user sees relations:', emailGraph.relations.map(r => `${r.from} ${r.relationType} ${r.to}`));

        // Check cross-contamination
        const smsHasEmailData = smsGraph.entities.some(e => e.name.includes('Email'));
        const emailHasSMSData = emailGraph.entities.some(e => e.name.includes('SMS'));

        console.log('\n🛡️  MongoDB User Isolation Results:');
        console.log(`   SMS user can see email data: ${smsHasEmailData ? '❌ FAILED' : '✅ PASS'}`);
        console.log(`   Email user can see SMS data: ${emailHasSMSData ? '❌ FAILED' : '✅ PASS'}`);

        // Test search isolation
        console.log('\n🔍 Testing MongoDB search isolation...');
        const smsSearch = await smsUserStorage.searchNodes('Conversation');
        const emailSearch = await emailUserStorage.searchNodes('Project');

        console.log('🔍 SMS user search results:', smsSearch.entities.map(e => e.name));
        console.log('🔍 Email user search results:', emailSearch.entities.map(e => e.name));

        // Storage stats
        console.log('\n📊 MongoDB Storage Statistics:');
        const smsStats = await smsUserStorage.getStorageStats();
        const emailStats = await emailUserStorage.getStorageStats();

        console.log('📊 SMS user stats:', smsStats);
        console.log('📊 Email user stats:', emailStats);

        console.log('\n🎉 MongoDB user isolation test completed successfully!');

    } catch (error) {
        console.error('❌ MongoDB test failed:', error);
        console.log('\n💡 Note: Make sure MongoDB is running on localhost:27017');
        console.log('   Docker command: docker run -d --name test-mongo -p 27017:27017 mongo:latest');
        process.exit(1);
    }
}

// Run the test
testMongoDBIsolation().catch(console.error); 