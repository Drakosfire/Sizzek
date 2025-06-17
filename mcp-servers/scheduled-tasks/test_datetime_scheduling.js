#!/usr/bin/env node

import { TaskManager } from './dist/core/task-manager.js';

const taskManager = new TaskManager();

async function testDateTimeScheduling() {
    console.log('🧪 Testing DateTime vs Delay Scheduling\n');

    // Initialize task manager
    await taskManager.initialize();

    console.log('✅ NEW: Two Different One-Time Scheduling Approaches\n');

    // Test 1: Delay-based scheduling (existing)
    console.log('🔄 Test 1: create_once_task (delay-based)');
    try {
        const delayTask = await taskManager.createTask({
            name: 'Delay-Based Task',
            description: 'Execute in 30 seconds from now',
            schedule: { type: 'once', delayMinutes: 0.5 }, // 30 seconds
            message: 'This task was scheduled with a delay!',
            enabled: true
        });
        console.log(`✅ SUCCESS: ${delayTask.name}`);
        console.log(`   Schedule: ${delayTask.schedule.type} - ${delayTask.schedule.delayMinutes} minutes`);
        console.log(`   Next run: ${delayTask.nextRun?.toISOString()}\n`);
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}\n`);
    }

    // Test 2: DateTime-based scheduling (new)
    console.log('🔄 Test 2: create_scheduled_task (datetime-based)');
    try {
        // Schedule for 2 minutes from now
        const futureDate = new Date(Date.now() + 2 * 60 * 1000);
        const isoDateTime = futureDate.toISOString().split('.')[0]; // Remove milliseconds

        const scheduledTask = await taskManager.createTask({
            name: 'DateTime-Based Task',
            description: 'Execute at specific date and time',
            schedule: { type: 'scheduled', datetime: isoDateTime },
            message: 'This task was scheduled for a specific datetime!',
            enabled: true
        });
        console.log(`✅ SUCCESS: ${scheduledTask.name}`);
        console.log(`   Schedule: ${scheduledTask.schedule.type} - ${scheduledTask.schedule.datetime}`);
        console.log(`   Next run: ${scheduledTask.nextRun?.toISOString()}\n`);
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}\n`);
    }

    // Test 3: Validation - datetime in the past should fail
    console.log('🔄 Test 3: Validation - datetime in the past');
    try {
        const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
        const pastDateTime = pastDate.toISOString().split('.')[0];

        await taskManager.createTask({
            name: 'Past DateTime Task',
            description: 'This should fail',
            schedule: { type: 'scheduled', datetime: pastDateTime },
            message: 'This should not work!',
            enabled: true
        });
        console.log(`❌ UNEXPECTED: Task was created when it should have failed\n`);
    } catch (error) {
        console.log(`✅ EXPECTED ERROR: ${error.message}\n`);
    }

    console.log('📋 CLEAR USE CASES:');
    console.log(`
🎯 DELAY-BASED (create_once_task):
   - "Remind me in 30 minutes"
   - "Send notification in 2 hours"  
   - "Follow up in 1 day"
   - Agent doesn't need to know current time
   - Relative timing from "now"

🎯 DATETIME-BASED (create_scheduled_task):
   - "Remind me tomorrow at 3pm"
   - "Send birthday message on Dec 25th at 9am"
   - "Project deadline alert on June 15th at 2pm"
   - Agent needs to calculate specific datetime
   - Absolute timing for specific moment

✅ BENEFITS OF SEPARATION:
   - Clear tool selection based on use case
   - No conditional parameter logic
   - Simple validation per tool type
   - Better error messages
   - Easier for AI agents to choose correctly
`);

    console.log('\n📊 PARAMETER COMPARISON:');
    console.log(`
create_once_task:
{
  "name": "...",
  "delayMinutes": 30,     // ✅ Simple number
  "message": "..."
}

create_scheduled_task:
{
  "name": "...", 
  "datetime": "2024-12-25T09:00:00",  // ✅ Clear ISO format
  "message": "..."
}
`);
}

// Run the test
testDateTimeScheduling().catch(console.error); 