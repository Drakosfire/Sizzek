// src/movie-manager.ts

import { MovieStorageInterface } from './storage/StorageInterface.js';
import { UserManager } from './user-manager.js';
import { Movie, MovieWithUserData, MovieFilters } from './models/Movie.js';
import { Review } from './models/Review.js';
import { AlwaysMovieVote } from './models/AlwaysMovie.js';
import { AddMovieRequest, AddMovieResponse, AddReviewRequest, AddReviewResponse } from './models/RequestResponse.js';

export class MovieManager {
    constructor(
        private storage: MovieStorageInterface,
        private userManager: UserManager
    ) { }

    async addMovie(movieData: AddMovieRequest, userId: string): Promise<AddMovieResponse> {
        try {
            // Validate user
            if (!this.userManager.validateUserId(userId)) {
                return {
                    success: false,
                    message: 'Invalid user ID'
                };
            }

            // Check for duplicates
            const duplicates = await this.findPotentialDuplicates(
                movieData.title, movieData.year, movieData.director
            );

            if (duplicates.length > 0) {
                return {
                    success: false,
                    message: 'Potential duplicate found',
                    potentialDuplicates: duplicates,
                    requiresConfirmation: true
                };
            }

            // Add the movie
            const movie = await this.storage.addMovie({
                ...movieData,
                addedBy: userId
            });

            return {
                success: true,
                message: 'Movie added successfully',
                movie
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    async getMoviesForUser(userId: string, filters?: MovieFilters): Promise<MovieWithUserData[]> {
        const sharedJournalContext = await this.storage.getSharedJournalContext(userId);
        const journalMembers = sharedJournalContext.journalMembers;

        const movies = await this.storage.getMovies(filters);
        const userReviews = await this.storage.getReviewsForUser(userId);

        return Promise.all(movies.map(async movie => {
            const movieReviews = await this.storage.getReviewsForMovie(movie.id);
            const alwaysMovieVotes = await this.storage.getAlwaysMovieVotes(movie.id);
            const userReview = userReviews.find(r => r.movieId === movie.id);

            // Filter reviews to only include those from journal members
            const journalReviews = movieReviews.filter(review =>
                journalMembers.includes(review.userId)
            );

            // Filter votes to only include those from journal members
            const journalVotes = alwaysMovieVotes.filter(vote =>
                journalMembers.includes(vote.userId)
            );

            return {
                ...movie,
                userReview,
                totalReviews: journalReviews.length,
                averageRating: this.calculateAverageRating(journalReviews),
                isAlwaysMovie: this.calculateAlwaysMovieStatus(journalVotes, journalMembers),
                alwaysMovieVotes: journalVotes,
                journalReviews,
                sharedJournalContext
            };
        }));
    }

    async addReview(reviewData: AddReviewRequest, userId: string): Promise<AddReviewResponse> {
        try {
            // Validate user
            if (!this.userManager.validateUserId(userId)) {
                return {
                    success: false
                };
            }

            // Validate movie exists
            const movie = await this.storage.getMovieById(reviewData.movieId);
            if (!movie) {
                return {
                    success: false
                };
            }

            // Validate rating
            if (reviewData.rating < 1 || reviewData.rating > 10) {
                return {
                    success: false
                };
            }

            const review = await this.storage.addReview({
                ...reviewData,
                userId
            });

            return {
                success: true,
                review
            };
        } catch (error) {
            return {
                success: false
            };
        }
    }

    async voteAlwaysMovie(movieId: string, vote: boolean, userId: string, reason?: string): Promise<any> {
        try {
            // Validate user
            if (!this.userManager.validateUserId(userId)) {
                return {
                    success: false,
                    message: 'Invalid user ID'
                };
            }

            // Validate movie exists
            const movie = await this.storage.getMovieById(movieId);
            if (!movie) {
                return {
                    success: false,
                    message: 'Movie not found'
                };
            }

            // Add or update vote
            const alwaysMovieVote = await this.storage.addAlwaysMovieVote({
                movieId,
                userId,
                vote,
                reason
            });

            // Check if movie now qualifies as "Always Movie"
            const allVotes = await this.storage.getAlwaysMovieVotes(movieId);
            const sharedJournalContext = await this.storage.getSharedJournalContext(userId);
            const isAlwaysMovie = this.calculateAlwaysMovieStatus(allVotes, sharedJournalContext.journalMembers);

            return {
                success: true,
                vote: alwaysMovieVote,
                isAlwaysMovie,
                message: `Vote recorded. Movie ${isAlwaysMovie ? 'is now' : 'is not'} an "Always Movie"`
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    async getAlwaysMovies(userId: string): Promise<any> {
        try {
            const movies = await this.getMoviesForUser(userId);
            const alwaysMovies = movies.filter(movie => movie.isAlwaysMovie);

            return {
                success: true,
                movies: alwaysMovies,
                count: alwaysMovies.length
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    async shareJournalWithUser(userId: string, targetUserId: string, journalName?: string): Promise<any> {
        try {
            // Validate users
            if (!this.userManager.validateUserId(userId) || !this.userManager.validateUserId(targetUserId)) {
                return {
                    success: false,
                    message: 'Invalid user ID'
                };
            }

            if (userId === targetUserId) {
                return {
                    success: false,
                    message: 'Cannot share journal with yourself'
                };
            }

            const currentSharing = await this.storage.getJournalSharing(userId) || {
                userId,
                sharedWith: [],
                sharedBy: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (currentSharing.sharedWith.includes(targetUserId)) {
                return {
                    success: false,
                    message: 'Journal is already shared with this user'
                };
            }

            currentSharing.sharedWith.push(targetUserId);
            if (journalName) currentSharing.journalName = journalName;
            currentSharing.updatedAt = new Date().toISOString();

            await this.storage.updateJournalSharing(userId, currentSharing);

            // Update target user's sharing record
            const targetSharing = await this.storage.getJournalSharing(targetUserId) || {
                userId: targetUserId,
                sharedWith: [],
                sharedBy: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            targetSharing.sharedBy.push(userId);
            targetSharing.updatedAt = new Date().toISOString();

            await this.storage.updateJournalSharing(targetUserId, targetSharing);

            return {
                success: true,
                message: `Journal successfully shared with user ${targetUserId}`,
                sharedJournalContext: await this.storage.getSharedJournalContext(userId)
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    async getSharedJournalInfo(userId: string): Promise<any> {
        try {
            const sharedJournalContext = await this.storage.getSharedJournalContext(userId);
            const journalSharing = await this.storage.getJournalSharing(userId);

            return {
                success: true,
                journalContext: sharedJournalContext,
                sharingDetails: journalSharing
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    async removeJournalSharing(userId: string, targetUserId: string): Promise<any> {
        try {
            const currentSharing = await this.storage.getJournalSharing(userId);

            if (!currentSharing || !currentSharing.sharedWith.includes(targetUserId)) {
                return {
                    success: false,
                    message: 'Journal is not shared with this user'
                };
            }

            currentSharing.sharedWith = currentSharing.sharedWith.filter((id: string) => id !== targetUserId);
            currentSharing.updatedAt = new Date().toISOString();

            await this.storage.updateJournalSharing(userId, currentSharing);

            // Update target user's sharing record
            const targetSharing = await this.storage.getJournalSharing(targetUserId);
            if (targetSharing) {
                targetSharing.sharedBy = targetSharing.sharedBy.filter((id: string) => id !== userId);
                targetSharing.updatedAt = new Date().toISOString();
                await this.storage.updateJournalSharing(targetUserId, targetSharing);
            }

            return {
                success: true,
                message: `Journal sharing with user ${targetUserId} has been removed`
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    async updateMovie(movieId: string, updates: Partial<Movie>, userId: string): Promise<any> {
        try {
            // Validate user has permission to update
            const movie = await this.storage.getMovieById(movieId);
            if (!movie) {
                return { success: false, message: 'Movie not found' };
            }

            // Optional: Check if user added the movie or has admin rights
            if (movie.addedBy !== userId) {
                return { success: false, message: 'You can only update movies you added' };
            }

            const updatedMovie = await this.storage.updateMovie(movieId, updates);

            return {
                success: true,
                message: 'Movie updated successfully',
                movie: updatedMovie
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    async deleteMovie(movieId: string, userId: string): Promise<any> {
        try {
            const movie = await this.storage.getMovieById(movieId);
            if (!movie) {
                return { success: false, message: 'Movie not found' };
            }
            // Only allow the user who added the movie to delete
            if (movie.addedBy !== userId) {
                return { success: false, message: 'You can only delete movies you added' };
            }
            const result = await this.storage.deleteMovie(movieId);
            if (!result) {
                return { success: false, message: 'Failed to delete movie' };
            }
            return { success: true, message: 'Movie deleted successfully' };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    private async findPotentialDuplicates(title: string, year: number, director: string): Promise<Movie[]> {
        const allMovies = await this.storage.getMovies();

        return allMovies.filter(movie => {
            const titleSimilarity = this.calculateStringSimilarity(
                movie.title.toLowerCase(), title.toLowerCase()
            );
            const yearMatch = Math.abs(movie.year - year) <= 1;
            const directorMatch = movie.director.toLowerCase() === director.toLowerCase();

            return titleSimilarity > 0.8 && (yearMatch || directorMatch);
        });
    }

    private calculateStringSimilarity(str1: string, str2: string): number {
        // Handle exact case-insensitive matches first
        if (str1.toLowerCase() === str2.toLowerCase()) {
            return 1.0;
        }

        // Modified Jaccard similarity with higher weight for matches
        const set1 = new Set(str1.toLowerCase().split(' '));
        const set2 = new Set(str2.toLowerCase().split(' '));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        // Give higher weight to matches - use min of sets as denominator when appropriate
        const jaccard = intersection.size / union.size;
        const overlap = intersection.size / Math.min(set1.size, set2.size);

        // Return the higher of the two metrics
        return Math.max(jaccard, overlap);
    }

    private calculateAverageRating(reviews: Review[]): number {
        if (reviews.length === 0) return 0;
        const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
        return Math.round((sum / reviews.length) * 10) / 10;
    }

    private calculateAlwaysMovieStatus(votes: AlwaysMovieVote[], journalMembers: string[]): boolean {
        if (votes.length === 0) return false;

        const uniqueVoters = new Set(votes.map(v => v.userId));
        const positiveVotes = votes.filter(v => v.vote).length;

        // Require unanimous positive votes from ALL journal members
        const allJournalMembersVoted = journalMembers.every(memberId => uniqueVoters.has(memberId));
        const allVotesPositive = votes.every(v => v.vote);

        return allJournalMembersVoted && allVotesPositive && positiveVotes > 0;
    }
} 