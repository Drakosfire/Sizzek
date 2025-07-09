// tests/unit/movie-manager.test.ts

import { TestRunner, assert, createMockStorage } from '../helpers/test-utilities.js';
import { MultiUserTestFramework } from '../helpers/multi-user-test-utilities.js';
import { MovieTestDataManager } from '../helpers/movie-test-data.js';
import { MovieManager } from '../../src/movie-manager.js';
import { UserManager } from '../../src/user-manager.js';

const runner = new TestRunner('Movie Manager Unit Tests');
const multiUser = new MultiUserTestFramework();
const testData = new MovieTestDataManager();

// Set up test data
let mockStorage: any;
let userManager: UserManager;

runner.test('Setup test environment', async () => {
    mockStorage = createMockStorage();
    userManager = new UserManager();

    // Setup multi-user journal sharing data
    await multiUser.setupSharedJournalData(mockStorage);

    // Populate test data
    await testData.populateTestData(mockStorage);

    // Verify test movies were created
    const allMovies = await mockStorage.getMovies();
    assert.true(allMovies.length === 5, 'Should have 5 test movies created');

    assert.true(true, 'Test environment setup complete');
});

runner.test('Movie addition with valid data', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        const result = await manager.addMovie({
            title: 'New Test Movie',
            year: 2024,
            director: 'Test Director',
            tags: ['action', 'adventure']
        }, 'test-user-alice');

        assert.true(result.success, 'Movie should be added successfully');
        assert.hasProperty(result, 'movie', 'Result should include movie object');
        assert.equal(result.movie?.title, 'New Test Movie', 'Movie title should match');
        assert.equal(result.movie?.addedBy, 'test-user-alice', 'Movie should be attributed to Alice');
    });
});

runner.test('Movie addition with duplicate detection', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        // First, add the original movie
        await mockStorage.addMovie({
            title: 'Inception',
            year: 2010,
            director: 'Christopher Nolan',
            tags: ['sci-fi', 'thriller'],
            addedBy: 'test-user-alice'
        });

        // Try to add very similar movie
        const result = await manager.addMovie({
            title: 'inception',  // Different case
            year: 2010,
            director: 'Christopher Nolan',
            tags: ['sci-fi']
        }, 'test-user-alice');

        assert.false(result.success, 'Duplicate should be detected');
        assert.true(result.requiresConfirmation, 'Should require confirmation');
        assert.true(result.potentialDuplicates && result.potentialDuplicates.length > 0, 'Should list potential duplicates');
        assert.equal(result.message, 'Potential duplicate found', 'Should have appropriate message');
    });
});

runner.test('Movie addition with year variance detection', async () => {
    await multiUser.performAsUser('bob', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        // Add original movie
        await mockStorage.addMovie({
            title: 'The Matrix',
            year: 1999,
            director: 'The Wachowskis',
            tags: ['action', 'sci-fi'],
            addedBy: 'test-user-bob'
        });

        // Try to add with different year but same title/director
        const result = await manager.addMovie({
            title: 'The Matrix',
            year: 2000, // Different year
            director: 'The Wachowskis',
            tags: ['action', 'sci-fi']
        }, 'test-user-bob');

        assert.false(result.success, 'Should detect duplicate despite year difference');
        assert.true(result.requiresConfirmation, 'Should require confirmation');
    });
});

runner.test('Movie addition with invalid user ID', async () => {
    const manager = new MovieManager(mockStorage, userManager);

    const result = await manager.addMovie({
        title: 'Test Movie',
        year: 2024,
        director: 'Director'
    }, ''); // Empty user ID

    assert.false(result.success, 'Should fail with invalid user ID');
    assert.equal(result.message, 'Invalid user ID', 'Should have appropriate error message');
});

runner.test('Get movies for user - shared journal data access', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);
        const aliceMovies = await manager.getMoviesForUser('test-user-alice');

        // Verify Alice sees movies from shared journal
        assert.true(aliceMovies.length > 0, 'Alice should see movies');

        // Verify each movie has proper user context
        for (const movie of aliceMovies) {
            // Alice should only see her own review as userReview
            if (movie.userReview) {
                assert.equal(movie.userReview.userId, 'test-user-alice', 'Alice should only see her own reviews as userReview');
            }

            // Verify shared journal context
            assert.hasProperty(movie, 'sharedJournalContext', 'Should have shared journal context');
            assert.true(movie.sharedJournalContext.journalMembers.includes('test-user-alice'), 'Alice should be in journal members');
            assert.true(movie.sharedJournalContext.journalMembers.includes('test-user-bob'), 'Bob should be in journal members for shared journal');
        }

        // Validate data isolation
        await multiUser.validateJournalSharing('getMoviesForUser', aliceMovies, 'alice');
    });
});

runner.test('Get movies for user - separate journal isolation', async () => {
    await multiUser.performAsUser('charlie', async () => {
        const manager = new MovieManager(mockStorage, userManager);
        const charlieMovies = await manager.getMoviesForUser('test-user-charlie');

        // Charlie should see his movies but not Alice/Bob's private data
        for (const movie of charlieMovies) {
            if (movie.userReview) {
                assert.equal(movie.userReview.userId, 'test-user-charlie', 'Charlie should only see his own reviews');
            }

            // Charlie's journal should only include himself
            assert.equal(movie.sharedJournalContext.journalMembers.length, 1, 'Charlie should have solo journal');
            assert.true(movie.sharedJournalContext.journalMembers.includes('test-user-charlie'), 'Charlie should be in his own journal');
        }

        // Validate data isolation
        await multiUser.validateJournalSharing('getMoviesForUser', charlieMovies, 'charlie');
    });
});

runner.test('Add review with valid data', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        // First add a movie
        const movieResult = await manager.addMovie({
            title: 'Review Test Movie',
            year: 2024,
            director: 'Review Director'
        }, 'test-user-alice');

        const movieId = movieResult.movie!.id;

        const result = await manager.addReview({
            movieId,
            rating: 8,
            review: 'Great movie! Really enjoyed it.',
            watchedDate: '2024-01-01T00:00:00Z',
            mood: 'exciting',
            rewatchable: true
        }, 'test-user-alice');

        assert.true(result.success, 'Review should be added successfully');
        assert.hasProperty(result, 'review', 'Result should include review object');
        assert.equal(result.review?.rating, 8, 'Review rating should match');
        assert.equal(result.review?.userId, 'test-user-alice', 'Review should be attributed to Alice');
    });
});

runner.test('Add review with invalid movie ID', async () => {
    await multiUser.performAsUser('bob', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        const result = await manager.addReview({
            movieId: 'nonexistent-movie',
            rating: 5,
            review: 'Test review',
            watchedDate: '2024-01-01T00:00:00Z',
            rewatchable: false
        }, 'test-user-bob');

        assert.false(result.success, 'Should fail with invalid movie ID');
    });
});

runner.test('Add review with invalid rating', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        // Add a movie first
        const movieResult = await manager.addMovie({
            title: 'Rating Test Movie',
            year: 2024,
            director: 'Rating Director'
        }, 'test-user-alice');

        const movieId = movieResult.movie!.id;

        // Try with rating too high
        const result1 = await manager.addReview({
            movieId,
            rating: 11, // Invalid - too high
            review: 'Test review',
            watchedDate: '2024-01-01T00:00:00Z',
            rewatchable: false
        }, 'test-user-alice');

        assert.false(result1.success, 'Should fail with rating > 10');

        // Try with rating too low
        const result2 = await manager.addReview({
            movieId,
            rating: 0, // Invalid - too low
            review: 'Test review',
            watchedDate: '2024-01-01T00:00:00Z',
            rewatchable: false
        }, 'test-user-alice');

        assert.false(result2.success, 'Should fail with rating < 1');
    });
});

runner.test('Always Movie voting - individual vote', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        // Use existing test movie
        const movieId = 'test-movie-3'; // Mind Bender

        const result = await manager.voteAlwaysMovie(movieId, true, 'test-user-alice', 'Love the thought-provoking story');

        assert.true(result.success, 'Vote should be recorded successfully');
        assert.hasProperty(result, 'vote', 'Result should include vote object');
        assert.equal(result.vote.vote, true, 'Vote should be positive');
        assert.equal(result.vote.userId, 'test-user-alice', 'Vote should be attributed to Alice');

        // Single vote should not make it Always Movie (needs consensus)
        assert.false(result.isAlwaysMovie, 'Single vote should not make it Always Movie');
    });
});

runner.test('Always Movie voting - consensus achievement', async () => {
    const manager = new MovieManager(mockStorage, userManager);
    const movieId = 'test-movie-4'; // Family Fun Time

    // Alice votes yes
    await multiUser.performAsUser('alice', async () => {
        const result = await manager.voteAlwaysMovie(movieId, true, 'test-user-alice', 'Great for family time');
        assert.true(result.success, 'Alice vote should succeed');
        assert.false(result.isAlwaysMovie, 'Should not be Always Movie with only Alice vote');
    });

    // Bob votes yes - should achieve consensus
    await multiUser.performAsUser('bob', async () => {
        const result = await manager.voteAlwaysMovie(movieId, true, 'test-user-bob', 'Kids love it');
        assert.true(result.success, 'Bob vote should succeed');
        assert.true(result.isAlwaysMovie, 'Should be Always Movie with unanimous positive votes');
    });
});

runner.test('Always Movie voting - consensus failure with mixed votes', async () => {
    const manager = new MovieManager(mockStorage, userManager);
    const movieId = 'test-movie-1'; // The Grand Adventure (already has mixed votes in test data)

    // Check current status - should not be Always Movie due to mixed votes
    await multiUser.performAsUser('alice', async () => {
        const movies = await manager.getMoviesForUser('test-user-alice');
        const movie = movies.find(m => m.id === movieId);

        assert.true(movie !== undefined, 'Movie should exist');
        assert.false(movie!.isAlwaysMovie, 'Movie should not be Always Movie with mixed votes');
    });
});

runner.test('Always Movie voting with invalid movie ID', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        const result = await manager.voteAlwaysMovie('nonexistent-movie', true, 'test-user-alice');

        assert.false(result.success, 'Should fail with invalid movie ID');
        assert.equal(result.message, 'Movie not found', 'Should have appropriate error message');
    });
});

runner.test('Get Always Movies for user', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        const result = await manager.getAlwaysMovies('test-user-alice');

        assert.true(result.success, 'Should retrieve Always Movies successfully');
        assert.hasProperty(result, 'movies', 'Result should include movies array');
        assert.hasProperty(result, 'count', 'Result should include count');

        // Based on test data, should include movie-2 (Romantic Evening)
        const alwaysMovieIds = result.movies.map((m: any) => m.id);
        assert.true(alwaysMovieIds.includes('test-movie-2'), 'Should include Romantic Evening as Always Movie');

        // All returned movies should be marked as Always Movies
        for (const movie of result.movies) {
            assert.true(movie.isAlwaysMovie, 'All returned movies should be marked as Always Movies');
        }
    });
});

runner.test('Journal sharing - share with user', async () => {
    await multiUser.performAsUser('charlie', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        const result = await manager.shareJournalWithUser('test-user-charlie', 'test-user-alice', 'Charlie & Alice Journal');

        assert.true(result.success, 'Journal sharing should succeed');
        assert.true(result.message.includes('test-user-alice'), 'Message should include target user');
        assert.hasProperty(result, 'sharedJournalContext', 'Should include updated journal context');
    });
});

runner.test('Journal sharing - prevent sharing with self', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        const result = await manager.shareJournalWithUser('test-user-alice', 'test-user-alice', 'Self Journal');

        assert.false(result.success, 'Should not allow sharing with self');
        assert.equal(result.message, 'Cannot share journal with yourself', 'Should have appropriate error message');
    });
});

runner.test('Journal sharing - prevent duplicate sharing', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        // Alice already shares with Bob in test data
        const result = await manager.shareJournalWithUser('test-user-alice', 'test-user-bob', 'Duplicate Journal');

        assert.false(result.success, 'Should not allow duplicate sharing');
        assert.equal(result.message, 'Journal is already shared with this user', 'Should have appropriate error message');
    });
});

runner.test('Get shared journal info', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        const result = await manager.getSharedJournalInfo('test-user-alice');

        assert.true(result.success, 'Should retrieve journal info successfully');
        assert.hasProperty(result, 'journalContext', 'Should include journal context');
        assert.hasProperty(result, 'sharingDetails', 'Should include sharing details');

        // Alice should be sharing with Bob
        assert.true(result.journalContext.journalMembers.includes('test-user-alice'), 'Should include Alice');
        assert.true(result.journalContext.journalMembers.includes('test-user-bob'), 'Should include Bob');
    });
});

runner.test('Remove journal sharing', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        // First, share with charlie
        await manager.shareJournalWithUser('test-user-alice', 'test-user-charlie', 'Temp Journal');

        // Then remove the sharing
        const result = await manager.removeJournalSharing('test-user-alice', 'test-user-charlie');

        assert.true(result.success, 'Should remove journal sharing successfully');
        assert.true(result.message.includes('test-user-charlie'), 'Message should include target user');
    });
});

runner.test('Remove non-existent journal sharing', async () => {
    await multiUser.performAsUser('charlie', async () => {
        const manager = new MovieManager(mockStorage, userManager);

        const result = await manager.removeJournalSharing('test-user-charlie', 'test-user-bob');

        assert.false(result.success, 'Should fail to remove non-existent sharing');
        assert.equal(result.message, 'Journal is not shared with this user', 'Should have appropriate error message');
    });
});

runner.test('String similarity calculation', async () => {
    const manager = new MovieManager(mockStorage, userManager);

    // Access private method through any cast for testing
    const calculateSimilarity = (manager as any).calculateStringSimilarity.bind(manager);

    // Test exact match
    const exactMatch = calculateSimilarity('The Matrix', 'The Matrix');
    assert.equal(exactMatch, 1, 'Exact match should have similarity of 1');

    // Test case insensitive match
    const caseMatch = calculateSimilarity('the matrix', 'THE MATRIX');
    assert.equal(caseMatch, 1, 'Case insensitive match should have similarity of 1');

    // Test partial match
    const partialMatch = calculateSimilarity('The Matrix', 'Matrix');
    assert.true(partialMatch > 0.5, 'Partial match should have high similarity');

    // Test no match
    const noMatch = calculateSimilarity('The Matrix', 'Star Wars');
    assert.true(noMatch < 0.5, 'No match should have low similarity');
});

runner.test('Average rating calculation', async () => {
    await multiUser.performAsUser('alice', async () => {
        const manager = new MovieManager(mockStorage, userManager);
        const movies = await manager.getMoviesForUser('test-user-alice');

        // Find a movie with multiple reviews
        const movieWithReviews = movies.find(m => m.totalReviews > 1);

        if (movieWithReviews) {
            assert.true(movieWithReviews.averageRating > 0, 'Average rating should be calculated');
            assert.true(movieWithReviews.averageRating <= 10, 'Average rating should not exceed 10');

            // Verify calculation is reasonable based on review count
            assert.equal(movieWithReviews.journalReviews.length, movieWithReviews.totalReviews, 'Review count should match');
        }
    });
});

// Run the tests
runner.run().then(results => {
    multiUser.cleanup();

    const failed = results.filter(r => !r.passed).length;
    process.exit(failed > 0 ? 1 : 0);
}).catch(error => {
    console.error('Test suite failed:', error);
    multiUser.cleanup();
    process.exit(1);
}); 