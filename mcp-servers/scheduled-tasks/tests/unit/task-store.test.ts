import { TaskStore } from '../../src/storage/task-store.js';
import { Task, TaskStatus } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('TaskStore', () => {
    let taskStore: TaskStore;
    let testDataDir: string;
    let testBackupDir: string;

    beforeEach(async () => {
        // Create temporary directories for testing
        testDataDir = join(tmpdir(), `task-store-test-${Date.now()}`);
        testBackupDir = join(testDataDir, 'backups');

        taskStore = new TaskStore({
            dataDir: testDataDir,
            backupDir: testBackupDir,
            maxBackups: 5,
            backupInterval: 0.1 // 0.1 minutes for faster testing
        });

        await taskStore.initialize();
    });

    afterEach(async () => {
        // Cleanup test directories
        try {
            await fs.rm(testDataDir, { recursive: true, force: true });
        } catch (error) {
            console.warn('Failed to cleanup test directory:', error);
        }
    });

    describe('initialization', () => {
        test('should create directories if they do not exist', async () => {
            const newTestDir = join(tmpdir(), `task-store-init-test-${Date.now()}`);
            const newTaskStore = new TaskStore({
                dataDir: newTestDir,
                backupDir: join(newTestDir, 'backups')
            });

            await newTaskStore.initialize();

            // Verify directories exist
            await expect(fs.access(newTestDir)).resolves.not.toThrow();
            await expect(fs.access(join(newTestDir, 'backups'))).resolves.not.toThrow();

            // Cleanup
            await fs.rm(newTestDir, { recursive: true, force: true });
        });

        test('should verify integrity on startup', async () => {
            // Create invalid JSON file
            const tasksFile = join(testDataDir, 'tasks.json');
            await fs.writeFile(tasksFile, 'invalid json');

            const newTaskStore = new TaskStore({
                dataDir: testDataDir,
                backupDir: testBackupDir
            });

            // Should not throw on initialization (recovery will handle it)
            await expect(newTaskStore.initialize()).resolves.not.toThrow();
        });
    });

    describe('loadTasks', () => {
        test('should load valid tasks from file', async () => {
            const testTasks: Task[] = [
                {
                    id: 'test-task-1',
                    name: 'Test Task 1',
                    description: 'A test task',
                    schedule: { type: 'once', delayMinutes: 5 },
                    message: 'Test message',
                    enabled: true,
                    status: TaskStatus.PENDING,
                    createdAt: new Date('2024-01-01T08:00:00Z'),
                    updatedAt: new Date('2024-01-01T08:00:00Z'),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            await taskStore.saveTasks(testTasks);
            const loadedTasks = await taskStore.loadTasks();

            expect(loadedTasks).toHaveLength(1);
            expect(loadedTasks[0].id).toBe('test-task-1');
            expect(loadedTasks[0].name).toBe('Test Task 1');
            expect(loadedTasks[0].createdAt).toBeInstanceOf(Date);
        });

        test('should return empty array for non-existent file', async () => {
            const newTestDir = join(tmpdir(), `task-store-empty-test-${Date.now()}`);
            const newTaskStore = new TaskStore({
                dataDir: newTestDir,
                backupDir: join(newTestDir, 'backups')
            });

            await newTaskStore.initialize();
            const tasks = await newTaskStore.loadTasks();

            expect(tasks).toEqual([]);

            // Cleanup
            await fs.rm(newTestDir, { recursive: true, force: true });
        });

        test('should recover from backup on corrupted primary file', async () => {
            const testTasks: Task[] = [
                {
                    id: 'backup-test-task',
                    name: 'Backup Test Task',
                    schedule: { type: 'daily', time: '09:00' },
                    message: 'Backup test message',
                    enabled: true,
                    status: TaskStatus.SCHEDULED,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            // Save tasks first
            await taskStore.saveTasks(testTasks);

            // Corrupt primary file
            const tasksFile = join(testDataDir, 'tasks.json');
            await fs.writeFile(tasksFile, 'corrupted json data');

            // Should recover from backup
            const loadedTasks = await taskStore.loadTasks();
            expect(loadedTasks).toHaveLength(1);
            expect(loadedTasks[0].id).toBe('backup-test-task');
        });
    });

    describe('saveTasks', () => {
        test('should save tasks atomically', async () => {
            const testTasks: Task[] = [
                {
                    id: 'atomic-test-task',
                    name: 'Atomic Test Task',
                    schedule: { type: 'interval', every: 10, unit: 'minutes' },
                    message: 'Atomic test message',
                    enabled: true,
                    status: TaskStatus.SCHEDULED,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            await taskStore.saveTasks(testTasks);

            // Verify file exists and contains correct data
            const tasksFile = join(testDataDir, 'tasks.json');
            const fileContent = await fs.readFile(tasksFile, 'utf-8');
            const savedTasks = JSON.parse(fileContent);

            expect(savedTasks).toHaveLength(1);
            expect(savedTasks[0].id).toBe('atomic-test-task');
        });

        test('should create immediate backup during save', async () => {
            const testTasks: Task[] = [
                {
                    id: 'backup-during-save-task',
                    name: 'Backup During Save Task',
                    schedule: { type: 'weekly', dayOfWeek: 'monday', time: '08:00' },
                    message: 'Backup during save message',
                    enabled: true,
                    status: TaskStatus.PENDING,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            await taskStore.saveTasks(testTasks);

            // Modify and save again
            testTasks[0].name = 'Modified Task Name';
            await taskStore.saveTasks(testTasks);

            // Verify backup exists
            const backupFile = join(testDataDir, 'tasks.json.backup');
            await expect(fs.access(backupFile)).resolves.not.toThrow();
        });

        test('should handle concurrent save operations', async () => {
            const task1: Task = {
                id: 'concurrent-task-1',
                name: 'Concurrent Task 1',
                schedule: { type: 'once', delayMinutes: 1 },
                message: 'Concurrent message 1',
                enabled: true,
                status: TaskStatus.PENDING,
                createdAt: new Date(),
                updatedAt: new Date(),
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0
            };

            const task2: Task = {
                id: 'concurrent-task-2',
                name: 'Concurrent Task 2',
                schedule: { type: 'once', delayMinutes: 2 },
                message: 'Concurrent message 2',
                enabled: true,
                status: TaskStatus.PENDING,
                createdAt: new Date(),
                updatedAt: new Date(),
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0
            };

            // Start multiple save operations simultaneously
            const promise1 = taskStore.saveTasks([task1]);
            const promise2 = taskStore.saveTasks([task2]);

            await Promise.all([promise1, promise2]);

            // Verify final state is consistent
            const loadedTasks = await taskStore.loadTasks();
            expect(loadedTasks).toHaveLength(1);
            expect(['concurrent-task-1', 'concurrent-task-2']).toContain(loadedTasks[0].id);
        });
    });

    describe('backup management', () => {
        test('should create timestamped backup', async () => {
            const testTasks: Task[] = [
                {
                    id: 'timestamped-backup-task',
                    name: 'Timestamped Backup Task',
                    schedule: { type: 'daily', time: '10:00' },
                    message: 'Timestamped backup message',
                    enabled: true,
                    status: TaskStatus.SCHEDULED,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            const backupPath = await taskStore.createBackup(testTasks);

            // Verify backup file exists
            await expect(fs.access(backupPath)).resolves.not.toThrow();

            // Verify backup content
            const backupContent = await fs.readFile(backupPath, 'utf-8');
            const backupData = JSON.parse(backupContent);

            expect(backupData.metadata).toBeDefined();
            expect(backupData.metadata.taskCount).toBe(1);
            expect(backupData.metadata.checksum).toBeDefined();
            expect(backupData.tasks).toHaveLength(1);
            expect(backupData.tasks[0].id).toBe('timestamped-backup-task');
        });

        test('should list backups in chronological order', async () => {
            const testTasks: Task[] = [
                {
                    id: 'list-backup-task',
                    name: 'List Backup Task',
                    schedule: { type: 'once', delayMinutes: 1 },
                    message: 'List backup message',
                    enabled: true,
                    status: TaskStatus.PENDING,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            // Create multiple backups with slight delays
            await taskStore.createBackup(testTasks);
            await new Promise(resolve => setTimeout(resolve, 10));

            testTasks[0].name = 'Modified List Backup Task';
            await taskStore.createBackup(testTasks);

            const backups = await taskStore.listBackups();
            expect(backups.length).toBeGreaterThanOrEqual(2);

            // Should be sorted with newest first
            for (let i = 0; i < backups.length - 1; i++) {
                expect(backups[i] > backups[i + 1]).toBe(true);
            }
        });

        test('should cleanup old backups', async () => {
            const testTasks: Task[] = [
                {
                    id: 'cleanup-backup-task',
                    name: 'Cleanup Backup Task',
                    schedule: { type: 'once', delayMinutes: 1 },
                    message: 'Cleanup backup message',
                    enabled: true,
                    status: TaskStatus.PENDING,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            // Create more backups than the limit (5)
            for (let i = 0; i < 7; i++) {
                testTasks[0].name = `Cleanup Backup Task ${i}`;
                await taskStore.createBackup(testTasks);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            const backups = await taskStore.listBackups();
            expect(backups.length).toBeLessThanOrEqual(5);
        });

        test('should restore from specific backup', async () => {
            const originalTasks: Task[] = [
                {
                    id: 'restore-original-task',
                    name: 'Original Task Name',
                    schedule: { type: 'daily', time: '08:00' },
                    message: 'Original message',
                    enabled: true,
                    status: TaskStatus.SCHEDULED,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            // Create backup of original
            const backupPath = await taskStore.createBackup(originalTasks);
            const backupFileName = backupPath.split('/').pop()!;

            // Modify and save
            originalTasks[0].name = 'Modified Task Name';
            await taskStore.saveTasks(originalTasks);

            // Restore from specific backup
            const restoredTasks = await taskStore.restoreFromBackup(backupFileName);

            expect(restoredTasks).toHaveLength(1);
            expect(restoredTasks[0].name).toBe('Original Task Name');

            // Verify current file also has restored data
            const currentTasks = await taskStore.loadTasks();
            expect(currentTasks[0].name).toBe('Original Task Name');
        });
    });

    describe('error handling', () => {
        test('should validate task data structure', async () => {
            const invalidTasks = [
                { name: 'Missing ID', message: 'test' }, // Missing id
                { id: 'test-id', message: 'test' }, // Missing name
                { id: 'test-id', name: 'Test', message: 'test' } // Missing schedule
            ];

            for (const invalidTask of invalidTasks) {
                await expect(taskStore.saveTasks([invalidTask as any])).rejects.toThrow();
            }
        });

        test('should handle disk full simulation', async () => {
            // This is a simplified test - in reality, you'd need to mock fs operations
            const largeTasks: Task[] = Array.from({ length: 1000 }, (_, i) => ({
                id: `large-task-${i}`,
                name: `Large Task ${i}`,
                description: 'A'.repeat(1000), // Large description
                schedule: { type: 'once', delayMinutes: i },
                message: 'Large task message',
                enabled: true,
                status: TaskStatus.PENDING,
                createdAt: new Date(),
                updatedAt: new Date(),
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0
            }));

            // Should handle large data without throwing
            await expect(taskStore.saveTasks(largeTasks)).resolves.not.toThrow();
        });

        test('should recover from all backup failures', async () => {
            // Corrupt all backup files
            const backups = await taskStore.listBackups();
            for (const backup of backups) {
                const backupPath = join(testBackupDir, backup);
                await fs.writeFile(backupPath, 'corrupted backup data');
            }

            // Corrupt primary file
            const tasksFile = join(testDataDir, 'tasks.json');
            await fs.writeFile(tasksFile, 'corrupted primary data');

            // Should return empty array when all recovery fails
            const tasks = await taskStore.loadTasks();
            expect(tasks).toEqual([]);
        });
    });

    describe('storage statistics', () => {
        test('should provide accurate storage stats', async () => {
            const testTasks: Task[] = [
                {
                    id: 'stats-task-1',
                    name: 'Stats Task 1',
                    schedule: { type: 'once', delayMinutes: 1 },
                    message: 'Stats message 1',
                    enabled: true,
                    status: TaskStatus.PENDING,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                },
                {
                    id: 'stats-task-2',
                    name: 'Stats Task 2',
                    schedule: { type: 'daily', time: '09:00' },
                    message: 'Stats message 2',
                    enabled: true,
                    status: TaskStatus.SCHEDULED,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    totalRuns: 5,
                    successfulRuns: 4,
                    failedRuns: 1
                }
            ];

            await taskStore.saveTasks(testTasks);
            await taskStore.createBackup(testTasks);

            const stats = await taskStore.getStorageStats();

            expect(stats.totalTasks).toBe(2);
            expect(stats.fileSize).toBeGreaterThan(0);
            expect(stats.lastModified).toBeInstanceOf(Date);
            expect(stats.backupCount).toBeGreaterThanOrEqual(1);
            expect(stats.newestBackup).toBeDefined();
        });
    });

    describe('date handling', () => {
        test('should properly serialize and deserialize dates', async () => {
            const testDate = new Date('2024-12-15T10:30:45.123Z');
            const testTasks: Task[] = [
                {
                    id: 'date-test-task',
                    name: 'Date Test Task',
                    schedule: { type: 'once', delayMinutes: 1 },
                    message: 'Date test message',
                    enabled: true,
                    status: TaskStatus.PENDING,
                    createdAt: testDate,
                    updatedAt: testDate,
                    lastRun: testDate,
                    nextRun: new Date(testDate.getTime() + 60000), // 1 minute later
                    totalRuns: 0,
                    successfulRuns: 0,
                    failedRuns: 0
                }
            ];

            await taskStore.saveTasks(testTasks);
            const loadedTasks = await taskStore.loadTasks();

            expect(loadedTasks[0].createdAt).toBeInstanceOf(Date);
            expect(loadedTasks[0].updatedAt).toBeInstanceOf(Date);
            expect(loadedTasks[0].lastRun).toBeInstanceOf(Date);
            expect(loadedTasks[0].nextRun).toBeInstanceOf(Date);

            expect(loadedTasks[0].createdAt.getTime()).toBe(testDate.getTime());
            expect(loadedTasks[0].updatedAt.getTime()).toBe(testDate.getTime());
            expect(loadedTasks[0].lastRun!.getTime()).toBe(testDate.getTime());
        });
    });
}); 