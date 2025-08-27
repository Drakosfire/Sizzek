import { UserContext, Task } from '../types/index.js';

/**
 * Extract user context from LibreChat MCP request
 * Handles both direct user requests and shared context from scheduled tasks
 */
export function extractUserContext(request: any): UserContext {
    console.error(`[DEBUG] extractUserContext - Request params:`, request.params);
    console.error(`[DEBUG] extractUserContext - Request params.userId: "${request.params?.userId}"`);
    console.error(`[DEBUG] extractUserContext - Request params.originalUserId: "${request.params?.originalUserId}"`);

    // Extract user ID from LibreChat MCP request
    const userId = request.params?.userId;
    // Handle the case where originalUserId comes through as the string "undefined"
    const originalUserId = request.params?.originalUserId && request.params.originalUserId !== "undefined"
        ? request.params.originalUserId
        : undefined;
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
    console.error(`[DEBUG] validateUserAccess - Task: ${task.name}`);
    console.error(`[DEBUG] validateUserAccess - Task creatorUserId: "${task.creatorUserId}"`);
    console.error(`[DEBUG] validateUserAccess - User context userId: "${userContext.userId}"`);
    console.error(`[DEBUG] validateUserAccess - User context effectiveUserId: "${userContext.effectiveUserId}"`);
    console.error(`[DEBUG] validateUserAccess - User context originalUserId: "${userContext.originalUserId}"`);
    console.error(`[DEBUG] validateUserAccess - Task sharedWith:`, task.sharedWith);

    // User is the creator (check both userId and effectiveUserId)
    if (task.creatorUserId === userContext.userId || task.creatorUserId === userContext.effectiveUserId) {
        console.error(`[DEBUG] validateUserAccess - ✅ User is creator`);
        return true;
    }

    // User is the original user of a shared task
    if (userContext.originalUserId && task.creatorUserId === userContext.originalUserId) {
        console.error(`[DEBUG] validateUserAccess - ✅ User is original user of shared task`);
        return true;
    }

    // User is in the shared list (check both userId and effectiveUserId)
    if (task.sharedWith && (
        task.sharedWith.includes(userContext.userId) ||
        task.sharedWith.includes(userContext.effectiveUserId)
    )) {
        console.error(`[DEBUG] validateUserAccess - ✅ User is in shared list`);
        return true;
    }

    console.error(`[DEBUG] validateUserAccess - ❌ No access granted`);
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