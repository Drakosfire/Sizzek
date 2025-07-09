// src/tools/movie-tools.ts

import { MovieManager } from '../movie-manager.js';
import { MovieSuggestionEngine } from '../suggestion-engine.js';

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: any;
}

export function createMovieTools(manager: MovieManager, suggestionEngine: MovieSuggestionEngine): MCPTool[] {
    return [
        {
            name: 'add_movie',
            description: 'Add a new movie to the shared collection',
            inputSchema: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Movie title' },
                    year: { type: 'integer', description: 'Release year' },
                    director: { type: 'string', description: 'Director name' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Tags (e.g., sci-fi, action, sequel, AI, robots, etc.)' }
                },
                required: ['title', 'year', 'director']
            }
        },
        {
            name: 'get_movies',
            description: 'Get a small, recent set of movies with optional basic filters (year, director, tags, addedBy)',
            inputSchema: {
                type: 'object',
                properties: {
                    year: { type: 'integer', description: 'Filter by year' },
                    director: { type: 'string', description: 'Filter by director' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
                    addedBy: { type: 'string', description: 'Filter by user who added' }
                }
            }
        },
        {
            name: 'add_review',
            description: 'Add a personal review for a movie',
            inputSchema: {
                type: 'object',
                properties: {
                    movieId: { type: 'string', description: 'Movie ID' },
                    rating: { type: 'integer', minimum: 1, maximum: 10, description: 'Rating 1-10' },
                    review: { type: 'string', description: 'Written review' },
                    watchedDate: { type: 'string', description: 'Date watched (ISO string)' },
                    mood: { type: 'string', enum: ['relaxing', 'exciting', 'thoughtful', 'nostalgic'] },
                    rewatchable: { type: 'boolean', description: 'Would you rewatch this?' }
                },
                required: ['movieId', 'rating', 'review', 'watchedDate', 'rewatchable']
            }
        },
        {
            name: 'suggest_movies',
            description: 'Get movie suggestions based on mood',
            inputSchema: {
                type: 'object',
                properties: {
                    mood: {
                        type: 'string',
                        enum: ['relaxing', 'exciting', 'thoughtful', 'nostalgic'],
                        description: 'Current mood or vibe'
                    },
                    count: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
                },
                required: ['mood']
            }
        },
        {
            name: 'vote_always_movie',
            description: 'Vote on whether a movie should be marked as "Always Movie"',
            inputSchema: {
                type: 'object',
                properties: {
                    movieId: { type: 'string', description: 'Movie ID' },
                    vote: { type: 'boolean', description: 'True for yes, false for no' },
                    reason: { type: 'string', description: 'Optional reason for vote' }
                },
                required: ['movieId', 'vote']
            }
        },
        {
            name: 'get_always_movies',
            description: 'Get all movies marked as "Always Movies"',
            inputSchema: {
                type: 'object',
                properties: {}
            }
        },
        {
            name: 'share_journal_with_user',
            description: 'Share your movie journal with another user',
            inputSchema: {
                type: 'object',
                properties: {
                    targetUserId: { type: 'string', description: 'User ID to share journal with' },
                    journalName: { type: 'string', description: 'Optional name for the shared journal' }
                },
                required: ['targetUserId']
            }
        },
        {
            name: 'get_shared_journal_info',
            description: 'Get information about your shared journal',
            inputSchema: {
                type: 'object',
                properties: {}
            }
        },
        {
            name: 'remove_journal_sharing',
            description: 'Stop sharing your journal with a specific user',
            inputSchema: {
                type: 'object',
                properties: {
                    targetUserId: { type: 'string', description: 'User ID to stop sharing with' }
                },
                required: ['targetUserId']
            }
        },
        {
            name: 'update_movie',
            description: 'Update movie details (title, year, director, tags)',
            inputSchema: {
                type: 'object',
                properties: {
                    movieId: { type: 'string', description: 'Movie ID to update' },
                    title: { type: 'string', description: 'Updated movie title' },
                    year: { type: 'integer', description: 'Updated release year' },
                    director: { type: 'string', description: 'Updated director name' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Updated tags' }
                },
                required: ['movieId']
            }
        },
        {
            name: 'delete_movie',
            description: 'Delete a movie you added',
            inputSchema: {
                type: 'object',
                properties: {
                    movieId: { type: 'string', description: 'Movie ID to delete' }
                },
                required: ['movieId']
            }
        },
        {
            name: 'search_movies',
            description: 'Search for movies by title (required), with optional filters (year, director, tags, addedBy) and limit',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query for movie title' },
                    year: { type: 'integer', description: 'Filter by year' },
                    director: { type: 'string', description: 'Filter by director' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
                    addedBy: { type: 'string', description: 'Filter by user who added' },
                    limit: { type: 'integer', description: 'Maximum number of results to return (max 20)' }
                },
                required: ['query']
            }
        }
    ];
}

export function createToolHandler(manager: MovieManager, suggestionEngine: MovieSuggestionEngine, userId: string) {
    return async (toolName: string, params: any) => {
        try {
            switch (toolName) {
                case 'add_movie':
                    return await manager.addMovie(params, userId);

                case 'get_movies': {
                    // Always limit to 10 unless otherwise specified
                    const filters = { ...params, limit: 10 };
                    return await manager.getMoviesForUser(userId, filters);
                }

                case 'add_review':
                    return await manager.addReview(params, userId);

                case 'suggest_movies':
                    return await suggestionEngine.getSuggestions(
                        userId, params.mood, params.count
                    );

                case 'vote_always_movie':
                    return await manager.voteAlwaysMovie(
                        params.movieId, params.vote, userId, params.reason
                    );

                case 'get_always_movies':
                    return await manager.getAlwaysMovies(userId);

                case 'share_journal_with_user':
                    return await manager.shareJournalWithUser(
                        userId, params.targetUserId, params.journalName
                    );

                case 'get_shared_journal_info':
                    return await manager.getSharedJournalInfo(userId);

                case 'remove_journal_sharing':
                    return await manager.removeJournalSharing(userId, params.targetUserId);

                case 'update_movie':
                    return await manager.updateMovie(params.movieId, params, userId);

                case 'delete_movie':
                    return await manager.deleteMovie(params.movieId, userId);

                case 'search_movies': {
                    // Limit to 20 max
                    const filters = { ...params, limit: Math.min(params.limit || 10, 20) };
                    return await manager.getMoviesForUser(userId, filters);
                }

                default:
                    return {
                        success: false,
                        message: `Unknown tool: ${toolName}`
                    };
            }
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    };
} 