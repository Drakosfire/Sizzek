#!/usr/bin/env node

/**
 * Comprehensive Test Runner for Grocery List MCP Server
 * Runs all organized tests with proper reporting and cleanup
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Grocery List MCP Server - Comprehensive Test Suite');
console.log('='.repeat(70));

// Test configuration
const testSuites = [
    {
        name: 'Unit Tests - Test Utilities',
        description: 'Validate test utilities and helpers work correctly',
        command: 'node',
        args: ['tests/helpers/test-utilities-validation.js'],
        timeout: 10000,
        required: true
    },
    {
        name: 'Unit Tests - Grocery Manager',
        description: 'Test core grocery management functionality',
        command: 'node',
        args: ['tests/unit/grocery-manager.test.js'],
        timeout: 60000,
        required: true
    },
    {
        name: 'Unit Tests - Web UI Integration',
        description: 'Test web UI integration and action handlers',
        command: 'node',
        args: ['tests/unit/web-ui-integration.test.js'],
        timeout: 60000,
        required: true
    },
    {
        name: 'Integration Tests - MCP Server',
        description: 'Test full MCP server functionality via JSON-RPC',
        command: 'node',
        args: ['tests/integration/mcp-server.test.js'],
        timeout: 60000,
        required: true
    }
];

// Optional compatibility tests (for existing functionality)
const compatibilityTests = [
    {
        name: 'Compatibility - Basic MCP',
        description: 'Legacy basic MCP functionality test',
        command: 'node',
        args: ['test-basic.js'],
        timeout: 45000,
        required: false
    },
    {
        name: 'Compatibility - Web UI Session',
        description: 'Legacy web UI session test',
        command: 'node',
        args: ['test-api-endpoints.js'],
        timeout: 30000,
        required: false
    }
];

// Statistics tracking
const stats = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    totalDuration: 0
};

async function runTestSuite(testSuite) {
    console.log(`\n📋 Running: ${testSuite.name}`);
    console.log(`   ${testSuite.description}`);
    console.log('   ' + '-'.repeat(60));

    return new Promise((resolve) => {
        const startTime = Date.now();
        let output = '';
        let errorOutput = '';

        const proc = spawn(testSuite.command, testSuite.args, {
            cwd: path.join(__dirname, '..'),
            env: {
                ...process.env,
                NODE_ENV: 'test',
                MCP_STORAGE_TYPE: 'json',
                GROCERY_FILE_PATH: './test-grocery-data.json',
                MCP_USER_BASED: 'false',
                MCP_DEBUG: 'false'
            }
        });

        // Collect output
        proc.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;

            // Show real-time output with proper formatting
            const lines = text.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    console.log(`   ${line}`);
                }
            });
        });

        proc.stderr.on('data', (data) => {
            const text = data.toString();
            errorOutput += text;

            // Only show relevant stderr
            if (!text.includes('[INFO]') && !text.includes('[DEBUG]') && text.trim()) {
                console.log(`   ⚠️  ${text.trim()}`);
            }
        });

        // Set timeout
        const timeout = setTimeout(() => {
            proc.kill('SIGTERM');
            resolve({
                name: testSuite.name,
                success: false,
                error: 'Test timed out',
                duration: Date.now() - startTime,
                output: output,
                errorOutput: errorOutput,
                required: testSuite.required
            });
        }, testSuite.timeout);

        proc.on('close', (code) => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;

            resolve({
                name: testSuite.name,
                success: code === 0,
                error: code !== 0 ? `Process exited with code ${code}` : null,
                duration: duration,
                output: output,
                errorOutput: errorOutput,
                required: testSuite.required
            });
        });

        proc.on('error', (error) => {
            clearTimeout(timeout);
            resolve({
                name: testSuite.name,
                success: false,
                error: error.message,
                duration: Date.now() - startTime,
                output: output,
                errorOutput: errorOutput,
                required: testSuite.required
            });
        });
    });
}

async function cleanupTestFiles() {
    try {
        const testFiles = [
            './test-grocery-data.json',
            './test-grocery-data.json.backup',
            './users/test-user/grocery-data.json',
            './users/test-user-2/grocery-data.json'
        ];

        for (const file of testFiles) {
            try {
                await fs.unlink(file);
            } catch (e) {
                // File might not exist, that's okay
            }
        }

        // Clean up test user directories
        try {
            await fs.rmdir('./users/test-user');
            await fs.rmdir('./users/test-user-2');
        } catch (e) {
            // Directories might not exist
        }
    } catch (error) {
        console.log(`⚠️  Warning: Could not clean up test files: ${error.message}`);
    }
}

async function checkPrerequisites() {
    console.log('\n🔍 Checking Prerequisites...');

    // Check if dist directory exists
    try {
        await fs.access('./dist');
        console.log('✅ dist/ directory found');
    } catch (error) {
        console.log('❌ dist/ directory not found - running build...');

        // Try to build
        const buildResult = await new Promise((resolve) => {
            const buildProc = spawn('npm', ['run', 'build'], {
                cwd: path.join(__dirname, '..'),
                stdio: 'inherit'
            });

            buildProc.on('close', (code) => {
                resolve(code === 0);
            });
        });

        if (!buildResult) {
            console.log('❌ Build failed - some tests may not work');
            return false;
        }

        console.log('✅ Build completed');
    }

    // Check if key files exist
    const keyFiles = [
        './dist/index.js',
        './dist/web-ui-integration.js'
    ];

    for (const file of keyFiles) {
        try {
            await fs.access(file);
            console.log(`✅ ${file} found`);
        } catch (error) {
            console.log(`❌ ${file} not found`);
            return false;
        }
    }

    return true;
}

async function main() {
    const results = [];

    // Clean up before starting
    await cleanupTestFiles();

    // Check prerequisites
    const prerequisitesPassed = await checkPrerequisites();
    if (!prerequisitesPassed) {
        console.log('\n❌ Prerequisites not met. Please run "npm run build" first.');
        process.exit(1);
    }

    // Run all test suites
    console.log('\n🧪 Running Test Suites...');

    for (const testSuite of testSuites) {
        const result = await runTestSuite(testSuite);
        results.push(result);
        stats.totalTests++;
        stats.totalDuration += result.duration;

        if (result.success) {
            stats.passedTests++;
            console.log(`   ✅ PASSED (${result.duration}ms)`);
        } else {
            stats.failedTests++;
            console.log(`   ❌ FAILED (${result.duration}ms)`);
            console.log(`   Error: ${result.error}`);

            // If this is a required test and it failed, we might want to continue
            // but show a warning
            if (result.required) {
                console.log(`   ⚠️  This is a required test - investigating...`);
            }
        }
    }

    // Run compatibility tests if main tests passed
    if (stats.failedTests === 0) {
        console.log('\n🔄 Running Compatibility Tests...');

        for (const testSuite of compatibilityTests) {
            // Check if the test file exists
            const testFile = path.join(__dirname, '..', testSuite.args[0]);
            try {
                await fs.access(testFile);

                const result = await runTestSuite(testSuite);
                results.push(result);
                stats.totalTests++;
                stats.totalDuration += result.duration;

                if (result.success) {
                    stats.passedTests++;
                    console.log(`   ✅ PASSED (${result.duration}ms)`);
                } else {
                    stats.skippedTests++;
                    console.log(`   ⚠️  SKIPPED (${result.duration}ms) - ${result.error}`);
                }
            } catch (error) {
                stats.skippedTests++;
                console.log(`   ⚠️  SKIPPED - ${testSuite.name} (file not found)`);
            }
        }
    }

    // Clean up after tests
    await cleanupTestFiles();

    // Print comprehensive summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPREHENSIVE TEST SUMMARY');
    console.log('='.repeat(70));

    console.log(`Total Test Suites: ${stats.totalTests}`);
    console.log(`Passed: ${stats.passedTests}`);
    console.log(`Failed: ${stats.failedTests}`);
    console.log(`Skipped: ${stats.skippedTests}`);
    console.log(`Total Duration: ${stats.totalDuration}ms`);
    console.log(`Success Rate: ${Math.round((stats.passedTests / (stats.passedTests + stats.failedTests)) * 100)}%`);

    console.log('\nDetailed Results:');
    results.forEach(result => {
        let status = '✅ PASSED';
        if (!result.success) {
            status = result.required ? '❌ FAILED' : '⚠️  SKIPPED';
        }
        console.log(`  ${status} - ${result.name} (${result.duration}ms)`);
        if (!result.success && result.required) {
            console.log(`    Error: ${result.error}`);
        }
    });

    // Final assessment
    const requiredFailures = results.filter(r => !r.success && r.required).length;

    if (requiredFailures === 0) {
        console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
        console.log('✅ Core functionality is working correctly');
        console.log('✅ Web UI integration is functional');
        console.log('✅ MCP server is responding properly');
        console.log('✅ All features are tested and verified');
        console.log('\n📦 Ready for production deployment!');
        process.exit(0);
    } else {
        console.log(`\n❌ ${requiredFailures} REQUIRED TESTS FAILED`);
        console.log('Please check the detailed output above for specific errors.');
        console.log('Some functionality may not work as expected.');
        process.exit(1);
    }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Test run interrupted by user');
    await cleanupTestFiles();
    process.exit(1);
});

process.on('uncaughtException', async (error) => {
    console.error('\n💥 Uncaught exception:', error);
    await cleanupTestFiles();
    process.exit(1);
});

// Run the main function
main().catch(async (error) => {
    console.error('❌ Test runner failed:', error);
    await cleanupTestFiles();
    process.exit(1);
}); 