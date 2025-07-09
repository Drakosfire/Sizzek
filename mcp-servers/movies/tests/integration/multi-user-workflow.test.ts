// tests/integration/multi-user-workflow.test.ts

import { TestRunner, assert, TestDataManager } from '../helpers/test-utilities.js';
import { MultiUserTestFramework } from '../helpers/multi-user-test-utilities.js';
import { MovieTestDataManager } from '../helpers/movie-test-data.js';
import { MovieManager } from '../../src/movie-manager.js';
import { UserManager } from '../../src/user-manager.js';
import { MovieSuggestionEngine } from '../../src/suggestion-engine.js';
import { JsonMovieStorage } from '../../src/storage/JsonStorage.js';

const runner = new TestRunner('Multi-User Integration Tests');
const multiUser = new MultiUserTestFramework();
const testData = new MovieTestDataManager();
const dataManager = new TestDataManager();

// Test components
let storage: JsonMovieStorage;
let testDir: string;

runner.test('Setup integration test environment', async () => {
    // Create isolated test directory
    testDir = dataManager.createTestDirectory('integration');
    storage = new JsonMovieStorage(testDir);

    // Setup multi-user journal sharing
    await multiUser.setupSharedJournalData(storage);

    assert.true(true, 'Integration test environment setup complete');
});

runner.test('Complete movie addition and review workflow', async () => {
    const userManager = new UserManager();
    const movieManager = new MovieManager(storage, userManager);

    // Alice adds a movie
    const movieResult = await multiUser.performAsUser('alice', async () => {
        return await movieManager.addMovie({
            title: 'Integration Test Movie',
            year: 2024,
            director: 'Test Director',
            tags: ['action', 'adventure']
        }, 'test-user-alice');
    });

    assert.true(movieResult.success, 'Alice should be able to add movie');
    assert.hasProperty(movieResult, 'movie', 'Result should include movie object');
    const movieId = movieResult.movie!.id;

    // Both users review the movie
    const aliceReviewResult = await multiUser.performAsUser('alice', async () => {
        return await movieManager.addReview({
            movieId,
            rating: 9,
            review: 'Loved it! Great action sequences.',
            watchedDate: '2024-01-01T00:00:00Z',
            mood: 'exciting',
            rewatchable: true
        }, 'test-user-alice');
    });

    const bobReviewResult = await multiUser.performAsUser('bob', async () => {
        return await movieManager.addReview({
            movieId,
            rating: 6,
            review: 'It was okay, a bit too long for my taste.',
            watchedDate: '2024-01-02T00:00:00Z',
            mood: 'exciting',
            rewatchable: false
        }, 'test-user-bob');
    });

    assert.true(aliceReviewResult.success, 'Alice should be able to add review');
    assert.true(bobReviewResult.success, 'Bob should be able to add review');

    // Verify each user sees their own review but movie is shared
    const aliceMovies = await multiUser.performAsUser('alice', async () => {
        return await movieManager.getMoviesForUser('test-user-alice');
    });

    const bobMovies = await multiUser.performAsUser('bob', async () => {
        return await movieManager.getMoviesForUser('test-user-bob');
    });

    const aliceMovie = aliceMovies.find(m => m.id === movieId);
    const bobMovie = bobMovies.find(m => m.id === movieId);

    assert.true(aliceMovie !== undefined, 'Alice should see the shared movie');
    assert.true(bobMovie !== undefined, 'Bob should see the shared movie');

    // Verify individual user reviews
    assert.equal(aliceMovie!.userReview?.rating, 9, 'Alice should see her rating');
    assert.equal(bobMovie!.userReview?.rating, 6, 'Bob should see his rating');

    // Verify shared data
    assert.equal(aliceMovie!.totalReviews, 2, 'Alice should see total review count');
    assert.equal(bobMovie!.totalReviews, 2, 'Bob should see total review count');

    // Verify average rating calculation
    const expectedAverage = (9 + 6) / 2; // 7.5
    assert.equal(aliceMovie!.averageRating, expectedAverage, 'Average rating should be calculated correctly');
    assert.equal(bobMovie!.averageRating, expectedAverage, 'Average rating should be consistent for both users');

    // Validate data isolation
    await multiUser.validateJournalSharing('getMoviesForUser', aliceMovies, 'alice');
    await multiUser.validateJournalSharing('getMoviesForUser', bobMovies, 'bob');
});

runner.test('Always Movie voting consensus workflow', async () => {
    const userManager = new UserManager();
    const movieManager = new MovieManager(storage, userManager);

    // Add a movie first
    const movieResult = await multiUser.performAsUser('alice', async () => {
        return await movieManager.addMovie({
            title: 'Consensus Test Movie',
            year: 2024,
            director: 'Consensus Director',
            tags: ['comedy', 'family']
        }, 'test-user-alice');
    });

    assert.true(movieResult.success, 'Movie should be added successfully');
    const movieId = movieResult.movie!.id;

    // Alice votes yes
    const aliceVoteResult = await multiUser.performAsUser('alice', async () => {
        return await movieManager.voteAlwaysMovie(movieId, true, 'test-user-alice', 'Great comfort movie');
    });

    assert.true(aliceVoteResult.success, 'Alice vote should succeed');
    assert.false(aliceVoteResult.isAlwaysMovie, 'Should NOT be Always Movie with only Alice vote');

    // Check status from both users - should NOT be Always Movie yet
    const moviesAfterAliceVote = await multiUser.performAsUser('alice', async () => {
        return await movieManager.getMoviesForUser('test-user-alice');
    });

    const movieAfterAliceVote = moviesAfterAliceVote.find(m => m.id === movieId);
    assert.false(movieAfterAliceVote!.isAlwaysMovie, 'Should not be Always Movie with only one vote');

    const bobMoviesAfterAliceVote = await multiUser.performAsUser('bob', async () => {
        return await movieManager.getMoviesForUser('test-user-bob');
    });

    const bobMovieAfterAliceVote = bobMoviesAfterAliceVote.find(m => m.id === movieId);
    assert.false(bobMovieAfterAliceVote!.isAlwaysMovie, 'Bob should also see it as not Always Movie');

    // Bob votes yes - should achieve consensus
    const bobVoteResult = await multiUser.performAsUser('bob', async () => {
        return await movieManager.voteAlwaysMovie(movieId, true, 'test-user-bob', 'Agree with Alice, perfect for family time');
    });

    assert.true(bobVoteResult.success, 'Bob vote should succeed');
    assert.true(bobVoteResult.isAlwaysMovie, 'Should be Always Movie with unanimous positive votes');

    // Verify both users now see it as Always Movie
    const moviesAfterConsensus = await multiUser.performAsUser('alice', async () => {
        return await movieManager.getMoviesForUser('test-user-alice');
    });

    const movieAfterConsensus = moviesAfterConsensus.find(m => m.id === movieId);
    assert.true(movieAfterConsensus!.isAlwaysMovie, 'Alice should see it as Always Movie after consensus');

    const bobMoviesAfterConsensus = await multiUser.performAsUser('bob', async () => {
        return await movieManager.getMoviesForUser('test-user-bob');
    });

    const bobMovieAfterConsensus = bobMoviesAfterConsensus.find(m => m.id === movieId);
    assert.true(bobMovieAfterConsensus!.isAlwaysMovie, 'Bob should see it as Always Movie after consensus');

    // Verify Always Movies list includes this movie
    const aliceAlwaysMovies = await multiUser.performAsUser('alice', async () => {
        return await movieManager.getAlwaysMovies('test-user-alice');
    });

    assert.true(aliceAlwaysMovies.success, 'Should retrieve Always Movies successfully');
    const alwaysMovieIds = aliceAlwaysMovies.movies.map((m: any) => m.id);
    assert.true(alwaysMovieIds.includes(movieId), 'Always Movies list should include consensus movie');
});

runner.test('Always Movie consensus failure with mixed votes', async () => {
    const userManager = new UserManager();
    const movieManager = new MovieManager(storage, userManager);

    // Add a movie for mixed vote testing
    const movieResult = await multiUser.performAsUser('bob', async () => {
        return await movieManager.addMovie({
            title: 'Mixed Vote Movie',
            year: 2024,
            director: 'Mixed Director',
            tags: ['drama']
        }, 'test-user-bob');
    });

    const movieId = movieResult.movie!.id;

    // Alice votes yes
    await multiUser.performAsUser('alice', async () => {
        return await movieManager.voteAlwaysMovie(movieId, true, 'test-user-alice', 'I like it');
    });

    // Bob votes no
    const bobVoteResult = await multiUser.performAsUser('bob', async () => {
        return await movieManager.voteAlwaysMovie(movieId, false, 'test-user-bob', 'Not my style');
    });

    assert.true(bobVoteResult.success, 'Bob vote should be recorded');
    assert.false(bobVoteResult.isAlwaysMovie, 'Should NOT be Always Movie with mixed votes');

    // Verify neither user sees it as Always Movie
    const aliceMovies = await multiUser.performAsUser('alice', async () => {
        return await movieManager.getMoviesForUser('test-user-alice');
    });

    const aliceMovie = aliceMovies.find(m => m.id === movieId);
    assert.false(aliceMovie!.isAlwaysMovie, 'Alice should not see it as Always Movie with mixed votes');

    const bobMovies = await multiUser.performAsUser('bob', async () => {
        return await movieManager.getMoviesForUser('test-user-bob');
    });

    const bobMovie = bobMovies.find(m => m.id === movieId);
    assert.false(bobMovie!.isAlwaysMovie, 'Bob should not see it as Always Movie with mixed votes');
});

runner.test('Journal sharing isolation - Charlie separate journal', async () => {
    const userManager = new UserManager();
    const movieManager = new MovieManager(storage, userManager);

    // Charlie adds a movie to his separate journal
    const charlieMovieResult = await multiUser.performAsUser('charlie', async () => {
        return await movieManager.addMovie({
            title: 'Charlie Private Movie',
            year: 2024,
            director: 'Private Director',
            tags: ['mystery']
        }, 'test-user-charlie');
    });

    assert.true(charlieMovieResult.success, 'Charlie should be able to add movie');
    const charlieMovieId = charlieMovieResult.movie!.id;

    // Charlie reviews his movie
    await multiUser.performAsUser('charlie', async () => {
        return await movieManager.addReview({
            movieId: charlieMovieId,
            rating: 8,
            review: 'Intriguing mystery with great plot twists.',
            watchedDate: '2024-01-01T00:00:00Z',
            mood: 'thoughtful',
            rewatchable: true
        }, 'test-user-charlie');
    });

    // Alice should see the movie (shared catalog) but not Charlie's review
    const aliceMovies = await multiUser.performAsUser('alice', async () => {
        return await movieManager.getMoviesForUser('test-user-alice');
    });

    const aliceViewOfCharlieMovie = aliceMovies.find(m => m.id === charlieMovieId);
    if (aliceViewOfCharlieMovie) {
        // Alice should see the movie but not Charlie's review
        assert.true(aliceViewOfCharlieMovie.userReview === undefined, 'Alice should not have a review for this movie yet');
        assert.equal(aliceViewOfCharlieMovie.totalReviews, 0, 'Alice should not see Charlie\'s review in her journal context');
        assert.equal(aliceViewOfCharlieMovie.journalReviews.length, 0, 'Alice should not see Charlie\'s review');
    }

    // Charlie should see his own review
    const charlieMovies = await multiUser.performAsUser('charlie', async () => {
        return await movieManager.getMoviesForUser('test-user-charlie');
    });

    const charlieMovie = charlieMovies.find(m => m.id === charlieMovieId);
    assert.true(charlieMovie !== undefined, 'Charlie should see his movie');
    assert.true(charlieMovie!.userReview !== undefined, 'Charlie should see his review');
    assert.equal(charlieMovie!.userReview!.rating, 8, 'Charlie should see his rating');
    assert.equal(charlieMovie!.totalReviews, 1, 'Charlie should see 1 review in his journal');

    // Validate data isolation for both users
    await multiUser.validateJournalSharing('getMoviesForUser', aliceMovies, 'alice');
    await multiUser.validateJournalSharing('getMoviesForUser', charlieMovies, 'charlie');
});

runner.test('Journal sharing management workflow', async () => {
    const userManager = new UserManager();
    const movieManager = new MovieManager(storage, userManager);

    // Charlie shares his journal with Alice
    const shareResult = await multiUser.performAsUser('charlie', async () => {
        return await movieManager.shareJournalWithUser('test-user-charlie', 'test-user-alice', 'Charlie & Alice Collaboration');
    });

    assert.true(shareResult.success, 'Charlie should be able to share journal with Alice');
    assert.true(shareResult.message.includes('test-user-alice'), 'Message should mention Alice');

    // Verify sharing info
    const charlieJournalInfo = await multiUser.performAsUser('charlie', async () => {
        return await movieManager.getSharedJournalInfo('test-user-charlie');
    });

    assert.true(charlieJournalInfo.success, 'Should retrieve Charlie\'s journal info');
    assert.true(charlieJournalInfo.journalContext.journalMembers.includes('test-user-alice'), 'Alice should be in Charlie\'s journal members');

    // Charlie removes sharing
    const removeResult = await multiUser.performAsUser('charlie', async () => {
        return await movieManager.removeJournalSharing('test-user-charlie', 'test-user-alice');
    });

    assert.true(removeResult.success, 'Should remove journal sharing successfully');

    // Verify sharing is removed
    const charlieJournalInfoAfter = await multiUser.performAsUser('charlie', async () => {
        return await movieManager.getSharedJournalInfo('test-user-charlie');
    });

    // Charlie's journal should only include himself again
    assert.equal(charlieJournalInfoAfter.journalContext.journalMembers.length, 1, 'Charlie should have solo journal again');
    assert.true(charlieJournalInfoAfter.journalContext.journalMembers.includes('test-user-charlie'), 'Charlie should be in his own journal');
});

runner.test('Movie suggestions with multi-user data', async () => {
    const userManager = new UserManager();
    const movieManager = new MovieManager(storage, userManager);
    const suggestionEngine = new MovieSuggestionEngine(storage);

    // Add a few movies and reviews for Alice
    const comedyMovieResult = await multiUser.performAsUser('alice', async () => {
        return await movieManager.addMovie({
            title: 'Hilarious Comedy',
            year: 2024,
            director: 'Funny Director',
            tags: ['comedy']
        }, 'test-user-alice');
    });

    const comedyMovieId = comedyMovieResult.movie!.id;

    await multiUser.performAsUser('alice', async () => {
        return await movieManager.addReview({
            movieId: comedyMovieId,
            rating: 9,
            review: 'So funny! Perfect for a relaxing evening.',
            watchedDate: '2024-01-01T00:00:00Z',
            mood: 'relaxing',
            rewatchable: true
        }, 'test-user-alice');
    });

    // Get suggestions for Alice
    const aliceSuggestions = await multiUser.performAsUser('alice', async () => {
        return await suggestionEngine.getSuggestions('test-user-alice', 'relaxing', 5);
    });

    assert.true(Array.isArray(aliceSuggestions), 'Should return suggestions for Alice');

    // Verify suggestions only include Alice's reviewed movies
    for (const suggestion of aliceSuggestions) {
        const aliceReviews = await storage.getReviewsForUser('test-user-alice');
        const hasReview = aliceReviews.some(r => r.movieId === suggestion.movie.id);
        assert.true(hasReview, 'Suggestions should only include movies Alice has reviewed');
    }

    // Bob should get different suggestions based on his different reviews
    const bobSuggestions = await multiUser.performAsUser('bob', async () => {
        return await suggestionEngine.getSuggestions('test-user-bob', 'relaxing', 5);
    });

    assert.true(Array.isArray(bobSuggestions), 'Should return suggestions for Bob');

    // Verify Bob's suggestions are based on his reviews
    for (const suggestion of bobSuggestions) {
        const bobReviews = await storage.getReviewsForUser('test-user-bob');
        const hasReview = bobReviews.some(r => r.movieId === suggestion.movie.id);
        assert.true(hasReview, 'Suggestions should only include movies Bob has reviewed');
    }
});

runner.test('Cross-user data leakage prevention', async () => {
    const userManager = new UserManager();
    const movieManager = new MovieManager(storage, userManager);

    // Add sensitive movie for Charlie only
    const sensitiveMovieResult = await multiUser.performAsUser('charlie', async () => {
        return await movieManager.addMovie({
            title: 'Charlie Sensitive Movie',
            year: 2024,
            director: 'Sensitive Director',
            tags: ['drama']
        }, 'test-user-charlie');
    });

    const sensitiveMovieId = sensitiveMovieResult.movie!.id;

    await multiUser.performAsUser('charlie', async () => {
        return await movieManager.addReview({
            movieId: sensitiveMovieId,
            rating: 7,
            review: 'Personal and meaningful to me.',
            watchedDate: '2024-01-01T00:00:00Z',
            mood: 'thoughtful',
            rewatchable: false
        }, 'test-user-charlie');
    });

    // Alice and Bob should see the movie but not Charlie's review
    const aliceMovies = await multiUser.performAsUser('alice', async () => {
        return await movieManager.getMoviesForUser('test-user-alice');
    });

    const aliceViewOfSensitiveMovie = aliceMovies.find(m => m.id === sensitiveMovieId);
    if (aliceViewOfSensitiveMovie) {
        assert.true(aliceViewOfSensitiveMovie.userReview === undefined, 'Alice should not see Charlie\'s review');
        assert.equal(aliceViewOfSensitiveMovie.totalReviews, 0, 'Alice should not see Charlie\'s review count in her context');
        assert.equal(aliceViewOfSensitiveMovie.journalReviews.length, 0, 'Alice should not see Charlie\'s reviews in journal context');

        // Verify Alice's journal members don't include Charlie
        assert.false(aliceViewOfSensitiveMovie.sharedJournalContext.journalMembers.includes('test-user-charlie'),
            'Alice\'s journal should not include Charlie');
    }

    // Validate complete data isolation
    await multiUser.validateJournalSharing('getMoviesForUser', aliceMovies, 'alice');

    // Verify Charlie's data isolation
    const charlieMovies = await multiUser.performAsUser('charlie', async () => {
        return await movieManager.getMoviesForUser('test-user-charlie');
    });

    await multiUser.validateJournalSharing('getMoviesForUser', charlieMovies, 'charlie');
});

runner.test('Concurrent operations data consistency', async () => {
    const userManager = new UserManager();
    const movieManager = new MovieManager(storage, userManager);

    // Simulate concurrent movie additions
    const concurrentPromises = [];

    for (let i = 1; i <= 5; i++) {
        const promise = multiUser.performAsUser('alice', async () => {
            return await movieManager.addMovie({
                title: `Concurrent Movie ${i}`,
                year: 2024,
                director: `Director ${i}`,
                tags: ['action']
            }, 'test-user-alice');
        });
        concurrentPromises.push(promise);
    }

    const results = await Promise.all(concurrentPromises);

    // All operations should succeed
    for (let i = 0; i < results.length; i++) {
        assert.true(results[i].success, `Concurrent movie ${i + 1} should be added successfully`);
    }

    // Verify all movies were added
    const aliceMovies = await multiUser.performAsUser('alice', async () => {
        return await movieManager.getMoviesForUser('test-user-alice');
    });

    const concurrentMovies = aliceMovies.filter(m => m.title.includes('Concurrent Movie'));
    assert.equal(concurrentMovies.length, 5, 'All 5 concurrent movies should be added');

    // Verify unique IDs
    const movieIds = concurrentMovies.map(m => m.id);
    const uniqueIds = new Set(movieIds);
    assert.equal(uniqueIds.size, 5, 'All movies should have unique IDs');
});

// Cleanup and run tests
runner.test('Cleanup integration test environment', async () => {
    await dataManager.cleanup();
    multiUser.cleanup();

    assert.true(true, 'Integration test cleanup complete');
});

// Run the tests
runner.run().then(results => {
    multiUser.printSecuritySummary();

    const failed = results.filter(r => !r.passed).length;
    process.exit(failed > 0 ? 1 : 0);
}).catch(error => {
    console.error('Integration test suite failed:', error);
    dataManager.cleanup();
    multiUser.cleanup();
    process.exit(1);
}); 