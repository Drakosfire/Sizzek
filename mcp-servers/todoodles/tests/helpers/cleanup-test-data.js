#!/usr/bin/env node

/**
 * Cleanup Test Data Script for Todoodles MCP Server
 * Removes all test data from MongoDB and JSON storage
 */

import { cleanupAllTestDatabases } from './test-database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('🧹 Starting test data cleanup...');

    try {
        // Set environment variables for test connections
        process.env.TEST_MONGODB_CONNECTION = process.env.TEST_MONGODB_CONNECTION || 'mongodb://localhost:27017/test_todoodles';

        // Run cleanup
        await cleanupAllTestDatabases();

        console.log('✅ Test data cleanup completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Test data cleanup failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { main as cleanupTestData }; 