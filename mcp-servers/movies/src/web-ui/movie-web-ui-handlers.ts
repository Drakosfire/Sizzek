// Movie Web UI Handlers
// This file provides custom handlers for the movie web UI

import { MovieManager } from '../movie-manager.js';
import { MovieSuggestionEngine } from '../suggestion-engine.js';

export class MovieWebUIHandlers {
    constructor(
        private movieManager: MovieManager,
        private suggestionEngine: MovieSuggestionEngine
    ) { }

    async handleAddMovie(data: any, userId: string) {
        return await this.movieManager.addMovie(data, userId);
    }

    async handleAddReview(data: any, userId: string) {
        return await this.movieManager.addReview(data, userId);
    }

    async handleVoteAlways(data: any, userId: string) {
        return await this.movieManager.voteAlwaysMovie(
            data.movieId,
            data.vote,
            data.reason,
            userId
        );
    }

    async handleSuggestMovie(data: any, userId: string) {
        const suggestions = await this.suggestionEngine.getSuggestions(
            userId,
            data.mood,
            data.count || 5
        );
        return { success: true, suggestions };
    }

    async handleShareJournal(data: any, userId: string) {
        // For now, return a mock response
        return {
            success: true,
            message: "Journal sharing feature coming soon"
        };
    }

    async handleGetMovieData(userId: string) {
        const movies = await this.movieManager.getMoviesForUser(userId);
        // For now, return basic stats
        return {
            movies,
            stats: {
                total_movies: movies.length,
                this_month: 0,
                avg_rating: 0,
                always_movies: 0,
                suggestion_ready: 0
            }
        };
    }
} 