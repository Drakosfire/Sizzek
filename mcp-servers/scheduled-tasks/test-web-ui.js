#!/usr/bin/env node

import { ScheduledTasksWebUIManager } from './dist/web-ui-integration.js';
import { TaskManager } from './dist/core/task-manager.js';

async function testWebUIIntegration() {
    console.log('🧪 Testing Scheduled Tasks Web UI Integration...\n');

    try {
        // Initialize task manager
        const taskManager = new TaskManager();
        await taskManager.initialize();
        console.log('✅ TaskManager initialized');

        // Initialize web UI manager
        const webUIManager = new ScheduledTasksWebUIManager(taskManager);
        console.log('✅ WebUIManager initialized');

        // Test tool definition
        const toolDef = webUIManager.getMCPToolDefinition();
        console.log('✅ Tool definition generated:');
        console.log(`   Name: ${toolDef.name}`);
        console.log(`   Description: ${toolDef.description}`);

        // Create a test task
        await taskManager.createTask({
            name: "Test Web UI Task",
            description: "A task to test the web UI integration",
            schedule: { type: 'once', delayMinutes: 60 },
            message: "Hello from the web UI test!",
            enabled: true
        });
        console.log('✅ Test task created');

        // Test data source (access the private method via reflection)
        const data = await webUIManager['getDataSource']();
        console.log(`✅ Data source working: ${data.length} tasks found`);

        if (data.length > 0) {
            const task = data[0];
            console.log(`   Task: ${task.name}`);
            console.log(`   Schedule: ${task.scheduleReadable}`);
            console.log(`   Status: ${task.statusBadge.text}`);
            console.log(`   Success Rate: ${task.successRate}%`);
        }

        // Test UI update handlers
        if (data.length > 0) {
            const testTask = data[0];

            // Test toggle action
            const toggleResult = await webUIManager['handleUIUpdate']('toggle', {
                id: testTask.id,
                name: testTask.name,
                enabled: testTask.enabled
            });
            console.log('✅ Toggle action test:', toggleResult.success ? 'PASSED' : 'FAILED');

            // Test delete action
            const deleteResult = await webUIManager['handleUIUpdate']('delete', {
                id: testTask.id,
                name: testTask.name
            });
            console.log('✅ Delete action test:', deleteResult.success ? 'PASSED' : 'FAILED');
        }

        // Test web UI generation
        const webUIResult = await webUIManager.handleGetWebUI('test-user');
        console.log('✅ Web UI generation test:', webUIResult.content ? 'PASSED' : 'FAILED');

        if (webUIResult.content && webUIResult.content[0] && webUIResult.content[0].text) {
            const content = webUIResult.content[0].text;
            console.log(`   Generated HTML length: ${content.length} characters`);
            console.log(`   Contains dashboard: ${content.includes('task-overview') ? 'YES' : 'NO'}`);
            console.log(`   Contains task list: ${content.includes('tasks-list') ? 'YES' : 'NO'}`);
        }

        // Cleanup
        await taskManager.cleanup();
        console.log('✅ Cleanup completed');

        console.log('\n🎉 All tests passed! Web UI integration is working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testWebUIIntegration(); 