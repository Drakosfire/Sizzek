#!/usr/bin/env node

/**
 * Test MongoDB integration for scheduled-tasks
 * This script tests both JSON and MongoDB storage backends
 */

import { TaskStorageManager } from './dist/storage/TaskStorageManager.js';
import { TaskManager } from './dist/core/task-manager.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testStorageIntegration() {
    console.log('🧪 Testing Scheduled Tasks Storage Integration...\n');

    // Test 1: JSON Storage
    console.log('📁 Testing JSON Storage:');
    try {
        const jsonConfig = {
            storageType: 'json',
            userBased: false,
            jsonConfig: {
                filePath: './test-tasks.json',
                backupEnabled: true,
                maxBackups: 5,
                backupInterval: 60
            }
        };

        const jsonStorageManager = new TaskStorageManager(jsonConfig);
        await jsonStorageManager.initialize();

        // Test basic operations
        const testTasks = [
            {
                id: 'test-1',
                name: 'Test Task 1',
                description: 'A test task',
                schedule: { type: 'once', delayMinutes: 5 },
                message: 'Test message',
                enabled: true,
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date(),
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0
            }
        ];

        await jsonStorageManager.saveTasks(testTasks);
        const loadedTasks = await jsonStorageManager.loadTasks();

        console.log(`   ✅ JSON Storage: Saved ${testTasks.length} tasks, loaded ${loadedTasks.length} tasks`);

        const health = await jsonStorageManager.getStorageHealth();
        console.log(`   📊 Storage Health: ${health.healthy ? 'Healthy' : 'Unhealthy'}, ${health.taskCount} tasks`);

        await jsonStorageManager.cleanup();

    } catch (error) {
        console.log(`   ❌ JSON Storage Test Failed: ${error.message}`);
    }

    // Test 2: MongoDB Storage (if configured)
    console.log('\n🗄️  Testing MongoDB Storage:');

    if (process.env.MONGO_URI) {
        try {
            const mongoConfig = {
                storageType: 'mongodb',
                userBased: true,
                mongoConfig: {
                    connectionString: process.env.MONGO_URI,
                    databaseName: process.env.MONGODB_DATABASE || 'test_scheduled_tasks',
                    collectionName: 'test_tasks',
                    timeout: 10000,
                    maxRetries: 3,
                    encryptionKey: process.env.CREDS_KEY
                }
            };

            const mongoStorageManager = new TaskStorageManager(mongoConfig);
            await mongoStorageManager.initialize();

            // Test basic operations with user-based storage
            const testTasks = [
                {
                    id: 'mongo-test-1',
                    name: 'MongoDB Test Task',
                    description: 'A test task for MongoDB',
                    schedule: { type: 'daily', time: '09:00', weekdaysOnly: false },
                    message: 'MongoDB test message',
                    enabled: true,
                    status: 'pending',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            const testUserId = 'test-user-123';
            await mongoStorageManager.saveTasks(testTasks, testUserId);
            const loadedTasks = await mongoStorageManager.loadTasks(testUserId);

            console.log(`   ✅ MongoDB Storage: Saved ${testTasks.length} tasks, loaded ${loadedTasks.length} tasks for user ${testUserId}`);

            const health = await mongoStorageManager.getStorageHealth(testUserId);
            console.log(`   📊 Storage Health: ${health.healthy ? 'Healthy' : 'Unhealthy'}, ${health.taskCount} tasks`);

            await mongoStorageManager.cleanup();

        } catch (error) {
            console.log(`   ❌ MongoDB Storage Test Failed: ${error.message}`);
            console.log('   💡 Ensure MongoDB is running and MONGO_URI is set');
        }
    } else {
        console.log('   ⏭️  Skipping MongoDB test (no connection string configured)');
        console.log('   💡 Set MONGO_URI to test MongoDB integration');
    }

    // Test 3: TaskManager Integration
    console.log('\n🎯 Testing TaskManager Integration:');
    try {
        const taskManager = new TaskManager();
        await taskManager.initialize();

        // Create a test task
        const testTask = await taskManager.createTask({
            name: 'Integration Test Task',
            description: 'Testing full integration',
            schedule: { type: 'once', delayMinutes: 0.1 }, // 6 seconds
            message: 'Integration test complete!',
            enabled: false // Don't actually run it
        });

        console.log(`   ✅ TaskManager: Created task "${testTask.name}" (ID: ${testTask.id})`);

        const allTasks = taskManager.getAllTasks();
        console.log(`   📋 TaskManager: Total tasks in system: ${allTasks.length}`);

        // Clean up
        await taskManager.deleteTask(testTask.id);
        await taskManager.cleanup();

        console.log(`   🧹 TaskManager: Cleanup completed`);

    } catch (error) {
        console.log(`   ❌ TaskManager Test Failed: ${error.message}`);
    }

    console.log('\n🎉 Storage Integration Tests Complete!');
    console.log('\nNext Steps:');
    console.log('   1. Set MCP_STORAGE_TYPE=mongodb in your .env to use MongoDB');
    console.log('   2. Configure MONGO_URI for your database');
    console.log('   3. Set MCP_USER_BASED=true for multi-user support');
    console.log('   4. The server will automatically migrate existing JSON data');
}

// Run the test
testStorageIntegration().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
}); 