import { UserContext, Task } from '../types/index.js';

/**
 * Extract user context from LibreChat MCP request
 * Handles both direct user requests and shared context from scheduled tasks
 */
export function extractUserContext(request: any): UserContext {
    // Extract user ID from LibreChat MCP request
    const userId = request.params?.userId;
    const originalUserId = request.params?.originalUserId;
    const sharedWith = request.params?.sharedWith || [];
    const tenantId = request.params?.tenantId;

    // Determine effective user ID for data operations
    const effectiveUserId = originalUserId || userId;
    const isSharedContext = !!originalUserId;

    if (!effectiveUserId) {
        throw new Error('No user context available in request');
    }

    return {
        userId: userId || 'unknown',
        tenantId,
        originalUserId,
        sharedWith,
        isSharedContext,
        effectiveUserId
    };
}

/**
 * Validate if a user has access to a task
 * Supports creator access, shared access, and original user access
 */
export function validateUserAccess(task: Task, userContext: UserContext): boolean {
    // User is the creator
    if (task.creatorUserId === userContext.userId) {
        return true;
    }

    // User is in the shared list (with null/undefined check)
    if (task.sharedWith && task.sharedWith.includes(userContext.userId)) {
        return true;
    }

    // Original user (from shared context) is the creator
    if (userContext.originalUserId === task.creatorUserId) {
        return true;
    }

    // Original user (from shared context) is in the shared list (with null/undefined check)
    if (userContext.originalUserId && task.sharedWith && task.sharedWith.includes(userContext.originalUserId)) {
        return true;
    }

    return false;
}

/**
 * Backward compatibility: Extract user ID using legacy method
 * Falls back to new context extraction if legacy method fails
 */
export function extractUserId(request: any): string | undefined {
    try {
        const context = extractUserContext(request);
        return context.effectiveUserId;
    } catch (error) {
        console.warn('Failed to extract user context, falling back to legacy method:', error);

        // Legacy fallback
        if (request.params?.userId) {
            return request.params.userId.trim();
        }
        if (process.env.MCP_USER_ID) {
            return process.env.MCP_USER_ID;
        }
        return undefined;
    }
} 