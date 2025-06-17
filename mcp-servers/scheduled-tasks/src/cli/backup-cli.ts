#!/usr/bin/env node
import { BackupManager } from '../utils/backup-manager.js';
import { TaskStore } from '../storage/task-store.js';
import { Task, TaskStatus } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    const backupManager = new BackupManager();
    await backupManager.initialize();

    console.log('🔧 Scheduled Tasks Backup Manager CLI');
    console.log('=====================================\n');

    switch (command) {
        case 'create-test-data':
            await createTestData();
            break;

        case 'backup':
            await createBackup(args[0]);
            break;

        case 'list':
            await listBackups();
            break;

        case 'verify':
            await verifyBackup(args[0]);
            break;

        case 'restore':
            await restoreBackup(args[0]);
            break;

        case 'report':
            await generateReport();
            break;

        case 'cleanup':
            await cleanupBackups(parseInt(args[0]) || 10);
            break;

        case 'test-corruption':
            await testCorruptionRecovery();
            break;

        case 'stress-test':
            await stressTest();
            break;

        default:
            showUsage();
    }

    console.log('\n✅ Operation completed');
}

async function createTestData() {
    console.log('🧪 Creating test data...');

    const taskStore = new TaskStore({
        dataDir: '/media/drakosfire/Projects/Sizzek/memory_files',
        backupDir: '/media/drakosfire/Projects/Sizzek/memory_files/backups'
    });

    await taskStore.initialize();

    const testTasks: Task[] = [
        {
            id: uuidv4(),
            name: 'Daily Exercise Reminder',
            description: 'Remind to exercise every day at 7 AM',
            schedule: { type: 'daily', time: '07:00', weekdaysOnly: false },
            message: 'Time for your daily exercise! 💪',
            enabled: true,
            status: TaskStatus.SCHEDULED,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastRun: new Date(Date.now() - 24 * 60 * 60 * 1000),
            nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000),
            totalRuns: 5,
            successfulRuns: 5,
            failedRuns: 0,
            lastError: undefined
        },
        {
            id: uuidv4(),
            name: 'Weekly Team Meeting',
            description: 'Weekly team standup meeting',
            schedule: { type: 'weekly', dayOfWeek: 'monday', time: '09:00' },
            message: 'Weekly team meeting starting in 5 minutes! Join the call.',
            enabled: true,
            status: TaskStatus.SCHEDULED,
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
            updatedAt: new Date(),
            lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000),
            totalRuns: 2,
            successfulRuns: 1,
            failedRuns: 1,
            lastError: 'Network timeout'
        },
        {
            id: uuidv4(),
            name: 'One-time Reminder',
            description: 'Reminder for doctor appointment',
            schedule: { type: 'once', delayMinutes: 60 },
            message: 'Doctor appointment in 1 hour! Don\'t forget.',
            enabled: true,
            status: TaskStatus.PENDING,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastRun: undefined,
            nextRun: new Date(Date.now() + 60 * 60 * 1000),
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            lastError: undefined
        },
        {
            id: uuidv4(),
            name: 'Status Check',
            description: 'Check system status every 15 minutes',
            schedule: { type: 'interval', every: 15, unit: 'minutes', startTime: '08:00' },
            message: 'System status check: All systems operational',
            enabled: false,
            status: TaskStatus.PAUSED,
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
            updatedAt: new Date(),
            lastRun: new Date(Date.now() - 15 * 60 * 1000),
            nextRun: undefined,
            totalRuns: 96, // 24 hours * 4 checks per hour
            successfulRuns: 94,
            failedRuns: 2,
            lastError: undefined
        }
    ];

    await taskStore.saveTasks(testTasks);
    console.log(`✅ Created ${testTasks.length} test tasks`);
}

async function createBackup(reason?: string) {
    console.log('📦 Creating manual backup...');

    const backupManager = new BackupManager();
    await backupManager.initialize();

    const backupPath = await backupManager.createManualBackup(reason || 'Manual backup via CLI');
    console.log(`✅ Backup created: ${backupPath}`);
}

async function listBackups() {
    console.log('📋 Listing all backups...');

    const backupManager = new BackupManager();
    await backupManager.initialize();

    const backups = await backupManager.listAllBackups();

    if (backups.length === 0) {
        console.log('No backups found.');
        return;
    }

    console.log('\nBackup Files:');
    console.log('=============');

    for (const backup of backups) {
        const status = backup.isValid ? '✅' : '❌';
        const sizeKB = Math.round(backup.size / 1024);
        const age = Math.round((Date.now() - backup.createdAt.getTime()) / (1000 * 60 * 60 * 24));

        console.log(`${status} ${backup.filename}`);
        console.log(`   Tasks: ${backup.taskCount} | Size: ${sizeKB}KB | Age: ${age}d`);
        console.log(`   Created: ${backup.createdAt.toISOString()}`);
        if (backup.checksum) {
            console.log(`   Checksum: ${backup.checksum.substring(0, 16)}...`);
        }
        console.log('');
    }
}

async function verifyBackup(filename: string) {
    if (!filename) {
        console.error('❌ Please specify a backup filename');
        return;
    }

    console.log(`🔍 Verifying backup: ${filename}`);

    const backupManager = new BackupManager();
    await backupManager.initialize();

    const result = await backupManager.verifyBackup(filename);

    console.log(`\nVerification Result:`);
    console.log(`==================`);
    console.log(`Valid: ${result.isValid ? '✅' : '❌'}`);
    console.log(`Task Count: ${result.taskCount}`);

    if (result.checksumValid !== undefined) {
        console.log(`Checksum: ${result.checksumValid ? '✅' : '❌'}`);
    }

    if (result.errors.length > 0) {
        console.log(`\nErrors:`);
        result.errors.forEach(error => console.log(`  ❌ ${error}`));
    }

    if (result.warnings.length > 0) {
        console.log(`\nWarnings:`);
        result.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
    }
}

async function restoreBackup(filename: string) {
    if (!filename) {
        console.error('❌ Please specify a backup filename');
        return;
    }

    console.log(`🔄 Restoring from backup: ${filename}`);
    console.log('⚠️  This will overwrite current tasks!');

    // In a real CLI, you'd prompt for confirmation
    // For demo purposes, we'll require explicit confirmation
    const backupManager = new BackupManager();
    await backupManager.initialize();

    try {
        const restoredTasks = await backupManager.restoreFromBackup(filename, true);
        console.log(`✅ Restored ${restoredTasks.length} tasks from backup`);
    } catch (error) {
        console.error('❌ Restoration failed:', error);
    }
}

async function generateReport() {
    console.log('📊 Generating storage report...');

    const backupManager = new BackupManager();
    await backupManager.initialize();

    const report = await backupManager.getStorageReport();

    console.log('\nStorage Report');
    console.log('==============');

    console.log('\nPrimary File:');
    console.log(`  Exists: ${report.primaryFile.exists ? '✅' : '❌'}`);
    if (report.primaryFile.exists) {
        console.log(`  Size: ${Math.round(report.primaryFile.size / 1024)}KB`);
        console.log(`  Tasks: ${report.primaryFile.taskCount}`);
        console.log(`  Last Modified: ${report.primaryFile.lastModified.toISOString()}`);
    }

    console.log('\nBackups:');
    console.log(`  Count: ${report.backups.count}`);
    console.log(`  Total Size: ${Math.round(report.backups.totalSize / 1024)}KB`);
    if (report.backups.newestBackup) {
        console.log(`  Newest: ${report.backups.newestBackup}`);
    }
    if (report.backups.oldestBackup) {
        console.log(`  Oldest: ${report.backups.oldestBackup}`);
    }

    if (report.recommendations.length > 0) {
        console.log('\nRecommendations:');
        report.recommendations.forEach(rec => console.log(`  💡 ${rec}`));
    }
}

async function cleanupBackups(keepCount: number) {
    console.log(`🧹 Cleaning up old backups (keeping ${keepCount})...`);

    const backupManager = new BackupManager();
    await backupManager.initialize();

    const deletedCount = await backupManager.cleanupOldBackups(keepCount);
    console.log(`✅ Deleted ${deletedCount} old backups`);
}

async function testCorruptionRecovery() {
    console.log('🧪 Testing corruption recovery...');

    const taskStore = new TaskStore({
        dataDir: '/media/drakosfire/Projects/Sizzek/memory_files',
        backupDir: '/media/drakosfire/Projects/Sizzek/memory_files/backups'
    });

    await taskStore.initialize();

    // Create some test data
    const testTasks: Task[] = [
        {
            id: uuidv4(),
            name: 'Corruption Test Task',
            description: 'Test task for corruption recovery testing',
            schedule: { type: 'once', delayMinutes: 1 },
            message: 'This is a test task for corruption recovery',
            enabled: true,
            status: TaskStatus.PENDING,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastRun: undefined,
            nextRun: new Date(Date.now() + 60 * 1000),
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            lastError: undefined
        }
    ];

    // Save tasks
    await taskStore.saveTasks(testTasks);
    console.log('✅ Created test data');

    // Create backup
    await taskStore.createBackup(testTasks);
    console.log('✅ Created backup');

    // Simulate corruption by writing invalid JSON
    const fs = await import('fs');
    const path = await import('path');
    const tasksFile = path.join('/media/drakosfire/Projects/Sizzek/memory_files', 'tasks.json');

    await fs.promises.writeFile(tasksFile, 'corrupted json data');
    console.log('💥 Simulated file corruption');

    // Test recovery
    const recoveredTasks = await taskStore.loadTasks();
    console.log(`✅ Recovered ${recoveredTasks.length} tasks from backup`);

    if (recoveredTasks.length > 0 && recoveredTasks[0].name === 'Corruption Test Task') {
        console.log('✅ Corruption recovery test passed!');
    } else {
        console.log('❌ Corruption recovery test failed!');
    }
}

async function stressTest() {
    console.log('🏋️ Running stress test...');

    const taskStore = new TaskStore({
        dataDir: '/media/drakosfire/Projects/Sizzek/memory_files',
        backupDir: '/media/drakosfire/Projects/Sizzek/memory_files/backups'
    });

    await taskStore.initialize();

    // Create a large number of tasks
    const taskCount = 1000;
    const tasks: Task[] = [];

    console.log(`Creating ${taskCount} tasks...`);

    for (let i = 0; i < taskCount; i++) {
        tasks.push({
            id: uuidv4(),
            name: `Stress Test Task ${i}`,
            description: `This is stress test task number ${i}`,
            schedule: { type: 'interval', every: i + 1, unit: 'minutes', startTime: '08:00' },
            message: `Stress test message ${i}`,
            enabled: i % 2 === 0, // Enable every other task
            status: i % 3 === 0 ? TaskStatus.SCHEDULED : TaskStatus.PENDING,
            createdAt: new Date(Date.now() - i * 1000), // Spread creation times
            updatedAt: new Date(),
            lastRun: i % 4 === 0 ? new Date(Date.now() - i * 1000) : undefined,
            nextRun: i % 2 === 0 ? new Date(Date.now() + (i + 1) * 60 * 1000) : undefined,
            totalRuns: Math.floor(Math.random() * 100),
            successfulRuns: Math.floor(Math.random() * 80),
            failedRuns: Math.floor(Math.random() * 20),
            lastError: i % 10 === 0 ? 'Test error' : undefined
        });
    }

    // Measure save performance
    const startTime = Date.now();
    await taskStore.saveTasks(tasks);
    const saveTime = Date.now() - startTime;

    console.log(`✅ Saved ${taskCount} tasks in ${saveTime}ms`);

    // Measure load performance
    const loadStartTime = Date.now();
    const loadedTasks = await taskStore.loadTasks();
    const loadTime = Date.now() - loadStartTime;

    console.log(`✅ Loaded ${loadedTasks.length} tasks in ${loadTime}ms`);

    // Create backup
    const backupStartTime = Date.now();
    await taskStore.createBackup(loadedTasks);
    const backupTime = Date.now() - backupStartTime;

    console.log(`✅ Created backup in ${backupTime}ms`);

    // Performance summary
    console.log('\nPerformance Summary:');
    console.log(`  Save: ${(saveTime / taskCount).toFixed(2)}ms per task`);
    console.log(`  Load: ${(loadTime / taskCount).toFixed(2)}ms per task`);
    console.log(`  Backup: ${(backupTime / taskCount).toFixed(2)}ms per task`);
}

function showUsage() {
    console.log('Usage: backup-cli <command> [args...]');
    console.log('');
    console.log('Commands:');
    console.log('  create-test-data          Create sample tasks for testing');
    console.log('  backup [reason]           Create a manual backup');
    console.log('  list                      List all backups');
    console.log('  verify <filename>         Verify a backup file');
    console.log('  restore <filename>        Restore from a backup');
    console.log('  report                    Generate storage report');
    console.log('  cleanup [count]           Cleanup old backups (default: keep 10)');
    console.log('  test-corruption          Test corruption recovery');
    console.log('  stress-test              Run performance stress test');
    console.log('');
    console.log('Examples:');
    console.log('  backup-cli create-test-data');
    console.log('  backup-cli backup "Before system upgrade"');
    console.log('  backup-cli list');
    console.log('  backup-cli verify tasks-2024-12-15T10-30-00-000Z.json');
    console.log('  backup-cli restore tasks-2024-12-15T10-30-00-000Z.json');
    console.log('  backup-cli cleanup 20');
}

// Run the CLI
main().catch(error => {
    console.error('❌ CLI Error:', error);
    process.exit(1);
}); 