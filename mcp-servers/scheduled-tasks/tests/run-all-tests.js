#!/usr/bin/env node

import { validateTestUtilities } from './helpers/test-utilities.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TESTS_CONFIG = [
    {
        name: 'Test Utilities Validation',
        runner: validateTestUtilities,
        timeout: 30000 // 30 second timeout
    },
    {
        name: 'User Lookup Unit Tests',
        file: 'unit/user-lookup.test.js',
        timeout: 60000 // 60 second timeout
    },
    {
        name: 'User Lookup Integration Tests',
        file: 'integration/user-lookup-integration.test.js',
        timeout: 90000 // 90 second timeout
    },
    {
        name: 'User Context Utils Unit Tests',
        jest: 'tests/unit/user-context.test.ts',
        timeout: 60000 // 60 second timeout
    },
    {
        name: 'Task Manager Context Unit Tests',
        jest: 'tests/unit/task-manager-context.test.ts',
        timeout: 120000 // 120 second timeout (includes file I/O)
    },
    {
        name: 'Migration Unit Tests',
        jest: 'tests/unit/migration.test.ts',
        timeout: 120000 // 120 second timeout (includes large dataset tests)
    },
    {
        name: 'User Context Integration Tests',
        jest: 'tests/integration/user-context-integration.test.ts',
        timeout: 180000 // 180 second timeout (end-to-end tests with mocks)
    }
];

// Global test state
let testResults = [];
let totalStartTime = Date.now();

// Utility function to run a test with timeout
async function runWithTimeout(testPromise, timeout, testName) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Test "${testName}" timed out after ${timeout}ms`));
        }, timeout);

        testPromise
            .then(result => {
                clearTimeout(timeoutId);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

// Run a test file as a separate process
async function runTestFile(testFile, timeout) {
    return new Promise((resolve, reject) => {
        const testPath = join(__dirname, testFile);
        const child = spawn('node', [testPath], {
            stdio: 'pipe',
            env: { ...process.env, NODE_ENV: 'test' }
        });

        let stdout = '';
        let stderr = '';
        let isTimedOut = false;

        // Set up timeout
        const timeoutId = setTimeout(() => {
            isTimedOut = true;
            child.kill('SIGTERM');
            reject(new Error(`Test file "${testFile}" timed out after ${timeout}ms`));
        }, timeout);

        child.stdout.on('data', (data) => {
            stdout += data;
            process.stdout.write(data); // Pass through to console
        });

        child.stderr.on('data', (data) => {
            stderr += data;
            process.stderr.write(data); // Pass through to console
        });

        child.on('close', (code) => {
            clearTimeout(timeoutId);

            if (isTimedOut) {
                return; // Already rejected
            }

            if (code === 0) {
                resolve({ success: true, stdout, stderr });
            } else {
                reject(new Error(`Test file "${testFile}" failed with exit code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
            }
        });

        child.on('error', (error) => {
            clearTimeout(timeoutId);
            if (!isTimedOut) {
                reject(new Error(`Failed to start test file "${testFile}": ${error.message}`));
            }
        });
    });
}

// Run Jest tests
async function runJestTest(testPath, timeout) {
    return new Promise((resolve, reject) => {
        const child = spawn('npx', ['jest', testPath, '--verbose'], {
            stdio: 'pipe',
            env: { ...process.env, NODE_ENV: 'test' }
        });

        let stdout = '';
        let stderr = '';
        let isTimedOut = false;

        // Set up timeout
        const timeoutId = setTimeout(() => {
            isTimedOut = true;
            child.kill('SIGTERM');
            reject(new Error(`Jest test "${testPath}" timed out after ${timeout}ms`));
        }, timeout);

        child.stdout.on('data', (data) => {
            stdout += data;
            process.stdout.write(data); // Pass through to console
        });

        child.stderr.on('data', (data) => {
            stderr += data;
            process.stderr.write(data); // Pass through to console
        });

        child.on('close', (code) => {
            clearTimeout(timeoutId);

            if (isTimedOut) {
                return; // Already rejected
            }

            if (code === 0) {
                resolve({ success: true, stdout, stderr });
            } else {
                reject(new Error(`Jest test "${testPath}" failed with exit code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
            }
        });

        child.on('error', (error) => {
            clearTimeout(timeoutId);
            if (!isTimedOut) {
                reject(new Error(`Failed to start Jest test "${testPath}": ${error.message}`));
            }
        });
    });
}

// Run individual test
async function runTest(testConfig) {
    const startTime = Date.now();

    try {
        console.log(`\n🚀 Running ${testConfig.name}...`);
        console.log('='.repeat(60));

        let result;

        if (testConfig.runner) {
            // Direct function call
            result = await runWithTimeout(
                testConfig.runner(),
                testConfig.timeout,
                testConfig.name
            );
        } else if (testConfig.jest) {
            // Run Jest test
            result = await runWithTimeout(
                runJestTest(testConfig.jest, testConfig.timeout),
                testConfig.timeout + 5000, // Add 5 seconds buffer
                testConfig.name
            );
        } else if (testConfig.file) {
            // Run test file
            result = await runWithTimeout(
                runTestFile(testConfig.file, testConfig.timeout),
                testConfig.timeout + 5000, // Add 5 seconds buffer
                testConfig.name
            );
        } else {
            throw new Error('Invalid test configuration');
        }

        const duration = Date.now() - startTime;

        const testResult = {
            name: testConfig.name,
            success: true,
            duration,
            details: result
        };

        testResults.push(testResult);

        console.log(`\n✅ ${testConfig.name} completed successfully in ${duration}ms`);
        return testResult;

    } catch (error) {
        const duration = Date.now() - startTime;

        const testResult = {
            name: testConfig.name,
            success: false,
            duration,
            error: error.message,
            details: error.stack || ''
        };

        testResults.push(testResult);

        console.log(`\n❌ ${testConfig.name} failed in ${duration}ms`);
        console.log(`   Error: ${error.message}`);

        return testResult;
    }
}

// Generate comprehensive test report
function generateTestReport() {
    const totalDuration = Date.now() - totalStartTime;
    const successfulTests = testResults.filter(t => t.success);
    const failedTests = testResults.filter(t => !t.success);

    console.log('\n' + '='.repeat(80));
    console.log('🎯 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(80));

    console.log(`📊 Overall Results:`);
    console.log(`   Total Tests: ${testResults.length}`);
    console.log(`   Passed: ${successfulTests.length}`);
    console.log(`   Failed: ${failedTests.length}`);
    console.log(`   Total Duration: ${totalDuration}ms`);
    console.log(`   Success Rate: ${Math.round((successfulTests.length / testResults.length) * 100)}%`);

    if (successfulTests.length > 0) {
        console.log(`\n✅ Successful Tests:`);
        successfulTests.forEach(test => {
            console.log(`   • ${test.name} (${test.duration}ms)`);
        });
    }

    if (failedTests.length > 0) {
        console.log(`\n❌ Failed Tests:`);
        failedTests.forEach(test => {
            console.log(`   • ${test.name} (${test.duration}ms)`);
            console.log(`     Error: ${test.error}`);
        });
    }

    // Performance insights
    const avgDuration = testResults.reduce((sum, test) => sum + test.duration, 0) / testResults.length;
    const slowTests = testResults.filter(test => test.duration > avgDuration * 2);

    if (slowTests.length > 0) {
        console.log(`\n🐌 Performance Insights:`);
        console.log(`   Average Duration: ${Math.round(avgDuration)}ms`);
        console.log(`   Slow Tests (>2x average):`);
        slowTests.forEach(test => {
            console.log(`     • ${test.name}: ${test.duration}ms`);
        });
    }

    console.log('\n' + '='.repeat(80));

    return {
        totalTests: testResults.length,
        passedTests: successfulTests.length,
        failedTests: failedTests.length,
        totalDuration,
        successRate: Math.round((successfulTests.length / testResults.length) * 100)
    };
}

// Main test runner
async function runAllTests() {
    console.log('🧪 Starting Comprehensive Test Suite for Scheduled Tasks MCP Server');
    console.log('='.repeat(80));
    console.log(`📅 Started at: ${new Date().toISOString()}`);

    totalStartTime = Date.now();

    // Set up cleanup on exit
    const cleanup = async () => {
        console.log('\n🧹 Cleaning up test environment...');
        try {
            // Kill any remaining child processes
            process.removeAllListeners();

            // Give a brief moment for cleanup
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log('✅ Cleanup completed');
        } catch (error) {
            console.error('❌ Cleanup error:', error.message);
        }
    };

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Received SIGINT, cleaning up...');
        await cleanup();
        process.exit(130);
    });

    process.on('SIGTERM', async () => {
        console.log('\n🛑 Received SIGTERM, cleaning up...');
        await cleanup();
        process.exit(143);
    });

    try {
        // Run all tests
        for (const testConfig of TESTS_CONFIG) {
            await runTest(testConfig);

            // Small delay between tests to prevent resource conflicts
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Generate final report
        const report = generateTestReport();

        await cleanup();

        // Exit with appropriate code
        const exitCode = report.failedTests > 0 ? 1 : 0;

        if (exitCode === 0) {
            console.log('\n🎉 All tests passed successfully!');
        } else {
            console.log('\n💥 Some tests failed!');
        }

        process.exit(exitCode);

    } catch (error) {
        console.error('\n💥 Critical error in test runner:', error);
        await cleanup();
        process.exit(1);
    }
}

// Run the tests
runAllTests().catch(async (error) => {
    console.error('💥 Fatal error:', error);

    // Emergency cleanup
    try {
        await new Promise(resolve => setTimeout(resolve, 100));
    } catch (cleanupError) {
        console.error('💥 Cleanup error:', cleanupError);
    }

    process.exit(1);
}); 