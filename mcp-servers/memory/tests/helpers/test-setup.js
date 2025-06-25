/**
 * Global Test Setup Configuration
 */

import { config } from 'dotenv';
config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
process.env.MCP_DEBUG = 'false';

if (!process.env.MONGODB_CONNECTION_STRING) {
    process.env.MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017';
}

if (!process.env.MONGODB_TEST_DATABASE) {
    process.env.MONGODB_TEST_DATABASE = 'mcp_test_db';
}

console.log('🧪 Test environment initialized');
