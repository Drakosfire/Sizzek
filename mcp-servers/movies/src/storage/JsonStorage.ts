import { promises as fs } from 'fs';
import path from 'path';
import { MovieStorageInterface } from './StorageInterface.js';
import { Movie, MovieFilters } from '../models/Movie.js';
import { Review } from '../models/Review.js';
import { AlwaysMovieVote } from '../models/AlwaysMovie.js';
import { UserPreferences, JournalSharing, SharedJournalContext } from '../models/User.js';

export class JsonMovieStorage implements MovieStorageInterface {
    private moviesFile: string;
    private reviewsFile: string;
    private usersFile: string;
    private votesFile: string;
    private journalSharingFile: string;

    constructor(baseDir: string = './data') {
        this.moviesFile = path.join(baseDir, 'movies.json');
        this.reviewsFile = path.join(baseDir, 'reviews.json');
        this.usersFile = path.join(baseDir, 'users.json');
        this.votesFile = path.join(baseDir, 'always-movie-votes.json');
        this.journalSharingFile = path.join(baseDir, 'journal-sharing.json');
    }

    // Movie operations
    async getMovies(filters?: MovieFilters): Promise<Movie[]> {
        const movies = await this.readJsonFile<Movie[]>(this.moviesFile, []);

        if (!filters) return movies;

        return movies.filter(movie => {
            if (filters.year && movie.year !== filters.year) return false;
            if (filters.director && !movie.director.toLowerCase().includes(filters.director.toLowerCase())) return false;
            if (filters.tags && !movie.tags?.some((t: string) => filters.tags!.includes(t))) return false;
            if (filters.addedBy && movie.addedBy !== filters.addedBy) return false;
            return true;
        });
    }

    async getMovieById(id: string): Promise<Movie | null> {
        const movies = await this.getMovies();
        return movies.find(movie => movie.id === id) || null;
    }

    async addMovie(movieData: Omit<Movie, 'id' | 'addedAt' | 'updatedAt'>): Promise<Movie> {
        const movies = await this.getMovies();
        const now = new Date().toISOString();

        const movie: Movie = {
            ...movieData,
            id: this.generateId('movie'),
            addedAt: now,
            updatedAt: now
        };

        movies.push(movie);
        await this.writeJsonFile(this.moviesFile, movies);
        return movie;
    }

    async updateMovie(id: string, updates: Partial<Movie>): Promise<Movie> {
        const movies = await this.getMovies();
        const movieIndex = movies.findIndex(movie => movie.id === id);

        if (movieIndex === -1) {
            throw new Error(`Movie with id ${id} not found`);
        }

        const updatedMovie = {
            ...movies[movieIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        movies[movieIndex] = updatedMovie;
        await this.writeJsonFile(this.moviesFile, movies);
        return updatedMovie;
    }

    async deleteMovie(id: string): Promise<boolean> {
        const movies = await this.getMovies();
        const initialLength = movies.length;
        const filteredMovies = movies.filter(movie => movie.id !== id);

        if (filteredMovies.length === initialLength) {
            return false; // Movie not found
        }

        await this.writeJsonFile(this.moviesFile, filteredMovies);
        return true;
    }

    // Review operations
    async getReviewsForMovie(movieId: string): Promise<Review[]> {
        const reviews = await this.readJsonFile<Review[]>(this.reviewsFile, []);
        return reviews.filter(review => review.movieId === movieId);
    }

    async getReviewsForUser(userId: string): Promise<Review[]> {
        const reviews = await this.readJsonFile<Review[]>(this.reviewsFile, []);
        return reviews.filter(review => review.userId === userId);
    }

    async addReview(reviewData: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>): Promise<Review> {
        const reviews = await this.readJsonFile<Review[]>(this.reviewsFile, []);
        const now = new Date().toISOString();

        const review: Review = {
            ...reviewData,
            id: this.generateId('review'),
            createdAt: now,
            updatedAt: now
        };

        reviews.push(review);
        await this.writeJsonFile(this.reviewsFile, reviews);
        return review;
    }

    async updateReview(id: string, updates: Partial<Review>): Promise<Review> {
        const reviews = await this.readJsonFile<Review[]>(this.reviewsFile, []);
        const reviewIndex = reviews.findIndex(review => review.id === id);

        if (reviewIndex === -1) {
            throw new Error(`Review with id ${id} not found`);
        }

        const updatedReview = {
            ...reviews[reviewIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        reviews[reviewIndex] = updatedReview;
        await this.writeJsonFile(this.reviewsFile, reviews);
        return updatedReview;
    }

    async deleteReview(id: string): Promise<boolean> {
        const reviews = await this.readJsonFile<Review[]>(this.reviewsFile, []);
        const initialLength = reviews.length;
        const filteredReviews = reviews.filter(review => review.id !== id);

        if (filteredReviews.length === initialLength) {
            return false;
        }

        await this.writeJsonFile(this.reviewsFile, filteredReviews);
        return true;
    }

    // Always Movie operations
    async getAlwaysMovieVotes(movieId: string): Promise<AlwaysMovieVote[]> {
        const votes = await this.readJsonFile<AlwaysMovieVote[]>(this.votesFile, []);
        return votes.filter(vote => vote.movieId === movieId);
    }

    async addAlwaysMovieVote(voteData: Omit<AlwaysMovieVote, 'id' | 'votedAt'>): Promise<AlwaysMovieVote> {
        const votes = await this.readJsonFile<AlwaysMovieVote[]>(this.votesFile, []);

        // Check if user has already voted for this movie
        const existingVoteIndex = votes.findIndex(vote =>
            vote.movieId === voteData.movieId && vote.userId === voteData.userId
        );

        const now = new Date().toISOString();
        const vote: AlwaysMovieVote = {
            ...voteData,
            id: this.generateId('vote'),
            votedAt: now
        };

        if (existingVoteIndex >= 0) {
            // Update existing vote
            votes[existingVoteIndex] = vote;
        } else {
            // Add new vote
            votes.push(vote);
        }

        await this.writeJsonFile(this.votesFile, votes);
        return vote;
    }

    // User operations
    async getUserPreferences(userId: string): Promise<UserPreferences | null> {
        const users = await this.readJsonFile<UserPreferences[]>(this.usersFile, []);
        return users.find(user => user.userId === userId) || null;
    }

    async updateUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences> {
        const users = await this.readJsonFile<UserPreferences[]>(this.usersFile, []);
        const userIndex = users.findIndex(user => user.userId === userId);

        const updatedPrefs: UserPreferences = {
            userId,
            favoriteTags: [],
            moodMappings: {},
            ratingTendency: 'balanced',
            defaultPrivacy: 'private',
            ...prefs
        };

        if (userIndex >= 0) {
            users[userIndex] = { ...users[userIndex], ...updatedPrefs };
        } else {
            users.push(updatedPrefs);
        }

        await this.writeJsonFile(this.usersFile, users);
        return updatedPrefs;
    }

    // Journal sharing operations
    async getJournalSharing(userId: string): Promise<JournalSharing | null> {
        const journalSharing = await this.readJsonFile<JournalSharing[]>(this.journalSharingFile, []);
        return journalSharing.find(sharing => sharing.userId === userId) || null;
    }

    async updateJournalSharing(userId: string, sharing: Partial<JournalSharing>): Promise<JournalSharing> {
        const journalSharing = await this.readJsonFile<JournalSharing[]>(this.journalSharingFile, []);
        const sharingIndex = journalSharing.findIndex(s => s.userId === userId);

        const now = new Date().toISOString();
        const updatedSharing: JournalSharing = {
            userId,
            sharedWith: [],
            sharedBy: [],
            createdAt: now,
            updatedAt: now,
            ...sharing
        };

        if (sharingIndex >= 0) {
            journalSharing[sharingIndex] = { ...journalSharing[sharingIndex], ...updatedSharing, updatedAt: now };
        } else {
            journalSharing.push(updatedSharing);
        }

        await this.writeJsonFile(this.journalSharingFile, journalSharing);
        return updatedSharing;
    }

    async getSharedJournalMembers(userId: string): Promise<string[]> {
        const journalSharing = await this.getJournalSharing(userId);
        if (!journalSharing) return [userId];

        const allMembers = new Set([userId]);

        // Add users this user shares with
        journalSharing.sharedWith.forEach((uid: string) => allMembers.add(uid));

        // Add users who share with this user
        journalSharing.sharedBy.forEach((uid: string) => allMembers.add(uid));

        return Array.from(allMembers);
    }

    async getSharedJournalContext(userId: string): Promise<SharedJournalContext> {
        const journalMembers = await this.getSharedJournalMembers(userId);
        const journalSharing = await this.getJournalSharing(userId);

        return {
            journalMembers,
            journalName: journalSharing?.journalName,
            canAddMovies: true,
            canAddReviews: true,
            canVoteAlways: true
        };
    }

    // Helper methods
    private async readJsonFile<T>(filename: string, defaultValue: T): Promise<T> {
        try {
            const data = await fs.readFile(filename, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return defaultValue;
        }
    }

    private async writeJsonFile<T>(filename: string, data: T): Promise<void> {
        await fs.mkdir(path.dirname(filename), { recursive: true });
        await fs.writeFile(filename, JSON.stringify(data, null, 2));
    }

    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
} 