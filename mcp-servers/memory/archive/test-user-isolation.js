#!/usr/bin/env node

// Test script to verify user isolation in the memory MCP server
import { EnhancedStorageManager } from './dist/storage-manager.js';

async function testUserIsolation() {
    console.log('🧪 Testing User Isolation in Memory MCP Server\n');

    // Test with JSON storage first
    process.env.MCP_STORAGE_TYPE = 'json';
    process.env.MEMORY_FILE_PATH = './Sizzek/memory_files/test-memory.json';

    try {
        // Create storage managers for different users
        console.log('📝 Creating storage managers for different users...');

        // User 1
        process.env.MCP_USER_ID = 'user-alice';
        const aliceStorage = new EnhancedStorageManager();

        // User 2
        process.env.MCP_USER_ID = 'user-bob';
        const bobStorage = new EnhancedStorageManager();

        // Test creating entities for Alice
        console.log('\n🔹 Creating entities for Alice...');
        const aliceEntities = await aliceStorage.createEntities([
            {
                name: 'Alice-Project',
                entityType: 'Project',
                observations: ['Working on SMS integration', 'Making good progress']
            }
        ]);
        console.log('✅ Alice entities created:', aliceEntities.length);

        // Test creating entities for Bob
        console.log('\n🔹 Creating entities for Bob...');
        const bobEntities = await bobStorage.createEntities([
            {
                name: 'Bob-Project',
                entityType: 'Project',
                observations: ['Working on calendar integration', 'Testing Google Calendar API']
            }
        ]);
        console.log('✅ Bob entities created:', bobEntities.length);

        // Verify isolation - Alice should only see her data
        console.log('\n🔍 Testing isolation - reading Alice\'s graph...');
        const aliceGraph = await aliceStorage.readGraph();
        console.log('📊 Alice sees entities:', aliceGraph.entities.map(e => e.name));

        // Verify isolation - Bob should only see his data
        console.log('\n🔍 Testing isolation - reading Bob\'s graph...');
        const bobGraph = await bobStorage.readGraph();
        console.log('📊 Bob sees entities:', bobGraph.entities.map(e => e.name));

        // Check cross-contamination
        const aliceHasBobData = aliceGraph.entities.some(e => e.name.includes('Bob'));
        const bobHasAliceData = bobGraph.entities.some(e => e.name.includes('Alice'));

        console.log('\n🛡️  User Isolation Results:');
        console.log(`   Alice can see Bob's data: ${aliceHasBobData ? '❌ FAILED' : '✅ PASS'}`);
        console.log(`   Bob can see Alice's data: ${bobHasAliceData ? '❌ FAILED' : '✅ PASS'}`);

        // Test search isolation
        console.log('\n🔍 Testing search isolation...');
        const aliceSearch = await aliceStorage.searchNodes('Project');
        const bobSearch = await bobStorage.searchNodes('Project');

        console.log('🔍 Alice search results:', aliceSearch.entities.map(e => e.name));
        console.log('🔍 Bob search results:', bobSearch.entities.map(e => e.name));

        // Storage type info
        console.log('\n💾 Storage Information:');
        console.log(`   Alice storage type: ${aliceStorage.getStorageType()}`);
        console.log(`   Bob storage type: ${bobStorage.getStorageType()}`);

        console.log('\n🎉 User isolation test completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
testUserIsolation().catch(console.error); 