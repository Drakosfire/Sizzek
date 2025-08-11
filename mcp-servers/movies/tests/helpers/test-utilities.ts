// tests/helpers/test-utilities.ts

export interface TestResult {
    name: string;
    passed: boolean;
    error?: Error;
    duration: number;
}

export class TestRunner {
    private tests: Array<{ name: string; fn: () => Promise<void> }> = [];
    private results: TestResult[] = [];

    constructor(private suiteName: string) { }

    test(name: string, fn: () => Promise<void>) {
        this.tests.push({ name, fn });
    }

    async run(): Promise<TestResult[]> {
        console.log(`\n🧪 Running test suite: ${this.suiteName}`);
        console.log('='.repeat(50));

        for (const test of this.tests) {
            const startTime = Date.now();

            try {
                await test.fn();
                const duration = Date.now() - startTime;

                this.results.push({
                    name: test.name,
                    passed: true,
                    duration
                });

                console.log(`✅ ${test.name} (${duration}ms)`);
            } catch (error) {
                const duration = Date.now() - startTime;

                this.results.push({
                    name: test.name,
                    passed: false,
                    error: error as Error,
                    duration
                });

                console.log(`❌ ${test.name} (${duration}ms)`);
                console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        this.printSummary();
        return this.results;
    }

    private printSummary() {
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.length - passed;
        const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);

        console.log('\n📊 Test Summary:');
        console.log(`   Passed: ${passed}`);
        console.log(`   Failed: ${failed}`);
        console.log(`   Total time: ${totalTime}ms`);

        if (failed > 0) {
            console.log('\n❌ Failed tests:');
            this.results
                .filter(r => !r.passed)
                .forEach(r => console.log(`   - ${r.name}: ${r.error?.message}`));
        }
    }

    getResults(): TestResult[] {
        return this.results;
    }
}

// Assertion utilities
export const assert = {
    true(condition: boolean, message?: string) {
        if (!condition) {
            throw new Error(message || 'Expected condition to be true');
        }
    },

    false(condition: boolean, message?: string) {
        if (condition) {
            throw new Error(message || 'Expected condition to be false');
        }
    },

    equal<T>(actual: T, expected: T, message?: string) {
        if (actual !== expected) {
            throw new Error(
                message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
            );
        }
    },

    notEqual<T>(actual: T, expected: T, message?: string) {
        if (actual === expected) {
            throw new Error(
                message || `Expected values to be different, but both were ${JSON.stringify(actual)}`
            );
        }
    },

    deepEqual(actual: any, expected: any, message?: string) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(
                message || `Deep comparison failed.\nExpected: ${JSON.stringify(expected, null, 2)}\nActual: ${JSON.stringify(actual, null, 2)}`
            );
        }
    },

    hasProperty(object: any, property: string, message?: string) {
        if (!object || typeof object !== 'object' || !(property in object)) {
            throw new Error(
                message || `Expected object to have property '${property}'`
            );
        }
    },

    throws(fn: () => void, message?: string) {
        try {
            fn();
            throw new Error(message || 'Expected function to throw an error');
        } catch (error) {
            // Expected behavior
        }
    },

    async throwsAsync(fn: () => Promise<void>, message?: string) {
        try {
            await fn();
            throw new Error(message || 'Expected async function to throw an error');
        } catch (error) {
            // Expected behavior
        }
    }
};

// Test data cleanup utilities
export class TestDataManager {
    private testDirectories: string[] = [];

    createTestDirectory(name: string): string {
        const testDir = `./test-data-${name}-${Date.now()}`;
        this.testDirectories.push(testDir);
        return testDir;
    }

    async cleanup() {
        const fs = await import('fs');
        for (const dir of this.testDirectories) {
            try {
                await fs.promises.rm(dir, { recursive: true, force: true });
            } catch (error) {
                console.warn(`Failed to clean up test directory ${dir}:`, error);
            }
        }
        this.testDirectories = [];
    }
}

// Mock utilities
export function createMockStorage() {
    const data = {
        movies: [] as any[],
        reviews: [] as any[],
        users: [] as any[],
        votes: [] as any[],
        journalSharing: [] as any[]
    };

    return {
        // Movie operations
        async getMovies(filters?: any) {
            let movies = [...data.movies];
            if (filters) {
                if (filters.year) movies = movies.filter(m => m.year === filters.year);
                if (filters.director) movies = movies.filter(m => m.director.toLowerCase().includes(filters.director.toLowerCase()));
                if (filters.tags) movies = movies.filter(m => m.tags?.some((t: string) => filters.tags.includes(t)));
                if (filters.addedBy) movies = movies.filter(m => m.addedBy === filters.addedBy);
            }
            return movies;
        },

        async getMovieById(id: string) {
            return data.movies.find(m => m.id === id) || null;
        },

        async addMovie(movie: any) {
            const newMovie = {
                ...movie,
                id: `mock-movie-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                addedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            data.movies.push(newMovie);
            return newMovie;
        },

        async updateMovie(id: string, updates: any) {
            const index = data.movies.findIndex(m => m.id === id);
            if (index === -1) throw new Error(`Movie with id ${id} not found`);

            data.movies[index] = {
                ...data.movies[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            return data.movies[index];
        },

        async deleteMovie(id: string) {
            const index = data.movies.findIndex(m => m.id === id);
            if (index === -1) return false;
            data.movies.splice(index, 1);
            return true;
        },

        // Review operations
        async getReviewsForMovie(movieId: string) {
            return data.reviews.filter(r => r.movieId === movieId);
        },

        async getReviewsForUser(userId: string) {
            return data.reviews.filter(r => r.userId === userId);
        },

        async addReview(review: any) {
            const newReview = {
                ...review,
                id: `mock-review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            data.reviews.push(newReview);
            return newReview;
        },

        async updateReview(id: string, updates: any) {
            const index = data.reviews.findIndex(r => r.id === id);
            if (index === -1) throw new Error(`Review with id ${id} not found`);

            data.reviews[index] = {
                ...data.reviews[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            return data.reviews[index];
        },

        async deleteReview(id: string) {
            const index = data.reviews.findIndex(r => r.id === id);
            if (index === -1) return false;
            data.reviews.splice(index, 1);
            return true;
        },

        // Always Movie operations
        async getAlwaysMovieVotes(movieId: string) {
            return data.votes.filter(v => v.movieId === movieId);
        },

        async addAlwaysMovieVote(vote: any) {
            // Remove existing vote from same user for same movie
            data.votes = data.votes.filter(v => !(v.movieId === vote.movieId && v.userId === vote.userId));

            const newVote = {
                ...vote,
                id: `mock-vote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                votedAt: new Date().toISOString()
            };
            data.votes.push(newVote);
            return newVote;
        },

        // User operations
        async getUserPreferences(userId: string) {
            return data.users.find(u => u.userId === userId) || null;
        },

        async updateUserPreferences(userId: string, prefs: any) {
            const index = data.users.findIndex(u => u.userId === userId);
            const updatedPrefs = {
                userId,
                favoriteTags: [],
                moodMappings: {},
                ratingTendency: 'balanced' as const,
                defaultPrivacy: 'private' as const,
                ...prefs
            };

            if (index >= 0) {
                data.users[index] = { ...data.users[index], ...updatedPrefs };
            } else {
                data.users.push(updatedPrefs);
            }

            return updatedPrefs;
        },

        // Journal sharing operations
        async getJournalSharing(userId: string) {
            return data.journalSharing.find(s => s.userId === userId) || null;
        },

        async updateJournalSharing(userId: string, sharing: any) {
            const index = data.journalSharing.findIndex(s => s.userId === userId);
            const now = new Date().toISOString();
            const updatedSharing = {
                userId,
                sharedWith: [],
                sharedBy: [],
                createdAt: now,
                updatedAt: now,
                ...sharing
            };

            if (index >= 0) {
                data.journalSharing[index] = { ...data.journalSharing[index], ...updatedSharing, updatedAt: now };
            } else {
                data.journalSharing.push(updatedSharing);
            }

            return updatedSharing;
        },

        async getSharedJournalMembers(userId: string) {
            const sharing = await this.getJournalSharing(userId);
            if (!sharing) return [userId];

            const allMembers = new Set([userId]);
            sharing.sharedWith.forEach((uid: string) => allMembers.add(uid));
            sharing.sharedBy.forEach((uid: string) => allMembers.add(uid));

            return Array.from(allMembers);
        },

        async getSharedJournalContext(userId: string) {
            const journalMembers = await this.getSharedJournalMembers(userId);
            const sharing = await this.getJournalSharing(userId);

            return {
                journalMembers,
                journalName: sharing?.journalName,
                canAddMovies: true,
                canAddReviews: true,
                canVoteAlways: true
            };
        },

        // Test utilities
        __getTestData() {
            return data;
        },

        __clearTestData() {
            data.movies = [];
            data.reviews = [];
            data.users = [];
            data.votes = [];
            data.journalSharing = [];
        },

        __setTestData(newData: any) {
            Object.assign(data, newData);
        }
    };
} 