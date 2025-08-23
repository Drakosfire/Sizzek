import { describe, it, expect, beforeEach } from '@jest/globals';
import { extractUserContext, validateUserAccess } from '../../src/utils/user-context.js';
import { Task, TaskStatus, UserContext } from '../../src/types/index.js';

describe('User Context Utils', () => {
    describe('extractUserContext', () => {
        it('should extract complete user context from LibreChat request', () => {
            const request = {
                params: {
                    userId: 'current-user-123',
                    originalUserId: 'original-user-456',
                    sharedWith: ['user-789', 'user-abc'],
                    tenantId: 'tenant-xyz'
                }
            };

            const result = extractUserContext(request);

            expect(result.userId).toBe('current-user-123');
            expect(result.originalUserId).toBe('original-user-456');
            expect(result.effectiveUserId).toBe('original-user-456');
            expect(result.sharedWith).toEqual(['user-789', 'user-abc']);
            expect(result.tenantId).toBe('tenant-xyz');
            expect(result.isSharedContext).toBe(true);
        });

        it('should handle non-shared context (no originalUserId)', () => {
            const request = {
                params: {
                    userId: 'user-123',
                    tenantId: 'tenant-xyz'
                }
            };

            const result = extractUserContext(request);

            expect(result.userId).toBe('user-123');
            expect(result.originalUserId).toBeUndefined();
            expect(result.effectiveUserId).toBe('user-123');
            expect(result.sharedWith).toEqual([]);
            expect(result.tenantId).toBe('tenant-xyz');
            expect(result.isSharedContext).toBe(false);
        });

        it('should use default values for missing optional fields', () => {
            const request = {
                params: {
                    userId: 'user-123'
                }
            };

            const result = extractUserContext(request);

            expect(result.userId).toBe('user-123');
            expect(result.effectiveUserId).toBe('user-123');
            expect(result.sharedWith).toEqual([]);
            expect(result.tenantId).toBeUndefined();
            expect(result.isSharedContext).toBe(false);
        });

        it('should throw error when no user context is available', () => {
            const request = {
                params: {}
            };

            expect(() => extractUserContext(request)).toThrow('No user context available in request');
        });

        it('should throw error when request has no params', () => {
            const request = {};

            expect(() => extractUserContext(request)).toThrow('No user context available in request');
        });

        it('should handle empty or null userId', () => {
            const request = {
                params: {
                    userId: '',
                    originalUserId: 'original-123'
                }
            };

            const result = extractUserContext(request);

            expect(result.userId).toBe('unknown');
            expect(result.effectiveUserId).toBe('original-123');
            expect(result.isSharedContext).toBe(true);
        });

        it('should handle null sharedWith array', () => {
            const request = {
                params: {
                    userId: 'user-123',
                    sharedWith: null
                }
            };

            const result = extractUserContext(request);

            expect(result.sharedWith).toEqual([]);
        });
    });

    describe('validateUserAccess', () => {
        let task: Task;
        let baseUserContext: UserContext;

        beforeEach(() => {
            task = {
                id: 'task-123',
                name: 'Test Task',
                description: 'Test Description',
                schedule: { type: 'once', delayMinutes: 60 },
                message: 'Test message',
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
                creatorUserId: 'creator-123',
                tenantId: 'tenant-1',
                sharedWith: ['shared-user-456', 'shared-user-789'],
                contextType: 'shared'
            };

            baseUserContext = {
                userId: 'current-user',
                effectiveUserId: 'current-user',
                sharedWith: [],
                isSharedContext: false
            };
        });

        it('should allow access for task creator', () => {
            const userContext = {
                ...baseUserContext,
                userId: 'creator-123',
                effectiveUserId: 'creator-123'
            };

            expect(validateUserAccess(task, userContext)).toBe(true);
        });

        it('should allow access for user in sharedWith list', () => {
            const userContext = {
                ...baseUserContext,
                userId: 'shared-user-456',
                effectiveUserId: 'shared-user-456'
            };

            expect(validateUserAccess(task, userContext)).toBe(true);
        });

        it('should allow access for original user in shared context', () => {
            const userContext = {
                ...baseUserContext,
                userId: 'agent-user',
                originalUserId: 'creator-123',
                effectiveUserId: 'creator-123',
                isSharedContext: true
            };

            expect(validateUserAccess(task, userContext)).toBe(true);
        });

        it('should deny access for unauthorized user', () => {
            const userContext = {
                ...baseUserContext,
                userId: 'unauthorized-user',
                effectiveUserId: 'unauthorized-user'
            };

            expect(validateUserAccess(task, userContext)).toBe(false);
        });

        it('should handle empty sharedWith array', () => {
            const privateTask = {
                ...task,
                sharedWith: [],
                contextType: 'user' as const
            };

            const userContext = {
                ...baseUserContext,
                userId: 'random-user',
                effectiveUserId: 'random-user'
            };

            expect(validateUserAccess(privateTask, userContext)).toBe(false);
        });

        it('should handle undefined sharedWith array', () => {
            const taskWithoutSharedWith = {
                ...task,
                sharedWith: undefined as any
            };

            const userContext = {
                ...baseUserContext,
                userId: 'creator-123',
                effectiveUserId: 'creator-123'
            };

            // Should still work for creator
            expect(validateUserAccess(taskWithoutSharedWith, userContext)).toBe(true);
        });

        it('should handle case sensitivity in user IDs', () => {
            const userContext = {
                ...baseUserContext,
                userId: 'Creator-123', // Different case
                effectiveUserId: 'Creator-123'
            };

            // Should be case sensitive and deny access
            expect(validateUserAccess(task, userContext)).toBe(false);
        });

        describe('complex sharing scenarios', () => {
            it('should handle nested shared context validation', () => {
                const userContext = {
                    ...baseUserContext,
                    userId: 'agent-user',
                    originalUserId: 'shared-user-456', // Original user is in sharedWith
                    effectiveUserId: 'shared-user-456',
                    isSharedContext: true
                };

                // This should be true because originalUserId is in sharedWith
                expect(validateUserAccess(task, userContext)).toBe(true);
            });

            it('should handle agent context with creator as original user', () => {
                const userContext = {
                    ...baseUserContext,
                    userId: 'agent-bot-123',
                    originalUserId: 'creator-123',
                    effectiveUserId: 'creator-123',
                    isSharedContext: true
                };

                expect(validateUserAccess(task, userContext)).toBe(true);
            });
        });
    });

    describe('UserContext interface validation', () => {
        it('should create valid UserContext with all fields', () => {
            const context: UserContext = {
                userId: 'user-123',
                originalUserId: 'original-456',
                sharedWith: ['user-789'],
                tenantId: 'tenant-1',
                isSharedContext: true,
                effectiveUserId: 'original-456'
            };

            expect(context.userId).toBe('user-123');
            expect(context.originalUserId).toBe('original-456');
            expect(context.effectiveUserId).toBe('original-456');
            expect(context.isSharedContext).toBe(true);
            expect(context.sharedWith).toEqual(['user-789']);
            expect(context.tenantId).toBe('tenant-1');
        });

        it('should create valid UserContext with minimal fields', () => {
            const context: UserContext = {
                userId: 'user-123',
                sharedWith: [],
                isSharedContext: false,
                effectiveUserId: 'user-123'
            };

            expect(context.userId).toBe('user-123');
            expect(context.effectiveUserId).toBe('user-123');
            expect(context.isSharedContext).toBe(false);
            expect(context.sharedWith).toEqual([]);
            expect(context.originalUserId).toBeUndefined();
            expect(context.tenantId).toBeUndefined();
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle malformed request objects', () => {
            const malformedRequest = {
                params: {
                    userId: null,
                    originalUserId: undefined,
                    sharedWith: 'not-an-array',
                }
            };

            expect(() => extractUserContext(malformedRequest)).toThrow();
        });

        it('should handle request with nested params', () => {
            const request = {
                params: {
                    arguments: {
                        userId: 'nested-user'
                    },
                    userId: 'top-level-user'
                }
            };

            const result = extractUserContext(request);
            expect(result.userId).toBe('top-level-user');
        });

        it('should handle very long user ID strings', () => {
            const longUserId = 'a'.repeat(1000);
            const request = {
                params: {
                    userId: longUserId
                }
            };

            const result = extractUserContext(request);
            expect(result.userId).toBe(longUserId);
        });

        it('should handle special characters in user IDs', () => {
            const specialUserId = 'user-123@domain.com#test';
            const request = {
                params: {
                    userId: specialUserId
                }
            };

            const result = extractUserContext(request);
            expect(result.userId).toBe(specialUserId);
        });

        it('should handle empty arrays and objects gracefully', () => {
            const request = {
                params: {
                    userId: 'user-123',
                    sharedWith: [],
                    metadata: {}
                }
            };

            const result = extractUserContext(request);
            expect(result.sharedWith).toEqual([]);
            expect(result.userId).toBe('user-123');
        });
    });
}); 