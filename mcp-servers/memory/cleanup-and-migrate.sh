 #!/bin/sh

# Memory MCP Server Test Cleanup and Migration Script
# POSIX-compatible version

set -e

echo "🚀 Memory MCP Server Test Cleanup and Migration"
echo "=============================================="

# Check if we're in the right directory
if [ ! -f "index.ts" ]; then
    echo "❌ Error: This script must be run from the memory MCP server directory"
    exit 1
fi

echo "📍 Working directory: $(pwd)"

# 1. Create archive directory
echo ""
echo "📁 Step 1: Creating archive directory..."
mkdir -p archive
echo "✅ Created archive/ directory"

# 2. Archive old test files
echo ""
echo "🗂️  Step 2: Archiving old test files..."

for file in \
    "test-phase-2-1-integration.js" \
    "test-mongodb-storage.js" \
    "test-user-isolation.js" \
    "test-mongodb-isolation.js" \
    "debug-mcp-storage.js" \
    "run-storage-tests.js" \
    "mcp-storage-diagnostic-report.json"
do
    if [ -f "$file" ]; then
        echo "  📦 Archiving $file"
        mv "$file" archive/
    fi
done

echo "✅ Old test files archived"

# 3. Create test directory structure
echo ""
echo "📁 Step 3: Creating test directory structure..."

mkdir -p tests/helpers
mkdir -p tests/unit/storage
mkdir -p tests/unit/mcp-tools
mkdir -p tests/integration
mkdir -p tests/performance
mkdir -p tests/edge-cases

echo "✅ Test directory structure created"

# 4. Create basic helper files
echo ""
echo "🛠️  Step 4: Creating basic helper files..."

# Basic test setup
cat > tests/helpers/test-setup.js << 'EOF'
/**
 * Global Test Setup Configuration
 */

import { config } from 'dotenv';
config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
process.env.MCP_DEBUG = 'false';

if (!process.env.MONGO_URI) {
    process.env.MONGO_URI = 'mongodb://localhost:27017';
}

if (!process.env.MONGODB_TEST_DATABASE) {
    process.env.MONGODB_TEST_DATABASE = 'mcp_test_db';
}

console.log('🧪 Test environment initialized');
EOF

# Create .env.test
cat > .env.test << 'EOF'
# Test Environment Configuration
MONGO_URI=mongodb://localhost:27017
MONGODB_TEST_DATABASE=mcp_test_db
MONGODB_COLLECTION_PREFIX=test_memory
NODE_ENV=test
MCP_STORAGE_TYPE=paginated-graph
MCP_USER_BASED=true
MCP_DEBUG=false
TEST_CLEANUP_ON_EXIT=true
EOF

echo "✅ Created basic helper files"

# 5. Create placeholder test file
echo ""
echo "📝 Step 5: Creating placeholder test..."

cat > tests/unit/storage/basic.test.js << 'EOF'
/**
 * Basic Storage Test - Placeholder
 * Verifies test environment is working
 */

import assert from 'assert';

describe('Test Environment', function() {
    it('should have basic test setup working', function() {
        assert.strictEqual(process.env.NODE_ENV, 'test');
        console.log('✅ Test environment is working');
    });
});
EOF

echo "✅ Created placeholder test"

echo ""
echo "🎉 Basic Migration Completed!"
echo "============================"
echo ""
echo "🚀 Next Steps:"
echo "1. cd tests && npm install"
echo "2. cd ../../../mcp-data && npm run build  # Build the mcp-data package"
echo "3. cd ../mcp-servers/memory/tests && npm test  # Test the setup"
echo ""
echo "✅ Ready for development!"