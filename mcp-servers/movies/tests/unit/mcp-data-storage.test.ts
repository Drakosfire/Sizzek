// tests/unit/mcp-data-storage.test.ts
// Unit tests for McpDataMovieStorage - mcp-data integration

import { TestRunner, assert, TestDataManager } from '../helpers/test-utilities.js';
import { McpDataMovieStorage } from '../../src/storage/McpDataMovieStorage.js';
import { MovieUserData, defaultMovieData } from '../../src/storage/MovieData.js';
import { Movie } from '../../src/models/Movie.js';
import { Review } from '../../src/models/Review.js';
import { AlwaysMovieVote } from '../../src/models/AlwaysMovie.js';
import { UserPreferences, JournalSharing } from '../../src/models/User.js';

const runner = new TestRunner('McpDataMovieStorage Unit Tests');
const testDataManager = new TestDataManager();

// Test data
const testMovie: Omit<Movie, 'id' | 'addedAt' | 'updatedAt'> = {
    title: 'M3GAN 2.0',
    year: 2025,
    director: 'Gerard Johnstone',
    tags: ['sci-fi', 'action', 'sequel', 'AI', 'robots', 'Blumhouse'],
    addedBy: 'test-user-1'
};

const testReview: Omit<Review, 'id' | 'createdAt' | 'updatedAt'> = {
    movieId: 'test-movie-id',
    userId: 'test-user-1',
    rating: 8,
    review: 'Great sequel! The AI horror elements were well executed.',
    watchedDate: '2025-01-01T00:00:00Z',
    mood: 'thrilling',
    rewatchable: true
};

const testVote: Omit<AlwaysMovieVote, 'id' | 'votedAt'> = {
    movieId: 'test-movie-id',
    userId: 'test-user-1',
    vote: true
};

const testPreferences: Partial<UserPreferences> = {
    favoriteTags: ['sci-fi', 'action', 'AI'],
    moodMappings: {
        'thrilling': {
            preferredTags: ['action', 'sci-fi', 'thriller'],
            minRating: 7,
            maxRecency: 365,
            allowRewatches: true
        },
        'relaxing': {
            preferredTags: ['comedy', 'romance'],
            minRating: 6,
            maxRecency: 180,
            allowRewatches: true
        }
    },
    ratingTendency: 'generous',
    defaultPrivacy: 'shared'
};

const testJournalSharing: Partial<JournalSharing> = {
    sharedWith: ['test-user-2', 'test-user-3'],
    sharedBy: ['test-user-4'],
    journalName: 'Sci-Fi Movie Club'
};

// Mock environment variables for testing
const originalEnv = process.env;

runner.test('Setup test environment', async () => {
    // Set test environment variables
    process.env.MCP_STORAGE_TYPE = 'json';
    process.env.MCP_USER_BASED = 'true';
    process.env.MCP_MOVIES_DATA_DIR = testDataManager.createTestDirectory('mcp-data-storage');
    process.env.MCP_DEBUG = 'true';

    assert.true(true, 'Test environment setup complete');
});

runner.test('McpDataMovieStorage - JSON storage initialization', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';

    const storage = new McpDataMovieStorage();
    assert.true(storage instanceof McpDataMovieStorage, 'Storage should be instance of McpDataMovieStorage');

    // Test that it can retrieve empty data
    const movies = await storage.getMovies();
    assert.true(Array.isArray(movies), 'Should return array of movies');
    assert.equal(movies.length, 0, 'Should start with empty movies array');
});

runner.test('McpDataMovieStorage - MongoDB storage initialization', async () => {
    // Test MongoDB initialization (will use mock MongoDB if no connection)
    process.env.MCP_STORAGE_TYPE = 'mongodb';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    process.env.MONGODB_DATABASE = 'movies_test';
    process.env.MONGODB_COLLECTION = 'test_movies';

    const storage = new McpDataMovieStorage();
    assert.true(storage instanceof McpDataMovieStorage, 'Storage should be instance of McpDataMovieStorage');

    // Test basic functionality (might fail if no MongoDB, but should not crash)
    try {
        const movies = await storage.getMovies();
        assert.true(Array.isArray(movies), 'Should return array of movies');
    } catch (error) {
        // MongoDB connection might fail in test environment, that's OK
        console.warn('MongoDB test skipped (no connection):', (error as Error).message);
    }
});

runner.test('Movie operations - Add movie', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    const addedMovie = await storage.addMovie(testMovie);

    assert.hasProperty(addedMovie, 'id', 'Added movie should have ID');
    assert.hasProperty(addedMovie, 'addedAt', 'Added movie should have addedAt timestamp');
    assert.hasProperty(addedMovie, 'updatedAt', 'Added movie should have updatedAt timestamp');
    assert.equal(addedMovie.title, testMovie.title, 'Movie title should match');
    assert.equal(addedMovie.year, testMovie.year, 'Movie year should match');
    assert.equal(addedMovie.director, testMovie.director, 'Movie director should match');
    assert.deepEqual(addedMovie.tags, testMovie.tags, 'Movie tags should match');
    assert.equal(addedMovie.addedBy, testMovie.addedBy, 'Movie addedBy should match');
});

runner.test('Movie operations - Get movies with filters', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    // Add test movie first
    const addedMovie = await storage.addMovie(testMovie);

    // Test get all movies
    const allMovies = await storage.getMovies();
    assert.true(allMovies.length >= 1, 'Should have at least one movie');

    // Test filter by year
    const moviesByYear = await storage.getMovies({ year: 2025 });
    assert.true(moviesByYear.length >= 1, 'Should find movies by year');
    assert.true(moviesByYear.every(m => m.year === 2025), 'All movies should match year filter');

    // Test filter by director
    const moviesByDirector = await storage.getMovies({ director: 'Gerard' });
    assert.true(moviesByDirector.length >= 1, 'Should find movies by director');
    assert.true(moviesByDirector.every(m => m.director.includes('Gerard')), 'All movies should match director filter');

    // Test filter by tags
    const moviesByTags = await storage.getMovies({ tags: ['sci-fi'] });
    assert.true(moviesByTags.length >= 1, 'Should find movies by tags');
    assert.true(moviesByTags.every(m => m.tags?.includes('sci-fi')), 'All movies should have sci-fi tag');

    // Test filter by addedBy
    const moviesByUser = await storage.getMovies({ addedBy: 'test-user-1' });
    assert.true(moviesByUser.length >= 1, 'Should find movies by user');
    assert.true(moviesByUser.every(m => m.addedBy === 'test-user-1'), 'All movies should match user filter');
});

runner.test('Movie operations - Get movie by ID', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    // Add test movie first
    const addedMovie = await storage.addMovie(testMovie);

    // Get movie by ID
    const retrievedMovie = await storage.getMovieById(addedMovie.id);
    assert.true(retrievedMovie !== null, 'Should find movie by ID');
    assert.equal(retrievedMovie!.id, addedMovie.id, 'Retrieved movie ID should match');
    assert.equal(retrievedMovie!.title, addedMovie.title, 'Retrieved movie title should match');

    // Test non-existent ID
    const nonExistentMovie = await storage.getMovieById('non-existent-id');
    assert.true(nonExistentMovie === null, 'Should return null for non-existent movie');
});

runner.test('Movie operations - Update movie', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    // Add test movie first
    const addedMovie = await storage.addMovie(testMovie);

    // Update movie
    const updates = {
        title: 'M3GAN 2.0: Enhanced Edition',
        tags: ['sci-fi', 'action', 'sequel', 'AI', 'robots', 'Blumhouse', 'enhanced']
    };

    // Add a small delay to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    const updatedMovie = await storage.updateMovie(addedMovie.id, updates);

    assert.equal(updatedMovie.title, updates.title, 'Movie title should be updated');
    assert.deepEqual(updatedMovie.tags, updates.tags, 'Movie tags should be updated');
    assert.notEqual(updatedMovie.updatedAt, addedMovie.updatedAt, 'UpdatedAt timestamp should change');

    // Verify the update persisted
    const retrievedMovie = await storage.getMovieById(addedMovie.id);
    assert.equal(retrievedMovie!.title, updates.title, 'Updated title should persist');
});

runner.test('Movie operations - Delete movie', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    // Add test movie first
    const addedMovie = await storage.addMovie(testMovie);

    // Delete movie
    const deleted = await storage.deleteMovie(addedMovie.id);
    assert.true(deleted, 'Delete operation should return true');

    // Verify movie is deleted
    const retrievedMovie = await storage.getMovieById(addedMovie.id);
    assert.true(retrievedMovie === null, 'Deleted movie should not be found');

    // Test deleting non-existent movie
    const deletedAgain = await storage.deleteMovie(addedMovie.id);
    assert.false(deletedAgain, 'Deleting non-existent movie should return false');
});

runner.test('Review operations - Add and get reviews', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    // Add test movie first
    const addedMovie = await storage.addMovie(testMovie);

    // Add review
    const reviewData = { ...testReview, movieId: addedMovie.id };
    const addedReview = await storage.addReview(reviewData);

    assert.hasProperty(addedReview, 'id', 'Added review should have ID');
    assert.hasProperty(addedReview, 'createdAt', 'Added review should have createdAt timestamp');
    assert.equal(addedReview.movieId, addedMovie.id, 'Review movieId should match');
    assert.equal(addedReview.rating, reviewData.rating, 'Review rating should match');

    // Get reviews for movie
    const movieReviews = await storage.getReviewsForMovie(addedMovie.id);
    assert.true(movieReviews.length >= 1, 'Should have at least one review for movie');
    assert.equal(movieReviews[0].id, addedReview.id, 'Review ID should match');

    // Get reviews for user
    const userReviews = await storage.getReviewsForUser('test-user-1');
    assert.true(userReviews.length >= 1, 'Should have at least one review for user');
    assert.equal(userReviews[0].userId, 'test-user-1', 'Review userId should match');
});

runner.test('Review operations - Update and delete reviews', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    // Add test movie and review first
    const addedMovie = await storage.addMovie(testMovie);
    const reviewData = { ...testReview, movieId: addedMovie.id };
    const addedReview = await storage.addReview(reviewData);

    // Update review
    const updates = { rating: 9, review: 'Even better on second viewing!' };
    // Add a small delay to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    const updatedReview = await storage.updateReview(addedReview.id, updates);

    assert.equal(updatedReview.rating, 9, 'Review rating should be updated');
    assert.equal(updatedReview.review, updates.review, 'Review text should be updated');
    assert.notEqual(updatedReview.updatedAt, addedReview.updatedAt, 'UpdatedAt timestamp should change');

    // Delete review
    const deleted = await storage.deleteReview(addedReview.id);
    assert.true(deleted, 'Delete operation should return true');

    // Verify review is deleted
    const movieReviews = await storage.getReviewsForMovie(addedMovie.id);
    assert.equal(movieReviews.length, 0, 'Movie should have no reviews after deletion');
});

runner.test('AlwaysMovie operations - Add and get votes', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    // Add test movie first
    const addedMovie = await storage.addMovie(testMovie);

    // Add vote
    const voteData = { ...testVote, movieId: addedMovie.id };
    const addedVote = await storage.addAlwaysMovieVote(voteData);

    assert.hasProperty(addedVote, 'id', 'Added vote should have ID');
    assert.hasProperty(addedVote, 'votedAt', 'Added vote should have votedAt timestamp');
    assert.equal(addedVote.movieId, addedMovie.id, 'Vote movieId should match');
    assert.equal(addedVote.vote, voteData.vote, 'Vote value should match');

    // Get votes for movie
    const movieVotes = await storage.getAlwaysMovieVotes(addedMovie.id);
    assert.true(movieVotes.length >= 1, 'Should have at least one vote for movie');
    assert.equal(movieVotes[0].id, addedVote.id, 'Vote ID should match');
});

runner.test('User preferences operations', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    const userId = 'test-user-1';

    // Initially should have no preferences
    const initialPrefs = await storage.getUserPreferences(userId);
    assert.true(initialPrefs === null, 'Should start with no user preferences');

    // Update preferences
    const updatedPrefs = await storage.updateUserPreferences(userId, testPreferences);

    assert.equal(updatedPrefs.userId, userId, 'Preferences userId should match');
    assert.deepEqual(updatedPrefs.favoriteTags, testPreferences.favoriteTags, 'Favorite tags should match');
    assert.deepEqual(updatedPrefs.moodMappings, testPreferences.moodMappings, 'Mood mappings should match');
    assert.equal(updatedPrefs.ratingTendency, testPreferences.ratingTendency, 'Rating tendency should match');
    assert.equal(updatedPrefs.defaultPrivacy, testPreferences.defaultPrivacy, 'Default privacy should match');

    // Get preferences
    const retrievedPrefs = await storage.getUserPreferences(userId);
    assert.true(retrievedPrefs !== null, 'Should retrieve user preferences');
    assert.equal(retrievedPrefs!.userId, userId, 'Retrieved preferences userId should match');
});

runner.test('Journal sharing operations', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    const userId = 'test-user-1';

    // Initially should have no journal sharing
    const initialSharing = await storage.getJournalSharing(userId);
    assert.true(initialSharing === null, 'Should start with no journal sharing');

    // Update journal sharing
    const updatedSharing = await storage.updateJournalSharing(userId, testJournalSharing);

    assert.equal(updatedSharing.userId, userId, 'Sharing userId should match');
    assert.deepEqual(updatedSharing.sharedWith, testJournalSharing.sharedWith, 'SharedWith should match');
    assert.deepEqual(updatedSharing.sharedBy, testJournalSharing.sharedBy, 'SharedBy should match');
    assert.equal(updatedSharing.journalName, testJournalSharing.journalName, 'Journal name should match');

    // Get shared journal members
    const members = await storage.getSharedJournalMembers(userId);
    assert.true(members.length > 0, 'Should have shared journal members');
    assert.true(members.includes('test-user-2'), 'Should include sharedWith users');
    assert.true(members.includes('test-user-4'), 'Should include sharedBy users');

    // Get shared journal context
    const context = await storage.getSharedJournalContext(userId);
    assert.true(context.journalMembers.includes(userId), 'Context should include the user');
    assert.equal(context.journalName, testJournalSharing.journalName, 'Context journal name should match');
    assert.true(context.canAddMovies, 'Should allow adding movies');
    assert.true(context.canAddReviews, 'Should allow adding reviews');
    assert.true(context.canVoteAlways, 'Should allow always votes');
});

runner.test('Data integration - Movie deletion cascades to reviews and votes', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    // Add test movie
    const addedMovie = await storage.addMovie(testMovie);

    // Add review and vote
    const reviewData = { ...testReview, movieId: addedMovie.id };
    const voteData = { ...testVote, movieId: addedMovie.id };

    await storage.addReview(reviewData);
    await storage.addAlwaysMovieVote(voteData);

    // Verify they exist
    const initialReviews = await storage.getReviewsForMovie(addedMovie.id);
    const initialVotes = await storage.getAlwaysMovieVotes(addedMovie.id);
    assert.equal(initialReviews.length, 1, 'Should have one review');
    assert.equal(initialVotes.length, 1, 'Should have one vote');

    // Delete movie
    await storage.deleteMovie(addedMovie.id);

    // Verify reviews and votes are also deleted
    const finalReviews = await storage.getReviewsForMovie(addedMovie.id);
    const finalVotes = await storage.getAlwaysMovieVotes(addedMovie.id);
    assert.equal(finalReviews.length, 0, 'Reviews should be deleted with movie');
    assert.equal(finalVotes.length, 0, 'Votes should be deleted with movie');
});

runner.test('Error handling - Invalid operations', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';
    const storage = new McpDataMovieStorage();

    // Test updating non-existent movie
    await assert.throwsAsync(async () => {
        await storage.updateMovie('non-existent-id', { title: 'Updated' });
    }, 'Should throw error when updating non-existent movie');

    // Test updating non-existent review
    await assert.throwsAsync(async () => {
        await storage.updateReview('non-existent-id', { rating: 5 });
    }, 'Should throw error when updating non-existent review');
});

runner.test('Cleanup test environment', async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up test data
    await testDataManager.cleanup();

    assert.true(true, 'Test environment cleaned up');
});

// Export the test runner for the main test suite
export default runner;

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runner.run().then(results => {
        const failed = results.filter(r => !r.passed).length;
        process.exit(failed > 0 ? 1 : 0);
    });
} 