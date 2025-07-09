import { MovieStorageInterface } from './StorageInterface.js';
import { Movie, MovieFilters } from '../models/Movie.js';
import { Review } from '../models/Review.js';
import { AlwaysMovieVote } from '../models/AlwaysMovie.js';
import { UserPreferences, JournalSharing, SharedJournalContext } from '../models/User.js';
import { MovieUserData, defaultMovieData } from './MovieData.js';

// Import mcp-data from the installed package
import { StorageFactory } from 'mcp-data';

/**
 * Storage adapter that implements MovieStorageInterface using mcp-data package
 * This replaces the custom MongoDB and JSON storage implementations
 */
export class McpDataMovieStorage implements MovieStorageInterface {
    private storage: ReturnType<typeof StorageFactory.createUserStorage>;
    private userBased: boolean;

    constructor() {
        this.userBased = process.env.MCP_USER_BASED === 'true';

        // Create storage using mcp-data factory following todoodles pattern
        this.storage = this.createStorage();

        console.log('[McpDataMovieStorage] Initialized with storage type:', process.env.MCP_STORAGE_TYPE || 'json');
        console.log('[McpDataMovieStorage] User-based storage:', this.userBased);
    }

    private createStorage() {
        const storageType = process.env.MCP_STORAGE_TYPE || 'json';

        const config = {
            type: storageType as 'json' | 'mongodb',
            mongodb: storageType === 'mongodb' ? {
                connectionString: process.env.MONGODB_URI || 'mongodb://localhost:27017/LibreChat',
                databaseName: process.env.MONGODB_DATABASE || 'LibreChat',
                collectionName: process.env.MONGODB_COLLECTION || 'movies_data',
                connectionTimeout: parseInt(process.env.MCP_MONGODB_TIMEOUT || '10000'),
                maxRetries: parseInt(process.env.MCP_MONGODB_RETRIES || '3'),
                encryptionKey: process.env.CREDS_KEY
            } : undefined,
            json: storageType === 'json' ? {
                baseDir: process.env.MCP_MOVIES_DATA_DIR || process.env.DATA_DIR || './data',
                createDirIfNotExists: true,
                backupEnabled: process.env.MCP_BACKUP_ENABLED === 'true'
            } : undefined
        };

        return StorageFactory.createUserStorage(config, defaultMovieData);
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private async getData(userId?: string): Promise<MovieUserData> {
        if (this.userBased && userId) {
            return await this.storage.loadForUser(userId) as MovieUserData;
        } else {
            return await this.storage.load() as MovieUserData;
        }
    }

    private async saveData(data: MovieUserData, userId?: string): Promise<void> {
        data.lastUpdated = new Date().toISOString();

        if (this.userBased && userId) {
            await this.storage.saveForUser(userId, data);
        } else {
            await this.storage.save(data);
        }
    }

    // Movie operations
    async getMovies(filters?: MovieFilters): Promise<Movie[]> {
        const data = await this.getData();
        let movies = data.movies;

        if (filters) {
            if (filters.year) {
                movies = movies.filter(m => m.year === filters.year);
            }
            if (filters.director) {
                movies = movies.filter(m => m.director.toLowerCase().includes(filters.director!.toLowerCase()));
            }
            if (filters.tags && filters.tags.length > 0) {
                movies = movies.filter(m =>
                    m.tags && m.tags.some(tag =>
                        filters.tags!.some(filterTag =>
                            tag.toLowerCase().includes(filterTag.toLowerCase())
                        )
                    )
                );
            }
            if (filters.addedBy) {
                movies = movies.filter(m => m.addedBy === filters.addedBy);
            }
            if (filters.query) {
                movies = movies.filter(m =>
                    m.title.toLowerCase().includes(filters.query!.toLowerCase())
                );
            }
            if (filters.limit && filters.limit > 0) {
                movies = movies.slice(0, filters.limit);
            }
        }
        return movies;
    }

    async getMovieById(id: string): Promise<Movie | null> {
        const data = await this.getData();
        return data.movies.find(m => m.id === id) || null;
    }

    async addMovie(movieData: Omit<Movie, 'id' | 'addedAt' | 'updatedAt'>): Promise<Movie> {
        const data = await this.getData();

        const newMovie: Movie = {
            ...movieData,
            id: this.generateId(),
            addedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        data.movies.push(newMovie);
        await this.saveData(data);

        return newMovie;
    }

    async updateMovie(id: string, updates: Partial<Movie>): Promise<Movie> {
        const data = await this.getData();
        const movieIndex = data.movies.findIndex(m => m.id === id);

        if (movieIndex === -1) {
            throw new Error(`Movie with id ${id} not found`);
        }

        const updatedMovie = {
            ...data.movies[movieIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        data.movies[movieIndex] = updatedMovie;
        await this.saveData(data);

        return updatedMovie;
    }

    async deleteMovie(id: string): Promise<boolean> {
        const data = await this.getData();
        const initialLength = data.movies.length;

        data.movies = data.movies.filter(m => m.id !== id);

        if (data.movies.length === initialLength) {
            return false; // Movie not found
        }

        // Also remove related reviews and votes
        data.reviews = data.reviews.filter(r => r.movieId !== id);
        data.alwaysMovieVotes = data.alwaysMovieVotes.filter(v => v.movieId !== id);

        await this.saveData(data);
        return true;
    }

    // Review operations
    async getReviewsForMovie(movieId: string): Promise<Review[]> {
        const data = await this.getData();
        return data.reviews.filter(r => r.movieId === movieId);
    }

    async getReviewsForUser(userId: string): Promise<Review[]> {
        const data = await this.getData();
        return data.reviews.filter(r => r.userId === userId);
    }

    async addReview(reviewData: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>): Promise<Review> {
        const data = await this.getData();

        const newReview: Review = {
            ...reviewData,
            id: this.generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        data.reviews.push(newReview);
        await this.saveData(data);

        return newReview;
    }

    async updateReview(id: string, updates: Partial<Review>): Promise<Review> {
        const data = await this.getData();
        const reviewIndex = data.reviews.findIndex(r => r.id === id);

        if (reviewIndex === -1) {
            throw new Error(`Review with id ${id} not found`);
        }

        const updatedReview = {
            ...data.reviews[reviewIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        data.reviews[reviewIndex] = updatedReview;
        await this.saveData(data);

        return updatedReview;
    }

    async deleteReview(id: string): Promise<boolean> {
        const data = await this.getData();
        const initialLength = data.reviews.length;

        data.reviews = data.reviews.filter(r => r.id !== id);

        if (data.reviews.length === initialLength) {
            return false; // Review not found
        }

        await this.saveData(data);
        return true;
    }

    // Always Movie operations
    async getAlwaysMovieVotes(movieId: string): Promise<AlwaysMovieVote[]> {
        const data = await this.getData();
        return data.alwaysMovieVotes.filter(v => v.movieId === movieId);
    }

    async addAlwaysMovieVote(voteData: Omit<AlwaysMovieVote, 'id' | 'votedAt'>): Promise<AlwaysMovieVote> {
        const data = await this.getData();

        const newVote: AlwaysMovieVote = {
            ...voteData,
            id: this.generateId(),
            votedAt: new Date().toISOString()
        };

        data.alwaysMovieVotes.push(newVote);
        await this.saveData(data);

        return newVote;
    }

    // User operations
    async getUserPreferences(userId: string): Promise<UserPreferences | null> {
        const data = await this.getData(this.userBased ? userId : undefined);
        return data.userPreferences;
    }

    async updateUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences> {
        const data = await this.getData(this.userBased ? userId : undefined);

        const updatedPrefs: UserPreferences = {
            userId,
            favoriteTags: [],
            moodMappings: {},
            ratingTendency: 'balanced',
            defaultPrivacy: 'private',
            ...data.userPreferences,
            ...prefs
        };

        data.userPreferences = updatedPrefs;
        await this.saveData(data, this.userBased ? userId : undefined);

        return updatedPrefs;
    }

    // Journal sharing operations
    async getJournalSharing(userId: string): Promise<JournalSharing | null> {
        const data = await this.getData(this.userBased ? userId : undefined);
        return data.journalSharing;
    }

    async updateJournalSharing(userId: string, sharing: Partial<JournalSharing>): Promise<JournalSharing> {
        const data = await this.getData(this.userBased ? userId : undefined);

        const updatedSharing: JournalSharing = {
            userId,
            sharedWith: [],
            sharedBy: [],
            createdAt: new Date().toISOString(),
            ...data.journalSharing,
            ...sharing,
            updatedAt: new Date().toISOString()
        };

        data.journalSharing = updatedSharing;
        await this.saveData(data, this.userBased ? userId : undefined);

        return updatedSharing;
    }

    async getSharedJournalMembers(userId: string): Promise<string[]> {
        const sharing = await this.getJournalSharing(userId);
        if (!sharing) return [];

        // Return all users this user shares with plus users who share with this user
        return [...new Set([...sharing.sharedWith, ...sharing.sharedBy])];
    }

    async getSharedJournalContext(userId: string): Promise<SharedJournalContext> {
        const sharing = await this.getJournalSharing(userId);

        if (!sharing) {
            return {
                journalMembers: [userId],
                canAddMovies: true,
                canAddReviews: true,
                canVoteAlways: true
            };
        }

        return {
            journalMembers: [userId, ...sharing.sharedWith, ...sharing.sharedBy],
            journalName: sharing.journalName,
            canAddMovies: true, // TODO: Implement permission logic
            canAddReviews: true,
            canVoteAlways: true
        };
    }
} 