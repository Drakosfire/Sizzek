import { MCPWebUI, UISchema } from 'mcp-web-ui';
import { MovieManager } from '../movie-manager.js';
import { MovieSuggestionEngine } from '../suggestion-engine.js';
import { createMovieSchema } from './movies-ui-config.js';

// Configuration interface
export interface MovieUIConfig {
    port?: number;
    endpoint?: string;
    sessionTimeout?: number;
    pollInterval?: number;
    enableLogging?: boolean;
    theme?: {
        primaryColor?: string;
        secondaryColor?: string;
        backgroundColor?: string;
        textColor?: string;
    };
}

/**
 * Framework-compatible data source function that returns an array for the list component
 */
export async function getMovieUIData(movieManager: MovieManager, userId: string) {
    const movies = await movieManager.getMoviesForUser(userId);

    // Return the movies array with stats included in each movie object
    // The framework will extract the data it needs for each component
    return movies.map(movie => ({
        id: movie.id,
        title: movie.title,
        year: movie.year,
        director: movie.director,
        tags: movie.tags?.join(', ') || '',
        rating: movie.userReview?.rating || null,
        review: movie.userReview?.review || '',
        mood: movie.userReview?.mood || '',
        rewatchable: movie.userReview?.rewatchable || false,
        isAlwaysMovie: movie.isAlwaysMovie || false,
        // Include stats data for the stats component to access
        total_movies: movies.length,
        this_month: movies.filter(m => isThisMonth(m.userReview?.watchedDate)).length,
        avg_rating: calculateAverageRating(movies),
        always_movies: movies.filter(m => m.isAlwaysMovie).length,
        suggestion_ready: movies.filter(m =>
            m.userReview && m.userReview.rating >= 7 && m.userReview.rewatchable
        ).length,
        journal_members: 1 // TODO: Get actual journal member count
    }));
}

/**
 * Framework-compatible update handler
 */
export async function handleMovieUpdate(
    action: string,
    data: any,
    userId: string,
    movieManager: MovieManager,
    suggestionEngine: MovieSuggestionEngine
) {
    try {
        switch (action) {
            case 'add-movie':
                // Parse tags from comma-separated string if provided
                const movieData = {
                    ...data,
                    tags: data.tags ? data.tags.split(',').map((tag: string) => tag.trim()) : []
                };
                const result = await movieManager.addMovie(movieData, userId);
                return result;

            case 'add-review':
                return await movieManager.addReview(data, userId);

            case 'suggest-movie':
                const suggestions = await suggestionEngine.getSuggestions(
                    userId,
                    data.mood || 'relaxing',
                    data.count || 5
                );
                return { success: true, suggestions };

            case 'vote-always':
                return await movieManager.voteAlwaysMovie(
                    data.movieId,
                    data.vote === 'yes',
                    data.reason,
                    userId
                );

            case 'share-journal':
                return await movieManager.shareJournalWithUser(
                    userId,
                    data.targetUserId,
                    data.journalName
                );

            case 'edit': // For inline editing of basic movie properties
                if (data.field && data.movieId) {
                    // Handle inline field edits for basic movie properties
                    const allowedFields = ['title', 'year', 'director', 'tags'];
                    if (allowedFields.includes(data.field)) {
                        return await movieManager.updateMovie(data.movieId, {
                            [data.field]: data.field === 'tags' ?
                                data.value.split(',').map((tag: string) => tag.trim()) :
                                data.value
                        }, userId);
                    }
                }
                break;

            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`
                };
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Create movie web UI using the actual mcp-web-ui framework
 */
export function createMovieWebUI(
    movieManager: MovieManager,
    suggestionEngine: MovieSuggestionEngine,
    config: MovieUIConfig = {}
): MCPWebUI {

    // Use the proper schema from config file
    const schema = createMovieSchema("🎬 Movie Journal");

    // Create the web UI with framework
    const webUI = new MCPWebUI({
        schema,
        dataSource: async (userId?: string) => {
            return await getMovieUIData(movieManager, userId || 'default');
        },
        onUpdate: async (action: string, data: any, userId: string) => {
            return await handleMovieUpdate(action, data, userId, movieManager, suggestionEngine);
        },
        sessionTimeout: config.sessionTimeout || 30 * 60 * 1000, // 30 minutes
        pollInterval: config.pollInterval || 2000,
        enableLogging: config.enableLogging ?? true,
        portRange: config.port ? [config.port, config.port] : [3000, 65535],
        cssPath: process.env.MCP_WEB_UI_CSS_PATH || './static'
    });

    return webUI;
}

// Helper functions
function isThisMonth(date?: string): boolean {
    if (!date) return false;
    const watchedDate = new Date(date);
    const now = new Date();
    return watchedDate.getMonth() === now.getMonth() &&
        watchedDate.getFullYear() === now.getFullYear();
}

function calculateAverageRating(movies: any[]): number {
    const ratedMovies = movies.filter(m => m.userReview?.rating);
    if (ratedMovies.length === 0) return 0;
    const sum = ratedMovies.reduce((acc, m) => acc + m.userReview.rating, 0);
    return Math.round((sum / ratedMovies.length) * 10) / 10;
}

