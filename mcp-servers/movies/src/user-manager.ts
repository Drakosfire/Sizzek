export class UserManager {
    private currentUserId: string | null = null;

    constructor() {
        // Initialize user ID from environment variable
        this.currentUserId = process.env.MCP_USER_ID || 'default';
    }

    getCurrentUserId(): string {
        if (!this.currentUserId) {
            throw new Error('No user context available. Please set MCP_USER_ID environment variable.');
        }
        return this.currentUserId;
    }

    setCurrentUserId(userId: string): void {
        this.currentUserId = userId;
    }

    validateUserId(userId: string): boolean {
        return !!(userId && userId.trim().length > 0);
    }

    isCurrentUser(userId: string): boolean {
        return this.getCurrentUserId() === userId;
    }

    getSessionInfo(): { userId: string; sessionActive: boolean } {
        return {
            userId: this.getCurrentUserId(),
            sessionActive: this.currentUserId !== null
        };
    }
} 