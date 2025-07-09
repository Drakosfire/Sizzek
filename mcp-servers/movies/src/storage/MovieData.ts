import { Movie } from '../models/Movie.js';
import { Review } from '../models/Review.js';
import { AlwaysMovieVote } from '../models/AlwaysMovie.js';
import { UserPreferences, JournalSharing } from '../models/User.js';

/**
 * Unified data structure for movies MCP server
 * This structure is used with the mcp-data package for storage
 */
export interface MovieUserData {
    // Movies collection
    movies: Movie[];

    // Reviews collection
    reviews: Review[];

    // Always movie votes collection
    alwaysMovieVotes: AlwaysMovieVote[];

    // User preferences
    userPreferences: UserPreferences | null;

    // Journal sharing configuration
    journalSharing: JournalSharing | null;

    // Metadata
    version: string;
    lastUpdated: string;
}

/**
 * Default empty data structure
 */
export const defaultMovieData: MovieUserData = {
    movies: [],
    reviews: [],
    alwaysMovieVotes: [],
    userPreferences: null,
    journalSharing: null,
    version: '1.0.0',
    lastUpdated: new Date().toISOString()
}; 