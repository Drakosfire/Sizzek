// tests/unit/suggestion-engine.test.ts

import { TestRunner, assert, createMockStorage } from '../helpers/test-utilities.js';
import { MultiUserTestFramework } from '../helpers/multi-user-test-utilities.js';
import { MovieTestDataManager } from '../helpers/movie-test-data.js';
import { MovieSuggestionEngine } from '../../src/suggestion-engine.js';

const runner = new TestRunner('Movie Suggestion Engine Unit Tests');
const multiUser = new MultiUserTestFramework();
const testData = new MovieTestDataManager();

// Set up test data
let mockStorage: any;
let suggestionEngine: MovieSuggestionEngine;

runner.test('Setup suggestion engine test environment', async () => {
    mockStorage = createMockStorage();
    suggestionEngine = new MovieSuggestionEngine(mockStorage);

    // Setup multi-user journal sharing data
    await multiUser.setupSharedJournalData(mockStorage);

    // Populate test data
    await testData.populateTestData(mockStorage);

    assert.true(true, 'Suggestion engine test environment setup complete');
});

runner.test('Get suggestions with relaxing mood', async () => {
    await multiUser.performAsUser('alice', async () => {
        const suggestions = await suggestionEngine.getSuggestions('test-user-alice', 'relaxing', 3);

        assert.true(Array.isArray(suggestions), 'Should return array of suggestions');
        assert.true(suggestions.length <= 3, 'Should respect count limit');

        // Verify suggestions match relaxing mood profile
        for (const suggestion of suggestions) {
            assert.hasProperty(suggestion, 'movie', 'Suggestion should have movie');
            assert.hasProperty(suggestion, 'score', 'Suggestion should have score');
            assert.hasProperty(suggestion, 'reason', 'Suggestion should have reason');
            assert.hasProperty(suggestion, 'confidence', 'Suggestion should have confidence');

            // Confidence should be between 0-100
            assert.true(suggestion.confidence >= 0 && suggestion.confidence <= 100,
                'Confidence should be between 0-100');

            // Score should be positive
            assert.true(suggestion.score > 0, 'Score should be positive');

            // Reason should be a non-empty string
            assert.true(typeof suggestion.reason === 'string' && suggestion.reason.length > 0,
                'Reason should be a non-empty string');
        }
    });
});

runner.test('Get suggestions with exciting mood', async () => {
    await multiUser.performAsUser('alice', async () => {
        const suggestions = await suggestionEngine.getSuggestions('test-user-alice', 'exciting', 5);

        assert.true(suggestions.length <= 5, 'Should respect count limit');

        // For exciting mood, should prefer action/adventure tags with high ratings
        for (const suggestion of suggestions) {
            const movie = suggestion.movie;

            // Should have appropriate tags or high rating
            const hasExcitingTag = movie.tags?.some(t =>
                ['action', 'adventure', 'thriller'].includes(t.toLowerCase())
            );

            // Either has exciting tag or high score
            assert.true(hasExcitingTag || suggestion.score >= 8,
                'Exciting suggestions should have appropriate tags or high ratings');
        }
    });
});

runner.test('Get suggestions with thoughtful mood', async () => {
    await multiUser.performAsUser('alice', async () => {
        const suggestions = await suggestionEngine.getSuggestions('test-user-alice', 'thoughtful', 2);

        assert.true(suggestions.length <= 2, 'Should respect count limit');

        // For thoughtful mood, should prefer drama/documentary tags
        for (const suggestion of suggestions) {
            const movie = suggestion.movie;

            const hasThoughtfulTag = movie.tags?.some(t =>
                ['drama', 'documentary', 'sci-fi'].includes(t.toLowerCase())
            );

            // Should have thoughtful tag or high rating for Alice
            assert.true(hasThoughtfulTag || suggestion.score >= 7,
                'Thoughtful suggestions should have appropriate tags or good ratings');
        }
    });
});

runner.test('Get suggestions with nostalgic mood', async () => {
    await multiUser.performAsUser('bob', async () => {
        const suggestions = await suggestionEngine.getSuggestions('test-user-bob', 'nostalgic', 3);

        // Nostalgic mood should prioritize rewatchable movies regardless of genre
        for (const suggestion of suggestions) {
            // Check if the user marked it as rewatchable (from test data)
            const reviews = await mockStorage.getReviewsForUser('test-user-bob');
            const userReview = reviews.find((r: any) => r.movieId === suggestion.movie.id);

            if (userReview) {
                assert.equal(userReview.rewatchable, true, 'Nostalgic suggestions should be rewatchable');
            }
        }
    });
});

runner.test('Get suggestions with invalid mood defaults to relaxing', async () => {
    await multiUser.performAsUser('alice', async () => {
        const suggestions = await suggestionEngine.getSuggestions('test-user-alice', 'invalid-mood', 2);

        // Should still return suggestions (defaults to relaxing profile)
        assert.true(Array.isArray(suggestions), 'Should handle invalid mood gracefully');

        // Should default to relaxing mood behavior
        for (const suggestion of suggestions) {
            assert.hasProperty(suggestion, 'movie', 'Should still have movie suggestions');
            assert.hasProperty(suggestion, 'confidence', 'Should still have confidence scores');
        }
    });
});

runner.test('Suggestion algorithm bias prevention', async () => {
    await multiUser.performAsUser('alice', async () => {
        // Test with multiple mood requests to check for diversity
        const moods = ['relaxing', 'exciting', 'thoughtful'];
        const allSuggestions = new Map();

        for (const mood of moods) {
            const suggestions = await suggestionEngine.getSuggestions('test-user-alice', mood, 5);
            allSuggestions.set(mood, suggestions);
        }

        // Verify different moods produce different suggestions
        const relaxingSuggestions = allSuggestions.get('relaxing');
        const excitingSuggestions = allSuggestions.get('exciting');

        if (relaxingSuggestions.length > 0 && excitingSuggestions.length > 0) {
            const overlap = relaxingSuggestions.filter((r: any) =>
                excitingSuggestions.some((e: any) => e.movie.id === r.movie.id)
            ).length;

            const maxOverlap = Math.min(relaxingSuggestions.length, excitingSuggestions.length) * 0.7;
            assert.true(overlap <= maxOverlap,
                'Different moods should produce sufficiently different suggestions');
        }
    });
});

runner.test('Suggestion scoring based on rating', async () => {
    await multiUser.performAsUser('alice', async () => {
        const suggestions = await suggestionEngine.getSuggestions('test-user-alice', 'relaxing', 10);

        // Suggestions should be sorted by score (descending)
        for (let i = 1; i < suggestions.length; i++) {
            assert.true(suggestions[i - 1].score >= suggestions[i].score,
                'Suggestions should be sorted by score descending');
        }

        // Higher rated movies should generally have higher scores
        for (const suggestion of suggestions) {
            const reviews = await mockStorage.getReviewsForUser('test-user-alice');
            const userReview = reviews.find((r: any) => r.movieId === suggestion.movie.id);

            if (userReview) {
                // Base score should be at least the rating
                assert.true(suggestion.score >= userReview.rating,
                    'Suggestion score should be at least the user rating');
            }
        }
    });
});

runner.test('Suggestion mood boost scoring', async () => {
    await multiUser.performAsUser('alice', async () => {
        // Get suggestions for specific mood
        const suggestions = await suggestionEngine.getSuggestions('test-user-alice', 'thoughtful', 5);

        for (const suggestion of suggestions) {
            // Check if the reason includes mood-related boost
            const reviews = await mockStorage.getReviewsForUser('test-user-alice');
            const userReview = reviews.find((r: any) => r.movieId === suggestion.movie.id);

            if (userReview && userReview.mood === 'thoughtful') {
                assert.true(suggestion.reason.includes('mood match'),
                    'Suggestions should indicate mood match bonus');

                // Score should be boosted above the base rating
                assert.true(suggestion.score > userReview.rating,
                    'Mood match should boost score above base rating');
            }
        }
    });
});

runner.test('Genre preference boost in suggestions', async () => {
    await multiUser.performAsUser('alice', async () => {
        // Test with comedy-preferring mood (relaxing)
        const suggestions = await suggestionEngine.getSuggestions('test-user-alice', 'relaxing', 5);

        for (const suggestion of suggestions) {
            const movie = suggestion.movie;

            // If movie has comedy/romance tag (relaxing preferences)
            const hasPreferredTag = movie.tags?.some(t =>
                ['comedy', 'romance', 'family'].includes(t.toLowerCase())
            );

            if (hasPreferredTag) {
                assert.true(suggestion.reason.includes('tag match'),
                    'Tag matches should be indicated in reason');
            }
        }
    });
});

runner.test('Rewatchability boost for appropriate moods', async () => {
    await multiUser.performAsUser('bob', async () => {
        // Nostalgic mood should boost rewatchable movies
        const suggestions = await suggestionEngine.getSuggestions('test-user-bob', 'nostalgic', 5);

        for (const suggestion of suggestions) {
            const reviews = await mockStorage.getReviewsForUser('test-user-bob');
            const userReview = reviews.find((r: any) => r.movieId === suggestion.movie.id);

            if (userReview && userReview.rewatchable === true) {
                assert.true(suggestion.reason.includes('rewatchable'),
                    'Rewatchable movies should get boost for nostalgic mood');
            }
        }
    });
});

runner.test('Suggestions only include user-watched movies', async () => {
    await multiUser.performAsUser('charlie', async () => {
        const suggestions = await suggestionEngine.getSuggestions('test-user-charlie', 'thoughtful', 10);

        const charlieReviews = await mockStorage.getReviewsForUser('test-user-charlie');
        const charlieMovieIds = new Set(charlieReviews.map((r: any) => r.movieId));

        // All suggestions should be movies Charlie has reviewed
        for (const suggestion of suggestions) {
            assert.true(charlieMovieIds.has(suggestion.movie.id),
                'Suggestions should only include movies the user has watched');
        }
    });
});

runner.test('Rating threshold filtering', async () => {
    await multiUser.performAsUser('alice', async () => {
        // Exciting mood has rating threshold of 8
        const suggestions = await suggestionEngine.getSuggestions('test-user-alice', 'exciting', 10);

        const aliceReviews = await mockStorage.getReviewsForUser('test-user-alice');

        for (const suggestion of suggestions) {
            const userReview = aliceReviews.find((r: any) => r.movieId === suggestion.movie.id);

            if (userReview) {
                // For exciting mood, should meet high rating threshold (8) or have appropriate tag
                const hasExcitingTag = suggestion.movie.tags?.some((t: string) =>
                    ['action', 'adventure', 'thriller'].includes(t.toLowerCase())
                );

                assert.true(userReview.rating >= 7 || hasExcitingTag,
                    'Suggestions should meet rating threshold or have appropriate tag');
            }
        }
    });
});

runner.test('Empty suggestions for user with no reviews', async () => {
    // Create a new user with no reviews
    const suggestions = await suggestionEngine.getSuggestions('test-user-no-reviews', 'relaxing', 5);

    assert.true(Array.isArray(suggestions), 'Should return empty array for user with no reviews');
    assert.equal(suggestions.length, 0, 'Should return no suggestions for user with no reviews');
});

runner.test('Error handling in suggestion generation', async () => {
    // Test with invalid user ID
    const suggestions = await suggestionEngine.getSuggestions('', 'relaxing', 5);

    assert.true(Array.isArray(suggestions), 'Should handle errors gracefully');
    assert.equal(suggestions.length, 0, 'Should return empty array on error');
});

runner.test('Confidence score calculation', async () => {
    await multiUser.performAsUser('alice', async () => {
        const suggestions = await suggestionEngine.getSuggestions('test-user-alice', 'relaxing', 5);

        for (const suggestion of suggestions) {
            // Confidence should be reasonable percentage of score, capped at 100
            const expectedConfidence = Math.min(100, Math.round((suggestion.score / 10) * 100));
            assert.equal(suggestion.confidence, expectedConfidence,
                'Confidence should be calculated as percentage of score/10');

            // Confidence should never exceed 100
            assert.true(suggestion.confidence <= 100,
                'Confidence should never exceed 100');
        }
    });
});

runner.test('Mood profile retrieval', async () => {
    // Test internal mood profile logic (accessing private method for testing)
    const engine = suggestionEngine as any;

    const relaxingProfile = engine.getMoodProfile('relaxing');
    assert.equal(relaxingProfile.mood, 'relaxing', 'Should return correct mood');
    assert.true(relaxingProfile.preferredTags.includes('comedy'), 'Relaxing should prefer comedy');
    assert.equal(relaxingProfile.rewatchableOnly, true, 'Relaxing should prefer rewatchable movies');
    assert.equal(relaxingProfile.ratingThreshold, 7, 'Relaxing should have rating threshold of 7');

    const excitingProfile = engine.getMoodProfile('exciting');
    assert.equal(excitingProfile.mood, 'exciting', 'Should return correct mood');
    assert.true(excitingProfile.preferredTags.includes('action'), 'Exciting should prefer action');
    assert.equal(excitingProfile.rewatchableOnly, false, 'Exciting should not require rewatchable');
    assert.equal(excitingProfile.ratingThreshold, 8, 'Exciting should have rating threshold of 8');

    const thoughtfulProfile = engine.getMoodProfile('thoughtful');
    assert.equal(thoughtfulProfile.mood, 'thoughtful', 'Should return correct mood');
    assert.true(thoughtfulProfile.preferredTags.includes('drama'), 'Thoughtful should prefer drama');

    const nostalgicProfile = engine.getMoodProfile('nostalgic');
    assert.equal(nostalgicProfile.mood, 'nostalgic', 'Should return correct mood');
    assert.equal(nostalgicProfile.rewatchableOnly, true, 'Nostalgic should prefer rewatchable');
    assert.equal(nostalgicProfile.ratingThreshold, 6, 'Nostalgic should have lower rating threshold');
});

// Run the tests
runner.run().then(results => {
    multiUser.cleanup();

    const failed = results.filter(r => !r.passed).length;
    process.exit(failed > 0 ? 1 : 0);
}).catch(error => {
    console.error('Suggestion engine test suite failed:', error);
    multiUser.cleanup();
    process.exit(1);
}); 