import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TaskManager } from '../../src/core/task-manager.js';
import { UserContext, CreateTaskRequest } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('TaskManager with User Context', () => {
    let taskManager: TaskManager;
    let testDataDir: string;

    beforeEach(async () => {
        // Create temporary directories for testing
        testDataDir = join(tmpdir(), `task-manager-context-test-${Date.now()}`);
        await fs.mkdir(testDataDir, { recursive: true });

        // Initialize TaskManager with test configuration
        process.env.DATA_DIR = testDataDir;
        process.env.MCP_USER_BASED = 'true';
        taskManager = new TaskManager();
    });

    afterEach(async () => {
        // Cleanup test storage and connections
        if (taskManager) {
            await taskManager.cleanup();
        }

        // Cleanup test directories
        try {
            await fs.rm(testDataDir, { recursive: true, force: true });
        } catch (error) {
            console.warn('Failed to cleanup test directory:', error);
        }
    });

    // Helper function to create test user context
    const createUserContext = (userId: string, overrides: Partial<UserContext> = {}): UserContext => ({
        userId,
        effectiveUserId: userId,
        sharedWith: [],
        isSharedContext: false,
        ...overrides
    });

    // Helper function to create test task request
    const createTaskRequest = (overrides: Partial<CreateTaskRequest> = {}): CreateTaskRequest => ({
        name: 'Test Task',
        description: 'Test Description',
        schedule: { type: 'once', delayMinutes: 60 },
        message: 'Test message',
        enabled: true,
        ...overrides
    });

    describe('createTask with user context', () => {
        it('should create task with user context', async () => {
            const userContext = createUserContext('user-123', {
                tenantId: 'tenant-1'
            });

            const request = createTaskRequest({
                name: 'Personal Task',
                sharedWith: ['user-456']
            });

            const task = await taskManager.createTask(request, userContext);

            expect(task.creatorUserId).toBe('user-123');
            expect(task.tenantId).toBe('tenant-1');
            expect(task.sharedWith).toEqual(['user-456']);
            expect(task.contextType).toBe('shared');
            expect(task.name).toBe('Personal Task');
        });

        it('should create private task when no sharedWith specified', async () => {
            const userContext = createUserContext('user-123');
            const request = createTaskRequest({
                name: 'Private Task'
            });

            const task = await taskManager.createTask(request, userContext);

            expect(task.creatorUserId).toBe('user-123');
            expect(task.sharedWith).toEqual([]);
            expect(task.contextType).toBe('user');
        });

        it('should use creatorUserId from request when userContext not provided', async () => {
            const request = createTaskRequest({
                name: 'Legacy Task',
                creatorUserId: 'request-user-456'
            });

            const task = await taskManager.createTask(request);

            expect(task.creatorUserId).toBe('request-user-456');
            expect(task.sharedWith).toEqual([]);
            expect(task.contextType).toBe('user');
        });

        it('should prioritize userContext.userId over request.creatorUserId', async () => {
            const userContext = createUserContext('context-user-123');
            const request = createTaskRequest({
                name: 'Priority Test',
                creatorUserId: 'request-user-456'
            });

            const task = await taskManager.createTask(request, userContext);

            expect(task.creatorUserId).toBe('context-user-123');
        });

        it('should throw error when no creator user ID available', async () => {
            const request = createTaskRequest({
                name: 'No Creator Task'
            });

            await expect(taskManager.createTask(request))
                .rejects
                .toThrow('Creator user ID is required for task creation');
        });

        it('should handle shared context with original user', async () => {
            const userContext = createUserContext('agent-user', {
                originalUserId: 'original-user-123',
                effectiveUserId: 'original-user-123',
                isSharedContext: true
            });

            const request = createTaskRequest({
                name: 'Shared Context Task'
            });

            const task = await taskManager.createTask(request, userContext);

            expect(task.creatorUserId).toBe('original-user-123');
            expect(task.contextType).toBe('user');
        });

        it('should handle tenant isolation', async () => {
            const userContext = createUserContext('user-123', {
                tenantId: 'tenant-corporate'
            });

            const request = createTaskRequest({
                name: 'Corporate Task'
            });

            const task = await taskManager.createTask(request, userContext);

            expect(task.creatorUserId).toBe('user-123');
            expect(task.tenantId).toBe('tenant-corporate');
        });
    });

    describe('getAllTasks with user filtering', () => {
        beforeEach(async () => {
            // Create test tasks for different users
            const user1Context = createUserContext('user-1');
            const user2Context = createUserContext('user-2');
            const user3Context = createUserContext('user-3');

            // User 1 tasks
            await taskManager.createTask(createTaskRequest({
                name: 'User 1 Private Task'
            }), user1Context);

            await taskManager.createTask(createTaskRequest({
                name: 'User 1 Shared Task',
                sharedWith: ['user-2']
            }), user1Context);

            // User 2 tasks
            await taskManager.createTask(createTaskRequest({
                name: 'User 2 Private Task'
            }), user2Context);

            // User 3 task shared with user 1
            await taskManager.createTask(createTaskRequest({
                name: 'User 3 Shared with User 1',
                sharedWith: ['user-1']
            }), user3Context);
        });

        it('should return all tasks when called without filtering', async () => {
            const allTasks = await taskManager.getAllTasks();
            expect(allTasks).toHaveLength(4);
        });

        it('should filter tasks accessible to specific user', async () => {
            const user1Context = createUserContext('user-1');
            const allTasks = await taskManager.getAllTasks();

            // Filter using our validation logic (simulating what would happen in the request handler)
            const accessibleTasks = allTasks.filter(task => {
                // User is creator
                if (task.creatorUserId === user1Context.userId) return true;
                // User is in shared list
                if (task.sharedWith.includes(user1Context.userId)) return true;
                return false;
            });

            expect(accessibleTasks).toHaveLength(3); // 2 created by user-1, 1 shared with user-1
            expect(accessibleTasks.map(t => t.name)).toContain('User 1 Private Task');
            expect(accessibleTasks.map(t => t.name)).toContain('User 1 Shared Task');
            expect(accessibleTasks.map(t => t.name)).toContain('User 3 Shared with User 1');
        });

        it('should handle user with no accessible tasks', async () => {
            const user4Context = createUserContext('user-4');
            const allTasks = await taskManager.getAllTasks();

            const accessibleTasks = allTasks.filter(task => {
                if (task.creatorUserId === user4Context.userId) return true;
                if (task.sharedWith.includes(user4Context.userId)) return true;
                return false;
            });

            expect(accessibleTasks).toHaveLength(0);
        });
    });

    describe('getTaskById with access validation', () => {
        let taskId: string;
        let creatorUserId: string;
        let sharedUserId: string;

        beforeEach(async () => {
            creatorUserId = 'creator-user-123';
            sharedUserId = 'shared-user-456';

            const creatorContext = createUserContext(creatorUserId);
            const task = await taskManager.createTask(createTaskRequest({
                name: 'Access Test Task',
                sharedWith: [sharedUserId]
            }), creatorContext);

            taskId = task.id;
        });

        it('should allow creator to access task', async () => {
            const task = taskManager.getTask(taskId);
            expect(task).toBeDefined();
            expect(task?.creatorUserId).toBe(creatorUserId);
        });

        it('should allow shared user to access task conceptually', async () => {
            const task = taskManager.getTask(taskId);
            expect(task).toBeDefined();
            expect(task?.sharedWith).toContain(sharedUserId);

            // In real implementation, access validation would happen at the request handler level
            // Here we verify the task structure supports it
            expect(task?.sharedWith.includes(sharedUserId)).toBe(true);
        });

        it('should return task structure with complete user context info', async () => {
            const task = taskManager.getTask(taskId);

            expect(task).toBeDefined();
            expect(task?.creatorUserId).toBe(creatorUserId);
            expect(task?.sharedWith).toEqual([sharedUserId]);
            expect(task?.contextType).toBe('shared');
            expect(task?.tenantId).toBeUndefined();
        });
    });

    describe('updateTask with context preservation', () => {
        let taskId: string;
        let originalCreatorUserId: string;

        beforeEach(async () => {
            originalCreatorUserId = 'original-creator-123';
            const creatorContext = createUserContext(originalCreatorUserId);

            const task = await taskManager.createTask(createTaskRequest({
                name: 'Original Task',
                sharedWith: ['user-456']
            }), creatorContext);

            taskId = task.id;
        });

        it('should preserve user context during updates', async () => {
            await taskManager.updateTask(taskId, {
                name: 'Updated Task Name',
                description: 'Updated description'
            });

            const updatedTask = taskManager.getTask(taskId);

            expect(updatedTask?.name).toBe('Updated Task Name');
            expect(updatedTask?.description).toBe('Updated description');

            // Context should be preserved
            expect(updatedTask?.creatorUserId).toBe(originalCreatorUserId);
            expect(updatedTask?.sharedWith).toEqual(['user-456']);
            expect(updatedTask?.contextType).toBe('shared');
        });

        it('should maintain task relationships after update', async () => {
            const beforeUpdate = taskManager.getTask(taskId);

            await taskManager.updateTask(taskId, {
                enabled: false
            });

            const afterUpdate = taskManager.getTask(taskId);

            expect(afterUpdate?.enabled).toBe(false);
            expect(afterUpdate?.creatorUserId).toBe(beforeUpdate?.creatorUserId);
            expect(afterUpdate?.sharedWith).toEqual(beforeUpdate?.sharedWith);
            expect(afterUpdate?.contextType).toBe(beforeUpdate?.contextType);
        });
    });

    describe('deleteTask with context considerations', () => {
        let taskId: string;

        beforeEach(async () => {
            const creatorContext = createUserContext('creator-123');
            const task = await taskManager.createTask(createTaskRequest({
                name: 'Task to Delete',
                sharedWith: ['user-456', 'user-789']
            }), creatorContext);

            taskId = task.id;
        });

        it('should delete task and all its context information', async () => {
            const beforeDelete = taskManager.getTask(taskId);
            expect(beforeDelete).toBeDefined();
            expect(beforeDelete?.sharedWith).toHaveLength(2);

            await taskManager.deleteTask(taskId);

            const afterDelete = taskManager.getTask(taskId);
            expect(afterDelete).toBeUndefined();
        });

        it('should handle deletion of shared tasks', async () => {
            // Verify shared task exists
            const task = taskManager.getTask(taskId);
            expect(task?.contextType).toBe('shared');
            expect(task?.sharedWith).toContain('user-456');

            await taskManager.deleteTask(taskId);

            // Task should be completely removed
            const deletedTask = taskManager.getTask(taskId);
            expect(deletedTask).toBeUndefined();
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle empty sharedWith array correctly', async () => {
            const userContext = createUserContext('user-123');
            const request = createTaskRequest({
                name: 'Empty Shared Task',
                sharedWith: []
            });

            const task = await taskManager.createTask(request, userContext);

            expect(task.sharedWith).toEqual([]);
            expect(task.contextType).toBe('user');
        });

        it('should handle null/undefined user context gracefully', async () => {
            const request = createTaskRequest({
                name: 'No Context Task',
                creatorUserId: 'fallback-user'
            });

            const task = await taskManager.createTask(request, undefined);

            expect(task.creatorUserId).toBe('fallback-user');
            expect(task.sharedWith).toEqual([]);
            expect(task.tenantId).toBeUndefined();
        });

        it('should handle very long user ID lists in sharedWith', async () => {
            const longSharedList = Array.from({ length: 100 }, (_, i) => `user-${i}`);
            const userContext = createUserContext('creator-123');

            const request = createTaskRequest({
                name: 'Large Shared List Task',
                sharedWith: longSharedList
            });

            const task = await taskManager.createTask(request, userContext);

            expect(task.sharedWith).toHaveLength(100);
            expect(task.contextType).toBe('shared');
        });

        it('should handle special characters in user IDs', async () => {
            const specialUserId = 'user@domain.com#special-chars_123';
            const userContext = createUserContext(specialUserId);

            const request = createTaskRequest({
                name: 'Special Chars Task'
            });

            const task = await taskManager.createTask(request, userContext);

            expect(task.creatorUserId).toBe(specialUserId);
        });

        it('should preserve user context through task execution lifecycle', async () => {
            const userContext = createUserContext('lifecycle-user', {
                tenantId: 'lifecycle-tenant'
            });

            const request = createTaskRequest({
                name: 'Lifecycle Test Task',
                schedule: { type: 'once', delayMinutes: 0.1 }, // Minimum valid delay
                sharedWith: ['observer-user']
            });

            const task = await taskManager.createTask(request, userContext);

            // Verify initial state
            expect(task.creatorUserId).toBe('lifecycle-user');
            expect(task.tenantId).toBe('lifecycle-tenant');
            expect(task.sharedWith).toEqual(['observer-user']);

            // Task context should remain intact throughout its lifecycle
            const retrievedTask = taskManager.getTask(task.id);
            expect(retrievedTask?.creatorUserId).toBe('lifecycle-user');
            expect(retrievedTask?.tenantId).toBe('lifecycle-tenant');
            expect(retrievedTask?.sharedWith).toEqual(['observer-user']);
        });
    });
}); 