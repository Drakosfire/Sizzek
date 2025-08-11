// tests/helpers/movie-test-data.ts

import { Movie } from '../../src/models/Movie.js';
import { Review } from '../../src/models/Review.js';
import { AlwaysMovieVote } from '../../src/models/AlwaysMovie.js';
import { MovieStorageInterface } from '../../src/storage/StorageInterface.js';

export class MovieTestDataManager {
    generateTestMovies(): Movie[] {
        return [
            {
                id: 'test-movie-1',
                title: 'The Grand Adventure',
                year: 2023,
                director: 'Jane Director',
                genre: ['action', 'adventure'],
                addedBy: 'test-user-alice',
                addedAt: '2023-01-01T00:00:00Z',
                updatedAt: '2023-01-01T00:00:00Z'
            },
            {
                id: 'test-movie-2',
                title: 'Romantic Evening',
                year: 2022,
                director: 'John Romance',
                genre: ['romance', 'comedy'],
                addedBy: 'test-user-bob',
                addedAt: '2023-01-02T00:00:00Z',
                updatedAt: '2023-01-02T00:00:00Z'
            },
            {
                id: 'test-movie-3',
                title: 'Mind Bender',
                year: 2021,
                director: 'Alex Thoughtful',
                genre: ['drama', 'sci-fi'],
                addedBy: 'test-user-alice',
                addedAt: '2023-01-03T00:00:00Z',
                updatedAt: '2023-01-03T00:00:00Z'
            },
            {
                id: 'test-movie-4',
                title: 'Family Fun Time',
                year: 2020,
                director: 'Mary Family',
                genre: ['family', 'animation'],
                addedBy: 'test-user-bob',
                addedAt: '2023-01-04T00:00:00Z',
                updatedAt: '2023-01-04T00:00:00Z'
            },
            {
                id: 'test-movie-5',
                title: 'Charlie\'s Secret',
                year: 2023,
                director: 'Secret Director',
                genre: ['mystery', 'drama'],
                addedBy: 'test-user-charlie',
                addedAt: '2023-01-05T00:00:00Z',
                updatedAt: '2023-01-05T00:00:00Z'
            }
        ];
    }

    generateTestReviews(): Review[] {
        return [
            // Alice's reviews
            {
                id: 'test-review-1',
                movieId: 'test-movie-1',
                userId: 'test-user-alice',
                rating: 9,
                review: 'Amazing action sequences! Loved every minute.',
                watchedDate: '2023-01-05T00:00:00Z',
                mood: 'exciting',
                rewatchable: true,
                createdAt: '2023-01-05T00:00:00Z',
                updatedAt: '2023-01-05T00:00:00Z'
            },
            {
                id: 'test-review-2',
                movieId: 'test-movie-2',
                userId: 'test-user-alice',
                rating: 8,
                review: 'Sweet romantic story, perfect for date night.',
                watchedDate: '2023-01-06T00:00:00Z',
                mood: 'relaxing',
                rewatchable: true,
                createdAt: '2023-01-06T00:00:00Z',
                updatedAt: '2023-01-06T00:00:00Z'
            },
            {
                id: 'test-review-3',
                movieId: 'test-movie-3',
                userId: 'test-user-alice',
                rating: 10,
                review: 'Mind-blowing! Made me think for days.',
                watchedDate: '2023-01-07T00:00:00Z',
                mood: 'thoughtful',
                rewatchable: true,
                createdAt: '2023-01-07T00:00:00Z',
                updatedAt: '2023-01-07T00:00:00Z'
            },

            // Bob's reviews (overlapping with Alice's shared journal)
            {
                id: 'test-review-4',
                movieId: 'test-movie-1',
                userId: 'test-user-bob',
                rating: 7,
                review: 'Good action but too long for my taste.',
                watchedDate: '2023-01-08T00:00:00Z',
                mood: 'exciting',
                rewatchable: false,
                createdAt: '2023-01-08T00:00:00Z',
                updatedAt: '2023-01-08T00:00:00Z'
            },
            {
                id: 'test-review-5',
                movieId: 'test-movie-2',
                userId: 'test-user-bob',
                rating: 9,
                review: 'Perfect romantic comedy! Great chemistry.',
                watchedDate: '2023-01-09T00:00:00Z',
                mood: 'relaxing',
                rewatchable: true,
                createdAt: '2023-01-09T00:00:00Z',
                updatedAt: '2023-01-09T00:00:00Z'
            },
            {
                id: 'test-review-6',
                movieId: 'test-movie-4',
                userId: 'test-user-bob',
                rating: 6,
                review: 'Okay for kids, but not my style.',
                watchedDate: '2023-01-10T00:00:00Z',
                mood: 'relaxing',
                rewatchable: false,
                createdAt: '2023-01-10T00:00:00Z',
                updatedAt: '2023-01-10T00:00:00Z'
            },

            // Charlie's reviews (separate journal)
            {
                id: 'test-review-7',
                movieId: 'test-movie-5',
                userId: 'test-user-charlie',
                rating: 8,
                review: 'Intriguing mystery with great plot twists.',
                watchedDate: '2023-01-11T00:00:00Z',
                mood: 'thoughtful',
                rewatchable: true,
                createdAt: '2023-01-11T00:00:00Z',
                updatedAt: '2023-01-11T00:00:00Z'
            },
            {
                id: 'test-review-8',
                movieId: 'test-movie-3',
                userId: 'test-user-charlie',
                rating: 9,
                review: 'Brilliant sci-fi drama. Highly recommended.',
                watchedDate: '2023-01-12T00:00:00Z',
                mood: 'thoughtful',
                rewatchable: true,
                createdAt: '2023-01-12T00:00:00Z',
                updatedAt: '2023-01-12T00:00:00Z'
            }
        ];
    }

    generateTestAlwaysMovieVotes(): AlwaysMovieVote[] {
        return [
            // Both Alice and Bob vote for movie-2 (shared journal consensus)
            {
                id: 'test-vote-1',
                movieId: 'test-movie-2',
                userId: 'test-user-alice',
                vote: true,
                reason: 'Perfect comfort movie for any mood!',
                votedAt: '2023-01-15T00:00:00Z'
            },
            {
                id: 'test-vote-2',
                movieId: 'test-movie-2',
                userId: 'test-user-bob',
                vote: true,
                reason: 'Great for date nights and relaxing.',
                votedAt: '2023-01-15T01:00:00Z'
            },

            // Only Alice votes for movie-3 (no consensus yet)
            {
                id: 'test-vote-3',
                movieId: 'test-movie-3',
                userId: 'test-user-alice',
                vote: true,
                reason: 'Intellectually stimulating and rewatchable.',
                votedAt: '2023-01-16T00:00:00Z'
            },

            // Charlie votes in his separate journal
            {
                id: 'test-vote-4',
                movieId: 'test-movie-5',
                userId: 'test-user-charlie',
                vote: true,
                reason: 'Great standalone mystery.',
                votedAt: '2023-01-17T00:00:00Z'
            },

            // Mixed votes for movie-1 (no consensus)
            {
                id: 'test-vote-5',
                movieId: 'test-movie-1',
                userId: 'test-user-alice',
                vote: true,
                reason: 'Love the action sequences.',
                votedAt: '2023-01-18T00:00:00Z'
            },
            {
                id: 'test-vote-6',
                movieId: 'test-movie-1',
                userId: 'test-user-bob',
                vote: false,
                reason: 'Too long and repetitive.',
                votedAt: '2023-01-18T01:00:00Z'
            }
        ];
    }

    generateDuplicateTestMovies(): Movie[] {
        return [
            {
                id: 'duplicate-test-1',
                title: 'Inception',
                year: 2010,
                director: 'Christopher Nolan',
                genre: ['sci-fi', 'thriller'],
                addedBy: 'test-user-alice',
                addedAt: '2023-01-01T00:00:00Z',
                updatedAt: '2023-01-01T00:00:00Z'
            },
            {
                id: 'duplicate-test-2',
                title: 'The Matrix',
                year: 1999,
                director: 'The Wachowskis',
                genre: ['sci-fi', 'action'],
                addedBy: 'test-user-bob',
                addedAt: '2023-01-02T00:00:00Z',
                updatedAt: '2023-01-02T00:00:00Z'
            }
        ];
    }

    generatePerformanceTestData(movieCount: number, reviewCount: number): { movies: Movie[], reviews: Review[] } {
        const movies: Movie[] = [];
        const reviews: Review[] = [];
        const users = ['test-user-alice', 'test-user-bob', 'test-user-charlie'];
        const genres = ['action', 'comedy', 'drama', 'horror', 'romance', 'sci-fi', 'thriller'];
        const moods = ['exciting', 'relaxing', 'thoughtful', 'nostalgic'];

        // Generate movies
        for (let i = 1; i <= movieCount; i++) {
            movies.push({
                id: `perf-movie-${i}`,
                title: `Performance Test Movie ${i}`,
                year: 1980 + (i % 44), // 1980-2023
                director: `Director ${i % 20}`,
                genre: [genres[i % genres.length], genres[(i + 1) % genres.length]],
                addedBy: users[i % users.length],
                addedAt: new Date(2023, 0, i % 28 + 1).toISOString(),
                updatedAt: new Date(2023, 0, i % 28 + 1).toISOString()
            });
        }

        // Generate reviews
        for (let i = 1; i <= reviewCount; i++) {
            const movieId = `perf-movie-${(i % movieCount) + 1}`;
            const userId = users[i % users.length];

            reviews.push({
                id: `perf-review-${i}`,
                movieId,
                userId,
                rating: (i % 10) + 1, // 1-10
                review: `Performance test review ${i}. This is a longer review to test with realistic data sizes.`,
                watchedDate: new Date(2023, 0, (i % 28) + 1).toISOString(),
                mood: moods[i % moods.length],
                rewatchable: i % 3 === 0, // 1/3 are rewatchable
                createdAt: new Date(2023, 0, (i % 28) + 1, i % 24).toISOString(),
                updatedAt: new Date(2023, 0, (i % 28) + 1, i % 24).toISOString()
            });
        }

        return { movies, reviews };
    }

    async populateTestData(storage: MovieStorageInterface): Promise<void> {
        const movies = this.generateTestMovies();
        const reviews = this.generateTestReviews();
        const votes = this.generateTestAlwaysMovieVotes();

        // For mock storage, directly set the data to preserve predefined IDs
        if ('__setTestData' in storage) {
            const currentData = (storage as any).__getTestData();
            (storage as any).__setTestData({
                ...currentData,
                movies: [...currentData.movies, ...movies],
                reviews: [...currentData.reviews, ...reviews],
                votes: [...currentData.votes, ...votes]
            });
        } else {
            // For real storage, use the API (will generate new IDs)
            // Add movies
            for (const movie of movies) {
                try {
                    await storage.addMovie({
                        title: movie.title,
                        year: movie.year,
                        director: movie.director,
                        genre: movie.genre,
                        addedBy: movie.addedBy
                    });
                } catch (error) {
                    // Movie might already exist, that's okay for tests
                }
            }

            // Add reviews
            for (const review of reviews) {
                try {
                    await storage.addReview({
                        movieId: review.movieId,
                        userId: review.userId,
                        rating: review.rating,
                        review: review.review,
                        watchedDate: review.watchedDate,
                        mood: review.mood,
                        rewatchable: review.rewatchable
                    });
                } catch (error) {
                    // Review might already exist, that's okay for tests
                }
            }

            // Add always movie votes
            for (const vote of votes) {
                try {
                    await storage.addAlwaysMovieVote({
                        movieId: vote.movieId,
                        userId: vote.userId,
                        vote: vote.vote,
                        reason: vote.reason
                    });
                } catch (error) {
                    // Vote might already exist, that's okay for tests
                }
            }
        }
    }

    async populatePerformanceTestData(storage: MovieStorageInterface, movieCount: number = 100, reviewCount: number = 500): Promise<void> {
        const { movies, reviews } = this.generatePerformanceTestData(movieCount, reviewCount);

        console.log(`Populating ${movies.length} movies and ${reviews.length} reviews for performance testing...`);

        // Add movies in batches
        const batchSize = 10;
        for (let i = 0; i < movies.length; i += batchSize) {
            const batch = movies.slice(i, i + batchSize);
            await Promise.all(batch.map(movie =>
                storage.addMovie({
                    title: movie.title,
                    year: movie.year,
                    director: movie.director,
                    genre: movie.genre,
                    addedBy: movie.addedBy
                })
            ));
        }

        // Add reviews in batches
        for (let i = 0; i < reviews.length; i += batchSize) {
            const batch = reviews.slice(i, i + batchSize);
            await Promise.all(batch.map(review =>
                storage.addReview({
                    movieId: review.movieId,
                    userId: review.userId,
                    rating: review.rating,
                    review: review.review,
                    watchedDate: review.watchedDate,
                    mood: review.mood,
                    rewatchable: review.rewatchable
                })
            ));
        }

        console.log('Performance test data populated successfully.');
    }

    getTestMovieIds(): string[] {
        return this.generateTestMovies().map(m => m.id);
    }

    getSharedJournalMovieIds(): string[] {
        // Movies that Alice and Bob both have access to
        return ['test-movie-1', 'test-movie-2', 'test-movie-3', 'test-movie-4'];
    }

    getCharlieSeparateMovieIds(): string[] {
        // Movies only Charlie has access to
        return ['test-movie-5'];
    }

    getAlwaysMovieIds(): string[] {
        // Movies that should be marked as "Always Movies" based on test votes
        return ['test-movie-2']; // Only movie with unanimous positive votes from Alice & Bob
    }
} 