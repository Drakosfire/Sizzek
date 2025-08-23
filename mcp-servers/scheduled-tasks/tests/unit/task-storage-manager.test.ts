import { TaskStorageManager } from '../../src/storage/TaskStorageManager.js';
import { Task, TaskStatus } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('TaskStorageManager', () => {
    let taskStorageManager: TaskStorageManager;
    let testDataDir: string;

    beforeEach(async () => {
        // Create temporary directories for testing
        testDataDir = join(tmpdir(), `task-storage-test-${Date.now()}`);
        await fs.mkdir(testDataDir, { recursive: true });
    });

    afterEach(async () => {
        // Cleanup test storage and connections
        if (taskStorageManager) {
            await taskStorageManager.cleanup();
        }

        // Cleanup test directories
        try {
            await fs.rm(testDataDir, { recursive: true, force: true });
        } catch (error) {
            console.warn('Failed to cleanup test directory:', error);
        }
    });

    // Helper function to create a valid test task
    const createTestTask = (id: string, overrides: Partial<Task> = {}): Task => ({
        id,
        name: `Test Task ${id}`,
        description: `Description for task ${id}`,
        schedule: { type: 'once', delayMinutes: 5 },
        message: `Test message for ${id}`,
        enabled: true,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastRun: undefined,
        nextRun: undefined,
        lastError: undefined,
        creatorUserId: 'test-user',
        sharedWith: [],
        contextType: 'user',
        ...overrides
    });

    describe('JSON Storage Backend', () => {
        beforeEach(async () => {
            taskStorageManager = new TaskStorageManager({
                storageType: 'json',
                userBased: false,
                jsonConfig: {
                    filePath: join(testDataDir, 'tasks.json'),
                    backupEnabled: true,
                    maxBackups: 5,
                    backupInterval: 60
                }
            });

            await taskStorageManager.initialize();
        });

        test('should initialize with JSON storage', async () => {
            expect(taskStorageManager).toBeDefined();

            const health = await taskStorageManager.getStorageHealth();
            expect(health.healthy).toBe(true);
            expect(health.storageType).toBe('json');
            expect(health.userBased).toBe(false);
        });

        test('should save and load tasks correctly', async () => {
            const testTasks: Task[] = [createTestTask('test-task-1')];

            await taskStorageManager.saveTasks(testTasks);
            const loadedTasks = await taskStorageManager.loadTasks();

            expect(loadedTasks).toHaveLength(1);
            expect(loadedTasks[0].id).toBe('test-task-1');
            expect(loadedTasks[0].name).toBe('Test Task test-task-1');
            expect(loadedTasks[0].createdAt).toBeInstanceOf(Date);
        });

        test('should return empty array for new storage', async () => {
            const tasks = await taskStorageManager.loadTasks();
            expect(tasks).toEqual([]);
        });

        test('should handle various schedule types', async () => {
            const testTasks: Task[] = [
                createTestTask('daily-task', {
                    schedule: { type: 'daily', time: '09:00', weekdaysOnly: false },
                    status: TaskStatus.SCHEDULED
                }),
                createTestTask('interval-task', {
                    schedule: { type: 'interval', every: 10, unit: 'minutes', startTime: undefined },
                    status: TaskStatus.SCHEDULED
                }),
                createTestTask('weekly-task', {
                    schedule: { type: 'weekly', dayOfWeek: 'monday', time: '08:00' }
                })
            ];

            await taskStorageManager.saveTasks(testTasks);
            const loadedTasks = await taskStorageManager.loadTasks();

            expect(loadedTasks).toHaveLength(3);
            expect(loadedTasks.find(t => t.id === 'daily-task')).toBeDefined();
            expect(loadedTasks.find(t => t.id === 'interval-task')).toBeDefined();
            expect(loadedTasks.find(t => t.id === 'weekly-task')).toBeDefined();
        });

        test('should handle concurrent save operations', async () => {
            const task1 = createTestTask('concurrent-task-1');
            const task2 = createTestTask('concurrent-task-2');

            // Start multiple save operations simultaneously
            const promise1 = taskStorageManager.saveTasks([task1]);
            const promise2 = taskStorageManager.saveTasks([task2]);

            await Promise.all([promise1, promise2]);

            // Verify final state is consistent
            const loadedTasks = await taskStorageManager.loadTasks();
            expect(loadedTasks).toHaveLength(1);
            expect(['concurrent-task-1', 'concurrent-task-2']).toContain(loadedTasks[0].id);
        });

        test('should provide storage health information', async () => {
            const testTasks: Task[] = [createTestTask('health-task')];

            await taskStorageManager.saveTasks(testTasks);
            const health = await taskStorageManager.getStorageHealth();

            expect(health.healthy).toBe(true);
            expect(health.storageType).toBe('json');
            expect(health.userBased).toBe(false);
            expect(health.taskCount).toBe(1);
            expect(health.lastAccess).toBeInstanceOf(Date);
            expect(health.totalSize).toBeGreaterThan(0);
        });
    });

    describe('User-Based Storage', () => {
        beforeEach(async () => {
            taskStorageManager = new TaskStorageManager({
                storageType: 'json',
                userBased: true,
                defaultUserId: 'default-user',
                jsonConfig: {
                    filePath: join(testDataDir, 'user-tasks.json'),
                    backupEnabled: true,
                    maxBackups: 5,
                    backupInterval: 60
                }
            });

            await taskStorageManager.initialize();
        });

        test('should isolate tasks between users', async () => {
            const user1Tasks: Task[] = [createTestTask('user1-task')];
            const user2Tasks: Task[] = [createTestTask('user2-task')];

            // Save tasks for different users
            await taskStorageManager.saveTasks(user1Tasks, 'user1');
            await taskStorageManager.saveTasks(user2Tasks, 'user2');

            // Verify user isolation
            const user1LoadedTasks = await taskStorageManager.loadTasks('user1');
            const user2LoadedTasks = await taskStorageManager.loadTasks('user2');

            expect(user1LoadedTasks).toHaveLength(1);
            expect(user1LoadedTasks[0].id).toBe('user1-task');

            expect(user2LoadedTasks).toHaveLength(1);
            expect(user2LoadedTasks[0].id).toBe('user2-task');
        });

        test('should handle default user correctly', async () => {
            const defaultTasks: Task[] = [createTestTask('default-task')];

            await taskStorageManager.saveTasks(defaultTasks);
            const loadedTasks = await taskStorageManager.loadTasks();

            expect(loadedTasks).toHaveLength(1);
            expect(loadedTasks[0].id).toBe('default-task');
        });
    });

    describe('MongoDB Storage Backend', () => {
        beforeEach(async () => {
            // Skip MongoDB tests if no connection string is provided
            if (!process.env.MONGO_URI) {
                console.log('Skipping MongoDB tests - no connection string provided');
                return;
            }

            taskStorageManager = new TaskStorageManager({
                storageType: 'mongodb',
                userBased: true,
                defaultUserId: 'test-user',
                mongoConfig: {
                    connectionString: process.env.MONGO_URI,
                    databaseName: 'test_scheduled_tasks',
                    collectionName: 'test_tasks',
                    timeout: 10000,
                    maxRetries: 3,
                    encryptionKey: process.env.CREDS_KEY
                }
            });

            await taskStorageManager.initialize();
        });

        test('should initialize with MongoDB storage', async () => {
            if (!process.env.MONGO_URI) {
                console.log('Skipping MongoDB test - no connection string');
                return;
            }

            expect(taskStorageManager).toBeDefined();

            const health = await taskStorageManager.getStorageHealth('test-user');
            expect(health.healthy).toBe(true);
            expect(health.storageType).toBe('mongodb');
            expect(health.userBased).toBe(true);
        });

        test('should save and load tasks with MongoDB', async () => {
            if (!process.env.MONGO_URI) {
                console.log('Skipping MongoDB test - no connection string');
                return;
            }

            const testTasks: Task[] = [
                createTestTask('mongo-test-task', {
                    schedule: { type: 'daily', time: '10:00', weekdaysOnly: true },
                    status: TaskStatus.SCHEDULED,
                    totalRuns: 5,
                    successfulRuns: 4,
                    failedRuns: 1,
                    lastRun: new Date(),
                    nextRun: new Date(Date.now() + 86400000) // Tomorrow
                })
            ];

            await taskStorageManager.saveTasks(testTasks, 'mongo-user');
            const loadedTasks = await taskStorageManager.loadTasks('mongo-user');

            expect(loadedTasks).toHaveLength(1);
            expect(loadedTasks[0].id).toBe('mongo-test-task');
            expect(loadedTasks[0].name).toBe('Test Task mongo-test-task');
            expect(loadedTasks[0].totalRuns).toBe(5);
            expect(loadedTasks[0].createdAt).toBeInstanceOf(Date);
            expect(loadedTasks[0].lastRun).toBeInstanceOf(Date);
            expect(loadedTasks[0].nextRun).toBeInstanceOf(Date);
        });

        test('should handle user isolation in MongoDB', async () => {
            if (!process.env.MONGO_URI) {
                console.log('Skipping MongoDB test - no connection string');
                return;
            }

            const mongoUser1Tasks: Task[] = [
                createTestTask('mongo-user1-task', {
                    schedule: { type: 'weekly', dayOfWeek: 'friday', time: '15:00' }
                })
            ];

            const mongoUser2Tasks: Task[] = [
                createTestTask('mongo-user2-task', {
                    schedule: { type: 'monthly', dayOfMonth: 15, time: '12:00' },
                    enabled: false,
                    status: TaskStatus.PAUSED
                })
            ];

            await taskStorageManager.saveTasks(mongoUser1Tasks, 'mongo-user1');
            await taskStorageManager.saveTasks(mongoUser2Tasks, 'mongo-user2');

            const user1Tasks = await taskStorageManager.loadTasks('mongo-user1');
            const user2Tasks = await taskStorageManager.loadTasks('mongo-user2');

            expect(user1Tasks).toHaveLength(1);
            expect(user1Tasks[0].id).toBe('mongo-user1-task');
            expect(user1Tasks[0].enabled).toBe(true);

            expect(user2Tasks).toHaveLength(1);
            expect(user2Tasks[0].id).toBe('mongo-user2-task');
            expect(user2Tasks[0].enabled).toBe(false);
        });

        test('should handle large datasets in MongoDB', async () => {
            if (!process.env.MONGO_URI) {
                console.log('Skipping MongoDB test - no connection string');
                return;
            }

            const largeTasks: Task[] = Array.from({ length: 100 }, (_, i) =>
                createTestTask(`large-mongo-task-${i}`, {
                    enabled: i % 2 === 0,
                    status: i % 3 === 0 ? TaskStatus.COMPLETED : TaskStatus.PENDING,
                    totalRuns: i,
                    successfulRuns: Math.floor(i * 0.8),
                    failedRuns: Math.floor(i * 0.2),
                    lastRun: i > 0 ? new Date() : undefined,
                    nextRun: i % 2 === 0 ? new Date(Date.now() + i * 60000) : undefined,
                    lastError: i % 10 === 0 ? `Error for task ${i}` : undefined
                })
            );

            await taskStorageManager.saveTasks(largeTasks, 'large-dataset-user');
            const loadedTasks = await taskStorageManager.loadTasks('large-dataset-user');

            expect(loadedTasks).toHaveLength(100);
            expect(loadedTasks.filter(t => t.enabled)).toHaveLength(50);
            expect(loadedTasks.filter(t => t.status === TaskStatus.COMPLETED)).toHaveLength(34);
        });
    });

    describe('Backup and Recovery', () => {
        beforeEach(async () => {
            taskStorageManager = new TaskStorageManager({
                storageType: 'json',
                userBased: false,
                jsonConfig: {
                    filePath: join(testDataDir, 'backup-tasks.json'),
                    backupEnabled: true,
                    maxBackups: 3,
                    backupInterval: 60
                }
            });

            await taskStorageManager.initialize();
        });

        test('should create backups', async () => {
            const testTasks: Task[] = [
                createTestTask('backup-task', {
                    schedule: { type: 'daily', time: '10:00', weekdaysOnly: false },
                    status: TaskStatus.SCHEDULED
                })
            ];

            await taskStorageManager.saveTasks(testTasks);
            const backupName = await taskStorageManager.createBackup();

            expect(backupName).toBeDefined();
            expect(backupName).toMatch(/tasks-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/);
        });
    });

    describe('Error Handling', () => {
        test('should handle storage health check failures gracefully', async () => {
            // Simulate failure by providing invalid configuration
            const badTaskStorageManager = new TaskStorageManager({
                storageType: 'json',
                userBased: false,
                jsonConfig: {
                    filePath: '/invalid/path/that/does/not/exist/tasks.json',
                    backupEnabled: false,
                    maxBackups: 0,
                    backupInterval: 0
                }
            });

            await badTaskStorageManager.initialize();
            const health = await badTaskStorageManager.getStorageHealth();

            expect(health.healthy).toBe(false);
            expect(health.error).toBeDefined();
            expect(health.taskCount).toBe(0);

            await badTaskStorageManager.cleanup();
        });
    });

    describe('Date Handling', () => {
        beforeEach(async () => {
            taskStorageManager = new TaskStorageManager({
                storageType: 'json',
                userBased: false,
                jsonConfig: {
                    filePath: join(testDataDir, 'date-tasks.json'),
                    backupEnabled: true,
                    maxBackups: 5,
                    backupInterval: 60
                }
            });

            await taskStorageManager.initialize();
        });

        test('should properly serialize and deserialize dates', async () => {
            const testDate = new Date('2024-12-15T10:30:45.123Z');
            const testTasks: Task[] = [
                createTestTask('date-test-task', {
                    createdAt: testDate,
                    updatedAt: testDate,
                    lastRun: testDate,
                    nextRun: new Date(testDate.getTime() + 60000) // 1 minute later
                })
            ];

            await taskStorageManager.saveTasks(testTasks);
            const loadedTasks = await taskStorageManager.loadTasks();

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

describe('Environment-based Storage Configuration', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeAll(() => {
        originalEnv = { ...process.env };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('should default to JSON storage', () => {
        delete process.env.MCP_STORAGE_TYPE;

        const manager = new TaskStorageManager();
        expect(manager).toBeDefined();
    });

    test('should configure MongoDB storage from environment', () => {
        process.env.MCP_STORAGE_TYPE = 'mongodb';
        process.env.MONGO_URI = 'mongodb://localhost:27017/test';
        process.env.MONGODB_DATABASE = 'test_db';
        process.env.MONGODB_COLLECTION = 'test_collection';
        process.env.MCP_USER_BASED = 'true';
        process.env.MCP_USER_ID = 'test-user';

        const manager = new TaskStorageManager();
        expect(manager).toBeDefined();
    });

    test('should configure JSON storage from environment', () => {
        process.env.MCP_STORAGE_TYPE = 'json';
        process.env.TASKS_FILE_PATH = './test-tasks.json';
        process.env.MCP_BACKUP_ENABLED = 'true';
        process.env.MCP_BACKUP_MAX_FILES = '10';
        process.env.MCP_USER_BASED = 'false';

        const manager = new TaskStorageManager();
        expect(manager).toBeDefined();
    });
}); 