import { MovieStorageInterface } from './storage/StorageInterface.js';
import { Movie, MovieSuggestion, ScoredMovie } from './models/Movie.js';
import { Review } from './models/Review.js';
import { MoodProfile } from './models/User.js';

export class MovieSuggestionEngine {
    constructor(private storage: MovieStorageInterface) { }

    async getSuggestions(userId: string, mood: string, count: number = 5): Promise<MovieSuggestion[]> {
        try {
            const userReviews = await this.storage.getReviewsForUser(userId);
            const allMovies = await this.storage.getMovies();

            const moodProfile = this.getMoodProfile(mood);
            const candidates = this.filterMoviesByMood(allMovies, userReviews, moodProfile);
            const scored = this.scoreMovies(candidates, userReviews, moodProfile);

            return scored
                .sort((a, b) => b.score - a.score)
                .slice(0, count)
                .map(item => ({
                    movie: item.movie,
                    score: item.score,
                    reason: item.reason,
                    confidence: Math.min(100, Math.round((item.score / 10) * 100))
                }));
        } catch (error) {
            console.error('Error generating suggestions:', error);
            return [];
        }
    }

    private getMoodProfile(mood: string): MoodProfile {
        const profiles: Record<string, MoodProfile> = {
            relaxing: {
                mood,
                preferredTags: ['comedy', 'romance', 'family', 'feel-good', 'lighthearted'],
                ratingThreshold: 7,
                rewatchableOnly: true
            },
            exciting: {
                mood,
                preferredTags: ['action', 'thriller', 'adventure', 'adrenaline', 'intense'],
                ratingThreshold: 8,
                rewatchableOnly: false
            },
            thoughtful: {
                mood,
                preferredTags: ['drama', 'documentary', 'philosophical', 'thought-provoking', 'deep'],
                ratingThreshold: 7,
                rewatchableOnly: false
            },
            nostalgic: {
                mood,
                preferredTags: [],
                ratingThreshold: 6,
                rewatchableOnly: true
            }
        };

        return profiles[mood] || profiles['relaxing'];
    }

    private filterMoviesByMood(
        movies: Movie[],
        userReviews: Review[],
        moodProfile: MoodProfile
    ): Movie[] {
        const userMovieIds = new Set(userReviews.map(r => r.movieId));

        return movies.filter(movie => {
            // Must have been watched by user
            if (!userMovieIds.has(movie.id)) return false;

            const userReview = userReviews.find(r => r.movieId === movie.id);
            if (!userReview) return false;

            // Rating threshold
            if (userReview.rating < moodProfile.ratingThreshold) return false;

            // Rewatchable requirement
            if (moodProfile.rewatchableOnly && !userReview.rewatchable) return false;

            // Tag preference
            if (moodProfile.preferredTags.length > 0 && movie.tags) {
                const hasPreferredTag = movie.tags.some(t =>
                    moodProfile.preferredTags.some(pt =>
                        t.toLowerCase().includes(pt.toLowerCase())
                    )
                );
                if (!hasPreferredTag) return false;
            }

            return true;
        });
    }

    private scoreMovies(
        movies: Movie[],
        userReviews: Review[],
        moodProfile: MoodProfile
    ): ScoredMovie[] {
        return movies.map(movie => {
            const userReview = userReviews.find(r => r.movieId === movie.id)!;
            let score = userReview.rating; // Base score from rating
            let reason = `Rated ${userReview.rating}/10`;

            // Boost for exact mood match
            if (userReview.mood === moodProfile.mood) {
                score += 1.5;
                reason += `, perfect mood match`;
            }

            // Boost for preferred tags
            if (movie.tags && moodProfile.preferredTags.length > 0) {
                const tagMatches = movie.tags.filter(t =>
                    moodProfile.preferredTags.some(pt =>
                        t.toLowerCase().includes(pt.toLowerCase())
                    )
                ).length;
                score += tagMatches * 0.5;
                if (tagMatches > 0) reason += `, ${tagMatches} tag match(es)`;
            }

            // Boost for rewatchability when appropriate
            if (moodProfile.rewatchableOnly && userReview.rewatchable) {
                score += 0.5;
                reason += `, highly rewatchable`;
            }

            return { movie, score, reason };
        });
    }
} 