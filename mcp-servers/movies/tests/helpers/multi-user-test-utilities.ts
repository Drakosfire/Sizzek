// tests/helpers/multi-user-test-utilities.ts

import { MovieStorageInterface } from '../../src/storage/StorageInterface.js';
import { UserManager } from '../../src/user-manager.js';
import { MovieManager } from '../../src/movie-manager.js';

export interface TestUser {
    id: string;
    name: string;
    preferences: {
        favoriteTags: string[];
        ratingTendency: 'generous' | 'critical' | 'balanced';
    };
    journalSharing: {
        sharedWith: string[];
        sharedBy: string[];
        journalName?: string;
    };
}

export interface SecurityCheckResult {
    operation: string;
    status: 'PASSED' | 'FAILED';
    message?: string;
    timestamp: string;
}

export class MultiUserTestFramework {
    private testUsers: Map<string, TestUser>;
    private securityChecks: SecurityCheckResult[] = [];
    private originalUserId: string | undefined;

    constructor() {
        this.testUsers = new Map();
        this.setupTestUsers();
        this.originalUserId = process.env.MCP_USER_ID;
    }

    private setupTestUsers() {
        this.addUser('alice', {
            id: 'test-user-alice',
            name: 'Alice',
            preferences: {
                favoriteTags: ['comedy', 'romance'],
                ratingTendency: 'generous'
            },
            journalSharing: {
                sharedWith: ['test-user-bob'],
                sharedBy: [],
                journalName: 'Alice & Bob\'s Movie Journal'
            }
        });

        this.addUser('bob', {
            id: 'test-user-bob',
            name: 'Bob',
            preferences: {
                favoriteTags: ['action', 'thriller'],
                ratingTendency: 'critical'
            },
            journalSharing: {
                sharedWith: [],
                sharedBy: ['test-user-alice'],
                journalName: 'Alice & Bob\'s Movie Journal'
            }
        });

        this.addUser('charlie', {
            id: 'test-user-charlie',
            name: 'Charlie',
            preferences: {
                favoriteTags: ['drama', 'documentary'],
                ratingTendency: 'balanced'
            },
            journalSharing: {
                sharedWith: [],
                sharedBy: [], // Charlie has a separate journal
                journalName: 'Charlie\'s Personal Journal'
            }
        });
    }

    private addUser(name: string, userData: Omit<TestUser, 'name'>) {
        this.testUsers.set(name, {
            ...userData,
            name
        });
    }

    getUser(userName: string): TestUser | undefined {
        return this.testUsers.get(userName);
    }

    getAllUsers(): TestUser[] {
        return Array.from(this.testUsers.values());
    }

    async performAsUser<T>(userName: string, action: () => Promise<T>): Promise<T> {
        const user = this.testUsers.get(userName);
        if (!user) {
            throw new Error(`Unknown test user: ${userName}`);
        }

        // Store current user ID
        const previousUserId = process.env.MCP_USER_ID;

        try {
            // Set user context
            process.env.MCP_USER_ID = user.id;

            const result = await action();

            return result;
        } finally {
            // Restore previous user context
            if (previousUserId) {
                process.env.MCP_USER_ID = previousUserId;
            } else {
                delete process.env.MCP_USER_ID;
            }
        }
    }

    async performAsUserSync<T>(userName: string, action: () => T): Promise<T> {
        const user = this.testUsers.get(userName);
        if (!user) {
            throw new Error(`Unknown test user: ${userName}`);
        }

        // Store current user ID
        const previousUserId = process.env.MCP_USER_ID;

        try {
            // Set user context
            process.env.MCP_USER_ID = user.id;

            const result = action();

            return result;
        } finally {
            // Restore previous user context
            if (previousUserId) {
                process.env.MCP_USER_ID = previousUserId;
            } else {
                delete process.env.MCP_USER_ID;
            }
        }
    }

    async validateJournalSharing(operation: string, data: any, userName: string): Promise<void> {
        const user = this.testUsers.get(userName);
        if (!user) {
            throw new Error(`Unknown test user: ${userName}`);
        }

        try {
            // Ensure operation result only includes data from journal members
            this.validateJournalDataAccess(data, user);
            this.logSecurityCheck(operation, 'PASSED');
        } catch (error) {
            this.logSecurityCheck(operation, 'FAILED', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    async validateDataIsolation(operation: string, data: any, userName?: string): Promise<void> {
        const currentUserName = userName || this.getCurrentUserName();
        if (!currentUserName) {
            throw new Error('No current user context for data isolation validation');
        }

        await this.validateJournalSharing(operation, data, currentUserName);
    }

    private validateJournalDataAccess(data: any, user: TestUser): void {
        // Get all journal members (self + shared with + shared by)
        const journalMembers = new Set([
            user.id,
            ...user.journalSharing.sharedWith,
            ...user.journalSharing.sharedBy
        ]);

        // Check that all reviews in the data belong to journal members
        if (data.reviews) {
            for (const review of data.reviews) {
                if (!journalMembers.has(review.userId)) {
                    throw new Error(`Review from non-journal member ${review.userId} found in data for user ${user.id}`);
                }
            }
        }

        // Check that all votes belong to journal members
        if (data.alwaysMovieVotes) {
            for (const vote of data.alwaysMovieVotes) {
                if (!journalMembers.has(vote.userId)) {
                    throw new Error(`Vote from non-journal member ${vote.userId} found in data for user ${user.id}`);
                }
            }
        }

        // Check individual movies with user data
        if (Array.isArray(data)) {
            for (const movie of data) {
                this.validateMovieDataAccess(movie, user, journalMembers);
            }
        } else if (data.journalReviews) {
            // Single movie with journal reviews
            this.validateMovieDataAccess(data, user, journalMembers);
        }
    }

    private validateMovieDataAccess(movie: any, user: TestUser, journalMembers: Set<string>): void {
        // User's own review should match their ID
        if (movie.userReview && movie.userReview.userId !== user.id) {
            throw new Error(`User review has wrong userId. Expected ${user.id}, got ${movie.userReview.userId}`);
        }

        // All journal reviews should be from journal members
        if (movie.journalReviews) {
            for (const review of movie.journalReviews) {
                if (!journalMembers.has(review.userId)) {
                    throw new Error(`Journal review from non-member ${review.userId} found for user ${user.id}`);
                }
            }
        }

        // All always movie votes should be from journal members
        if (movie.alwaysMovieVotes) {
            for (const vote of movie.alwaysMovieVotes) {
                if (!journalMembers.has(vote.userId)) {
                    throw new Error(`Always movie vote from non-member ${vote.userId} found for user ${user.id}`);
                }
            }
        }
    }

    private logSecurityCheck(operation: string, status: 'PASSED' | 'FAILED', message?: string): void {
        this.securityChecks.push({
            operation,
            status,
            message,
            timestamp: new Date().toISOString()
        });

        if (status === 'FAILED') {
            console.warn(`🚨 Security check FAILED for ${operation}: ${message}`);
        }
    }

    getSecurityChecks(): SecurityCheckResult[] {
        return [...this.securityChecks];
    }

    clearSecurityChecks(): void {
        this.securityChecks = [];
    }

    private getCurrentUserName(): string | undefined {
        const currentUserId = process.env.MCP_USER_ID;
        for (const [name, user] of this.testUsers) {
            if (user.id === currentUserId) {
                return name;
            }
        }
        return undefined;
    }

    async setupSharedJournalData(storage: MovieStorageInterface): Promise<void> {
        // Set up journal sharing relationships
        for (const user of this.testUsers.values()) {
            await storage.updateJournalSharing(user.id, {
                userId: user.id,
                sharedWith: user.journalSharing.sharedWith,
                sharedBy: user.journalSharing.sharedBy,
                journalName: user.journalSharing.journalName,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            // Set up user preferences
            await storage.updateUserPreferences(user.id, {
                userId: user.id,
                favoriteTags: user.preferences.favoriteTags,
                moodMappings: {},
                ratingTendency: user.preferences.ratingTendency,
                defaultPrivacy: 'shared'
            });
        }
    }

    getSharedJournalMembers(userName: string): string[] {
        const user = this.testUsers.get(userName);
        if (!user) {
            throw new Error(`Unknown test user: ${userName}`);
        }

        const members = new Set([user.id]);
        user.journalSharing.sharedWith.forEach(id => members.add(id));
        user.journalSharing.sharedBy.forEach(id => members.add(id));

        return Array.from(members);
    }

    areUsersInSameJournal(userName1: string, userName2: string): boolean {
        const user1Members = this.getSharedJournalMembers(userName1);
        const user2Members = this.getSharedJournalMembers(userName2);

        // Check if there's any overlap
        return user1Members.some(id => user2Members.includes(id));
    }

    async createTestManager(storage: MovieStorageInterface, userName?: string): Promise<{ manager: MovieManager, userManager: UserManager }> {
        const userManager = new UserManager();
        const movieManager = new MovieManager(storage, userManager);

        if (userName) {
            const user = this.testUsers.get(userName);
            if (user) {
                userManager.setCurrentUserId(user.id);
            }
        }

        return { manager: movieManager, userManager };
    }

    cleanup(): void {
        // Restore original user ID
        if (this.originalUserId) {
            process.env.MCP_USER_ID = this.originalUserId;
        } else {
            delete process.env.MCP_USER_ID;
        }

        this.clearSecurityChecks();
    }

    printSecuritySummary(): void {
        const checks = this.getSecurityChecks();
        const passed = checks.filter(c => c.status === 'PASSED').length;
        const failed = checks.filter(c => c.status === 'FAILED').length;

        console.log(`\n🔒 Security Check Summary:`);
        console.log(`   Passed: ${passed}`);
        console.log(`   Failed: ${failed}`);

        if (failed > 0) {
            console.log('\n❌ Failed security checks:');
            checks
                .filter(c => c.status === 'FAILED')
                .forEach(c => console.log(`   - ${c.operation}: ${c.message}`));
        }
    }
} 