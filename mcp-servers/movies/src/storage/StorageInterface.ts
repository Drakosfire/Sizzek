// src/storage/StorageInterface.ts

import { Movie, MovieFilters } from '../models/Movie.js';
import { Review } from '../models/Review.js';
import { AlwaysMovieVote } from '../models/AlwaysMovie.js';
import { UserPreferences, JournalSharing, SharedJournalContext } from '../models/User.js';

export interface MovieStorageInterface {
    // Movie operations
    getMovies(filters?: MovieFilters): Promise<Movie[]>;
    getMovieById(id: string): Promise<Movie | null>;
    addMovie(movie: Omit<Movie, 'id' | 'addedAt' | 'updatedAt'>): Promise<Movie>;
    updateMovie(id: string, updates: Partial<Movie>): Promise<Movie>;
    deleteMovie(id: string): Promise<boolean>;

    // Review operations  
    getReviewsForMovie(movieId: string): Promise<Review[]>;
    getReviewsForUser(userId: string): Promise<Review[]>;
    addReview(review: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>): Promise<Review>;
    updateReview(id: string, updates: Partial<Review>): Promise<Review>;
    deleteReview(id: string): Promise<boolean>;

    // Always Movie operations
    getAlwaysMovieVotes(movieId: string): Promise<AlwaysMovieVote[]>;
    addAlwaysMovieVote(vote: Omit<AlwaysMovieVote, 'id' | 'votedAt'>): Promise<AlwaysMovieVote>;

    // User operations
    getUserPreferences(userId: string): Promise<UserPreferences | null>;
    updateUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences>;

    // Journal sharing operations
    getJournalSharing(userId: string): Promise<JournalSharing | null>;
    updateJournalSharing(userId: string, sharing: Partial<JournalSharing>): Promise<JournalSharing>;
    getSharedJournalMembers(userId: string): Promise<string[]>; // Returns all users who share journals with this user
    getSharedJournalContext(userId: string): Promise<SharedJournalContext>;
} 