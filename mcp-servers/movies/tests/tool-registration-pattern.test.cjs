// This file should be named tool-registration-pattern.test.cjs for CommonJS compatibility
const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '../src/index.ts');
const SRC = fs.readFileSync(INDEX_PATH, 'utf-8');

// Find all setRequestHandler calls
const handlerRegex = /setRequestHandler\(([^,]+),/g;
let match;
let violations = [];

while ((match = handlerRegex.exec(SRC)) !== null) {
    const arg = match[1].trim();
    // Allow only CallToolRequestSchema or ListToolsRequestSchema
    if (
        !/CallToolRequestSchema|ListToolsRequestSchema/.test(arg) &&
        // Disallow string literals
        (/^['"][a-zA-Z0-9_\-]+['"]$/.test(arg) || /^[a-zA-Z0-9_\-]+$/.test(arg))
    ) {
        violations.push({
            line: SRC.substr(0, match.index).split('\n').length,
            code: SRC.substr(match.index, 80)
        });
    }
}

if (violations.length > 0) {
    console.error('❌ Tool registration pattern violation(s) found:');
    violations.forEach(v => {
        console.error(`  Line ${v.line}: ${v.code}`);
    });
    process.exit(1);
} else {
    console.log('✅ Tool registration pattern test passed: Only schema-based handlers are used.');
} 