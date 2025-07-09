#!/usr/bin/env node

// tests/run-all-tests.js
// Main test runner for Movies MCP Server

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

class MovieServerTestSuite {
    constructor() {
        this.testSuites = [
            {
                name: 'Unit Tests - Movie Manager',
                command: 'npx',
                args: ['tsx', 'tests/unit/movie-manager.test.ts'],
                timeout: 30000,
                required: true
            },
            {
                name: 'Unit Tests - Suggestion Engine',
                command: 'npx',
                args: ['tsx', 'tests/unit/suggestion-engine.test.ts'],
                timeout: 30000,
                required: true
            },
            {
                name: 'Unit Tests - MCP Data Storage',
                command: 'npx',
                args: ['tsx', 'tests/unit/mcp-data-storage.test.ts'],
                timeout: 45000,
                required: true
            },
            {
                name: 'Integration Tests - Multi-User Workflows',
                command: 'npx',
                args: ['tsx', 'tests/integration/multi-user-workflow.test.ts'],
                timeout: 60000,
                required: true
            },
            {
                name: 'Integration Tests - MCP Data Storage',
                command: 'npx',
                args: ['tsx', 'tests/integration/mcp-data-storage-integration.test.ts'],
                timeout: 60000,
                required: true
            }
        ];

        this.results = [];
        this.startTime = Date.now();
    }

    async runTestSuite(suite) {
        console.log(`\n🚀 Running: ${suite.name}`);
        console.log('─'.repeat(60));

        const startTime = Date.now();

        try {
            const result = await this.executeCommand(suite.command, suite.args, suite.timeout);
            const duration = Date.now() - startTime;

            const testResult = {
                name: suite.name,
                passed: result.exitCode === 0,
                duration,
                output: result.output,
                error: result.error,
                required: suite.required
            };

            this.results.push(testResult);

            if (testResult.passed) {
                console.log(`✅ ${suite.name} - PASSED (${duration}ms)`);
            } else {
                console.log(`❌ ${suite.name} - FAILED (${duration}ms)`);
                if (result.error) {
                    console.log(`Error: ${result.error}`);
                }
            }

            return testResult;
        } catch (error) {
            const duration = Date.now() - startTime;
            const testResult = {
                name: suite.name,
                passed: false,
                duration,
                output: '',
                error: error.message,
                required: suite.required
            };

            this.results.push(testResult);
            console.log(`❌ ${suite.name} - ERROR (${duration}ms)`);
            console.log(`Error: ${error.message}`);

            return testResult;
        }
    }

    async executeCommand(command, args, timeout) {
        return new Promise((resolve, reject) => {
            const childProcess = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, NODE_ENV: 'test' },
                cwd: process.cwd()
            });

            let output = '';
            let error = '';

            childProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            childProcess.stderr.on('data', (data) => {
                error += data.toString();
            });

            const timeoutHandle = setTimeout(() => {
                childProcess.kill('SIGTERM');
                reject(new Error(`Test suite timed out after ${timeout}ms`));
            }, timeout);

            childProcess.on('close', (exitCode) => {
                clearTimeout(timeoutHandle);
                resolve({
                    exitCode,
                    output,
                    error
                });
            });

            childProcess.on('error', (err) => {
                clearTimeout(timeoutHandle);
                reject(err);
            });
        });
    }

    async runAll() {
        console.log('🎬 Movies MCP Server - Test Suite Runner');
        console.log('='.repeat(60));
        console.log(`Started at: ${new Date().toISOString()}`);

        // Check if we can run tests (tsx available)
        try {
            await this.executeCommand('npx', ['tsx', '--version'], 5000);
        } catch (error) {
            console.error('❌ tsx is not available. Please install it:');
            console.error('   npm install tsx');
            process.exit(1);
        }

        // Run all test suites
        for (const suite of this.testSuites) {
            await this.runTestSuite(suite);
        }

        // Print final summary
        this.printSummary();

        // Exit with appropriate code
        const failed = this.results.filter(r => !r.passed && r.required).length;
        process.exit(failed > 0 ? 1 : 0);
    }

    printSummary() {
        const totalDuration = Date.now() - this.startTime;
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        const requiredFailed = this.results.filter(r => !r.passed && r.required).length;

        console.log('\n' + '='.repeat(60));
        console.log('📊 FINAL TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${this.results.length}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Required Failed: ${requiredFailed}`);
        console.log(`Total Time: ${totalDuration}ms`);

        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.results
                .filter(r => !r.passed)
                .forEach(r => {
                    console.log(`   - ${r.name} (${r.required ? 'REQUIRED' : 'optional'})`);
                    if (r.error) {
                        console.log(`     Error: ${r.error.split('\n')[0]}`);
                    }
                });
        }

        if (requiredFailed === 0) {
            console.log('\n🎉 All required tests passed!');
        } else {
            console.log(`\n🚨 ${requiredFailed} required test(s) failed!`);
        }

        // Save test report
        this.saveTestReport();
    }

    async saveTestReport() {
        const report = {
            timestamp: new Date().toISOString(),
            totalDuration: Date.now() - this.startTime,
            summary: {
                total: this.results.length,
                passed: this.results.filter(r => r.passed).length,
                failed: this.results.filter(r => !r.passed).length,
                requiredFailed: this.results.filter(r => !r.passed && r.required).length
            },
            results: this.results
        };

        try {
            await fs.mkdir('test-reports', { recursive: true });
            const reportFile = path.join('test-reports', `test-report-${Date.now()}.json`);
            await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
            console.log(`\n📝 Test report saved to: ${reportFile}`);
        } catch (error) {
            console.warn('⚠️  Failed to save test report:', error.message);
        }
    }
}

// Run the test suite
const testSuite = new MovieServerTestSuite();
testSuite.runAll().catch(error => {
    console.error('💥 Test suite runner failed:', error);
    process.exit(1);
}); 