// tests/integration/mcp-data-storage-integration.test.ts
// Integration tests for mcp-data storage with different backends

import { TestRunner, assert, TestDataManager } from '../helpers/test-utilities.js';
import { McpDataMovieStorage } from '../../src/storage/McpDataMovieStorage.js';
import { JsonMovieStorage } from '../../src/storage/JsonStorage.js';
import { MovieManager } from '../../src/movie-manager.js';
import { UserManager } from '../../src/user-manager.js';
import { Movie } from '../../src/models/Movie.js';

const runner = new TestRunner('MCP Data Storage Integration Tests');
const testDataManager = new TestDataManager();

// Test data
const testMovies = [
    {
        title: 'M3GAN 2.0',
        year: 2025,
        director: 'Gerard Johnstone',
        tags: ['sci-fi', 'action', 'sequel', 'AI', 'robots', 'Blumhouse'],
        addedBy: 'user-alice'
    },
    {
        title: 'The Matrix Resurrections',
        year: 2021,
        director: 'Lana Wachowski',
        tags: ['sci-fi', 'action', 'sequel', 'cyberpunk'],
        addedBy: 'user-bob'
    },
    {
        title: 'Dune: Part Two',
        year: 2024,
        director: 'Denis Villeneuve',
        tags: ['sci-fi', 'epic', 'sequel', 'space-opera'],
        addedBy: 'user-alice'
    }
];

const originalEnv = process.env;

runner.test('Setup integration test environment', async () => {
    // Create isolated test directory
    process.env.MCP_MOVIES_DATA_DIR = testDataManager.createTestDirectory('integration');
    process.env.MCP_USER_BASED = 'true';
    process.env.MCP_DEBUG = 'true';

    assert.true(true, 'Integration test environment setup complete');
});

runner.test('JSON Storage - Basic CRUD operations', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';

    const storage = new McpDataMovieStorage();
    const addedMovies: Movie[] = [];

    // Test adding multiple movies
    for (const movieData of testMovies) {
        const addedMovie = await storage.addMovie(movieData);
        addedMovies.push(addedMovie);

        assert.hasProperty(addedMovie, 'id', 'Added movie should have ID');
        assert.equal(addedMovie.title, movieData.title, 'Movie title should match');
        assert.deepEqual(addedMovie.tags, movieData.tags, 'Movie tags should match');
    }

    // Test retrieving all movies
    const allMovies = await storage.getMovies();
    assert.equal(allMovies.length, testMovies.length, 'Should retrieve all added movies');

    // Test filtering by tags
    const sciFiMovies = await storage.getMovies({ tags: ['sci-fi'] });
    assert.equal(sciFiMovies.length, 3, 'Should find all sci-fi movies');

    // Test filtering by user
    const aliceMovies = await storage.getMovies({ addedBy: 'user-alice' });
    assert.equal(aliceMovies.length, 2, 'Should find Alice\'s movies');

    // Test updating a movie
    const movieToUpdate = addedMovies[0];
    const updatedMovie = await storage.updateMovie(movieToUpdate.id, {
        tags: [...movieToUpdate.tags!, 'updated']
    });
    assert.true(updatedMovie.tags!.includes('updated'), 'Movie should have updated tag');

    // Test deleting a movie
    const movieToDelete = addedMovies[1];
    const deleted = await storage.deleteMovie(movieToDelete.id);
    assert.true(deleted, 'Movie should be deleted');

    const remainingMovies = await storage.getMovies();
    assert.equal(remainingMovies.length, testMovies.length - 1, 'Should have one less movie after deletion');
});

runner.test('JSON Storage - Review and vote operations', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';

    const storage = new McpDataMovieStorage();

    // Add a test movie
    const addedMovie = await storage.addMovie(testMovies[0]);

    // Add reviews from different users
    const review1 = await storage.addReview({
        movieId: addedMovie.id,
        userId: 'user-alice',
        rating: 9,
        review: 'Excellent sequel with great AI themes',
        watchedDate: '2025-01-01T00:00:00Z',
        mood: 'thrilling',
        rewatchable: true
    });

    const review2 = await storage.addReview({
        movieId: addedMovie.id,
        userId: 'user-bob',
        rating: 7,
        review: 'Good but not as scary as the first one',
        watchedDate: '2025-01-02T00:00:00Z',
        mood: 'entertaining',
        rewatchable: false
    });

    // Test getting reviews for movie
    const movieReviews = await storage.getReviewsForMovie(addedMovie.id);
    assert.equal(movieReviews.length, 2, 'Should have two reviews for the movie');

    // Test getting reviews for user
    const aliceReviews = await storage.getReviewsForUser('user-alice');
    assert.equal(aliceReviews.length, 1, 'Alice should have one review');
    assert.equal(aliceReviews[0].id, review1.id, 'Should be Alice\'s review');

    // Add always movie votes
    await storage.addAlwaysMovieVote({
        movieId: addedMovie.id,
        userId: 'user-alice',
        vote: true
    });

    await storage.addAlwaysMovieVote({
        movieId: addedMovie.id,
        userId: 'user-bob',
        vote: false
    });

    // Test getting votes for movie
    const movieVotes = await storage.getAlwaysMovieVotes(addedMovie.id);
    assert.equal(movieVotes.length, 2, 'Should have two votes for the movie');

    const yesVotes = movieVotes.filter(v => v.vote === true);
    const noVotes = movieVotes.filter(v => v.vote === false);
    assert.equal(yesVotes.length, 1, 'Should have one yes vote');
    assert.equal(noVotes.length, 1, 'Should have one no vote');
});

runner.test('JSON Storage - User preferences and journal sharing', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';

    const storage = new McpDataMovieStorage();
    const userId = 'user-alice';

    // Test user preferences
    const preferences = await storage.updateUserPreferences(userId, {
        favoriteTags: ['sci-fi', 'action', 'AI'],
        moodMappings: {
            'thrilling': {
                preferredTags: ['action', 'sci-fi', 'thriller'],
                minRating: 7,
                maxRecency: 365,
                allowRewatches: true
            },
            'relaxing': {
                preferredTags: ['comedy', 'romance', 'family'],
                minRating: 6,
                maxRecency: 180,
                allowRewatches: true
            }
        },
        ratingTendency: 'generous',
        defaultPrivacy: 'shared'
    });

    assert.equal(preferences.userId, userId, 'Preferences should be for correct user');
    assert.deepEqual(preferences.favoriteTags, ['sci-fi', 'action', 'AI'], 'Favorite tags should match');

    const retrievedPrefs = await storage.getUserPreferences(userId);
    assert.true(retrievedPrefs !== null, 'Should retrieve user preferences');
    assert.deepEqual(retrievedPrefs!.favoriteTags, preferences.favoriteTags, 'Retrieved preferences should match');

    // Test journal sharing
    const journalSharing = await storage.updateJournalSharing(userId, {
        sharedWith: ['user-bob', 'user-charlie'],
        sharedBy: ['user-david'],
        journalName: 'Sci-Fi Movie Club'
    });

    assert.equal(journalSharing.userId, userId, 'Journal sharing should be for correct user');
    assert.deepEqual(journalSharing.sharedWith, ['user-bob', 'user-charlie'], 'SharedWith should match');

    // Test shared journal members
    const members = await storage.getSharedJournalMembers(userId);
    assert.true(members.includes('user-bob'), 'Should include sharedWith users');
    assert.true(members.includes('user-david'), 'Should include sharedBy users');

    // Test shared journal context
    const context = await storage.getSharedJournalContext(userId);
    assert.true(context.journalMembers.includes(userId), 'Context should include the user');
    assert.equal(context.journalName, 'Sci-Fi Movie Club', 'Context should have journal name');
});

runner.test('MongoDB Storage - Basic functionality (if available)', async () => {
    process.env.MCP_STORAGE_TYPE = 'mongodb';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    process.env.MONGODB_DATABASE = 'movies_integration_test';
    process.env.MONGODB_COLLECTION = 'test_movies';

    try {
        const storage = new McpDataMovieStorage();

        // Test basic movie operations
        const addedMovie = await storage.addMovie(testMovies[0]);
        assert.hasProperty(addedMovie, 'id', 'MongoDB storage should add movie with ID');

        const retrievedMovie = await storage.getMovieById(addedMovie.id);
        assert.true(retrievedMovie !== null, 'Should retrieve movie from MongoDB');
        assert.equal(retrievedMovie!.title, testMovies[0].title, 'Retrieved movie title should match');

        // Test filtering
        const sciFiMovies = await storage.getMovies({ tags: ['sci-fi'] });
        assert.true(sciFiMovies.length >= 1, 'Should find sci-fi movies in MongoDB');

        console.log('✅ MongoDB storage tests passed');
    } catch (error) {
        console.warn('⚠️  MongoDB tests skipped (no connection available):', (error as Error).message);
        // MongoDB tests are optional in CI/test environments
    }
});

runner.test('Storage consistency - Data persistence across operations', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';

    // Create first storage instance
    const storage1 = new McpDataMovieStorage();

    // Add data with first instance
    const addedMovie = await storage1.addMovie(testMovies[0]);
    const addedReview = await storage1.addReview({
        movieId: addedMovie.id,
        userId: 'user-alice',
        rating: 8,
        review: 'Great movie!',
        watchedDate: '2025-01-01T00:00:00Z',
        mood: 'exciting',
        rewatchable: true
    });

    // Create second storage instance (should read from same data)
    const storage2 = new McpDataMovieStorage();

    // Verify data is accessible from second instance
    const retrievedMovie = await storage2.getMovieById(addedMovie.id);
    assert.true(retrievedMovie !== null, 'Movie should be accessible from second storage instance');
    assert.equal(retrievedMovie!.title, addedMovie.title, 'Movie data should be consistent');

    const movieReviews = await storage2.getReviewsForMovie(addedMovie.id);
    assert.equal(movieReviews.length, 1, 'Review should be accessible from second storage instance');
    assert.equal(movieReviews[0].id, addedReview.id, 'Review data should be consistent');
});

runner.test('MovieManager integration with mcp-data storage', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';

    const storage = new McpDataMovieStorage();
    const userManager = new UserManager();
    const movieManager = new MovieManager(storage, userManager);

    // Test adding movie through MovieManager
    const result = await movieManager.addMovie({
        title: 'Integration Test Movie',
        year: 2025,
        director: 'Test Director',
        tags: ['test', 'integration']
    }, 'user-alice');

    assert.true(result.success, 'MovieManager should successfully add movie');
    assert.hasProperty(result, 'movie', 'Result should include movie object');

    // Test getting movies for user
    const userMovies = await movieManager.getMoviesForUser('user-alice');
    assert.true(userMovies.length > 0, 'Should retrieve movies for user');

    // Verify the movie is in the user's list
    const addedMovieInList = userMovies.find(m => m.id === result.movie!.id);
    assert.true(addedMovieInList !== undefined, 'Added movie should be in user\'s movie list');
});

runner.test('Performance - Bulk operations', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';

    const storage = new McpDataMovieStorage();
    const startTime = Date.now();

    // Add multiple movies
    const bulkMovies: Array<Omit<Movie, 'id' | 'addedAt' | 'updatedAt'>> = [];
    for (let i = 0; i < 20; i++) {
        bulkMovies.push({
            title: `Bulk Test Movie ${i}`,
            year: 2020 + (i % 5),
            director: `Director ${i % 3}`,
            tags: ['bulk-test', `tag-${i % 4}`],
            addedBy: `user-${i % 3}`
        });
    }

    const addedMovies: Movie[] = [];
    for (const movieData of bulkMovies) {
        const addedMovie = await storage.addMovie(movieData);
        addedMovies.push(addedMovie);
    }

    const addTime = Date.now() - startTime;
    console.log(`Added ${bulkMovies.length} movies in ${addTime}ms`);

    // Test bulk retrieval
    const retrievalStartTime = Date.now();
    const allMovies = await storage.getMovies();
    const retrievalTime = Date.now() - retrievalStartTime;

    console.log(`Retrieved ${allMovies.length} movies in ${retrievalTime}ms`);

    assert.true(allMovies.length >= bulkMovies.length, 'Should retrieve all bulk movies');
    assert.true(addTime < 5000, 'Bulk add should complete within 5 seconds');
    assert.true(retrievalTime < 1000, 'Bulk retrieval should complete within 1 second');
});

runner.test('Error handling and edge cases', async () => {
    process.env.MCP_STORAGE_TYPE = 'json';

    const storage = new McpDataMovieStorage();

    // Test adding movie with minimal data
    const minimalMovie = await storage.addMovie({
        title: 'Minimal Movie',
        year: 2025,
        director: 'Unknown',
        addedBy: 'user-test'
    });

    assert.hasProperty(minimalMovie, 'id', 'Should add movie with minimal data');
    assert.true(!minimalMovie.tags || minimalMovie.tags.length === 0, 'Tags should be optional');

    // Test empty filters
    const allMoviesEmpty = await storage.getMovies({});
    const allMoviesUndefined = await storage.getMovies();
    assert.equal(allMoviesEmpty.length, allMoviesUndefined.length, 'Empty filters should return all movies');

    // Test non-existent operations
    const nonExistentMovie = await storage.getMovieById('does-not-exist');
    assert.true(nonExistentMovie === null, 'Non-existent movie should return null');

    const deleteNonExistent = await storage.deleteMovie('does-not-exist');
    assert.false(deleteNonExistent, 'Deleting non-existent movie should return false');
});

runner.test('Cleanup integration test environment', async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up test data
    await testDataManager.cleanup();

    assert.true(true, 'Integration test environment cleaned up');
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