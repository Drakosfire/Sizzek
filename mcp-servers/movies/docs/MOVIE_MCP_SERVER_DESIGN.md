# Movies MCP Server - Detailed Design Document

**Date**: June 24, 2025  
**Project**: Multi-User Movie Journal MCP Server  
**Version**: 1.0.0 Design Specification  

---

## 🔧 Technical Implementation

### Core Data Models

#### Movie Entity
```typescript
// src/models/Movie.ts
export interface Movie {
    id: string;
    title: string;
    year: number;
    director: string;
    genre?: string[];
    addedBy: string;
    addedAt: string;
    updatedAt: string;
}

export interface MovieWithUserData extends Movie {
    userReview?: Review; // Current user's review
    totalReviews: number;
    averageRating: number;
    isAlwaysMovie: boolean;
    alwaysMovieVotes: AlwaysMovieVote[];
    journalReviews: Review[]; // All reviews from journal members
    sharedJournalContext: SharedJournalContext;
}
```

#### Review Entity
```typescript
// src/models/Review.ts - Simplified
export interface Review {
    id: string;
    movieId: string;
    userId: string;
    rating: number; // 1-10 scale
    review: string;
    watchedDate: string;
    mood?: string; // "relaxing", "exciting", "thoughtful", "nostalgic"
    rewatchable: boolean;
    createdAt: string;
    updatedAt: string;
}
```

#### User Preferences & Journal Sharing
```typescript
// src/models/User.ts
export interface UserPreferences {
    userId: string;
    favoriteGenres: string[];
    moodMappings: Record<string, MoodPreference>;
    ratingTendency: 'generous' | 'critical' | 'balanced';
    defaultPrivacy: 'private' | 'shared';
}

export interface MoodPreference {
    preferredGenres: string[];
    minRating: number;
    maxRecency: number; // Days since last watch
    allowRewatches: boolean;
}

export interface JournalSharing {
    userId: string;
    sharedWith: string[]; // Array of user IDs this journal is shared with
    sharedBy: string[]; // Array of user IDs who have shared their journal with this user
    journalName?: string; // Optional name for the shared journal (e.g., "John & Jane's Movies")
    createdAt: string;
    updatedAt: string;
}

export interface SharedJournalContext {
    journalMembers: string[]; // All users who share this journal
    journalName?: string;
    canAddMovies: boolean;
    canAddReviews: boolean;
    canVoteAlways: boolean;
}
```

#### Request/Response Types
```typescript
// src/models/RequestResponse.ts
export interface AddMovieRequest {
    title: string;
    year: number;
    director: string;
    genre?: string[];
}

export interface AddMovieResponse {
    success: boolean;
    message: string;
    movie?: Movie;
    potentialDuplicates?: Movie[];
    requiresConfirmation?: boolean;
}

export interface AddReviewRequest {
    movieId: string;
    rating: number;
    review: string;
    watchedDate: string;
    mood?: string;
    rewatchable: boolean;
}

export interface AddReviewResponse {
    success: boolean;
    review?: Review;
}

export interface MovieFilters {
    year?: number;
    director?: string;
    genre?: string[];
    addedBy?: string;
}

export interface MovieSuggestion {
    movie: Movie;
    score: number;
    reason: string;
    confidence: number;
}

export interface ScoredMovie {
    movie: Movie;
    score: number;
    reason: string;
}

export interface MoodProfile {
    mood: string;
    preferredGenres: string[];
    ratingThreshold: number;
    rewatchableOnly: boolean;
}
```

#### Always Movie Voting
```typescript
// src/models/AlwaysMovie.ts
export interface AlwaysMovieVote {
    id: string;
    movieId: string;
    userId: string;
    vote: boolean;
    reason?: string;
    votedAt: string;
}
```

---

## 🗄️ Storage Implementation

### Storage Interface
```typescript
// src/storage/StorageInterface.ts
export interface MovieStorageInterface {
    // Movie operations
    getMovies(filters?: MovieFilters): Promise<Movie[]>;
    getMovieById(id: string): Promise<Movie | null>;
    addMovie(movie: Omit<Movie, 'id' | 'addedAt' | 'updatedAt'>): Promise<Movie>;
    updateMovie(id: string, updates: Partial<Movie>): Promise<Movie>;
    deleteMovie(id: string): Promise<boolean>;
    
    // Review operations  
    getReviewsForMovie(movieId: string): Promise<Review[]>;
    getReviewsForUser(userId: string): Promise<Review[]>;
    addReview(review: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>): Promise<Review>;
    updateReview(id: string, updates: Partial<Review>): Promise<Review>;
    deleteReview(id: string): Promise<boolean>;
    

    
    // Always Movie operations
    getAlwaysMovieVotes(movieId: string): Promise<AlwaysMovieVote[]>;
    addAlwaysMovieVote(vote: Omit<AlwaysMovieVote, 'id' | 'votedAt'>): Promise<AlwaysMovieVote>;
    
    // User operations
    getUserPreferences(userId: string): Promise<UserPreferences | null>;
    updateUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences>;
    
    // Journal sharing operations
    getJournalSharing(userId: string): Promise<JournalSharing | null>;
    updateJournalSharing(userId: string, sharing: Partial<JournalSharing>): Promise<JournalSharing>;
    getSharedJournalMembers(userId: string): Promise<string[]>; // Returns all users who share journals with this user
    getSharedJournalContext(userId: string): Promise<SharedJournalContext>;
}
```

### JSON Storage Implementation
```typescript
// src/storage/JsonStorage.ts
export class JsonMovieStorage implements MovieStorageInterface {
    private moviesFile: string;
    private reviewsFile: string;
    private usersFile: string;
    private votesFile: string;

    constructor(baseDir: string = './data') {
        this.moviesFile = path.join(baseDir, 'movies.json');
        this.reviewsFile = path.join(baseDir, 'reviews.json');
        this.usersFile = path.join(baseDir, 'users.json');
        this.votesFile = path.join(baseDir, 'always-movie-votes.json');
    }

    async getMovies(filters?: MovieFilters): Promise<Movie[]> {
        const movies = await this.readJsonFile<Movie[]>(this.moviesFile, []);
        
        if (!filters) return movies;
        
        return movies.filter(movie => {
            if (filters.year && movie.year !== filters.year) return false;
            if (filters.director && !movie.director.toLowerCase().includes(filters.director.toLowerCase())) return false;
            if (filters.genre && !movie.genre?.some(g => filters.genre!.includes(g))) return false;
            if (filters.addedBy && movie.addedBy !== filters.addedBy) return false;
            return true;
        });
    }

    async addMovie(movieData: Omit<Movie, 'id' | 'addedAt' | 'updatedAt'>): Promise<Movie> {
        const movies = await this.getMovies();
        const now = new Date().toISOString();
        
        const movie: Movie = {
            ...movieData,
            id: this.generateId(),
            addedAt: now,
            updatedAt: now
        };
        
        movies.push(movie);
        await this.writeJsonFile(this.moviesFile, movies);
        return movie;
    }

    private async readJsonFile<T>(filename: string, defaultValue: T): Promise<T> {
        try {
            const data = await fs.readFile(filename, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return defaultValue;
        }
    }

    private async writeJsonFile<T>(filename: string, data: T): Promise<void> {
        await fs.mkdir(path.dirname(filename), { recursive: true });
        await fs.writeFile(filename, JSON.stringify(data, null, 2));
    }

    private generateId(): string {
        return `movie_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

### MongoDB Implementation
```typescript
// src/storage/MongodbStorage.ts
import { MongoClient, Db, Collection } from 'mongodb';

export class MongoMovieStorage implements MovieStorageInterface {
    private client: MongoClient;
    private db: Db;
    private movies: Collection<Movie>;
    private reviews: Collection<Review>;
    private users: Collection<UserPreferences>;
    private votes: Collection<AlwaysMovieVote>;

    constructor(connectionString: string, dbName: string = 'movies') {
        this.client = new MongoClient(connectionString);
    }

    async connect(): Promise<void> {
        await this.client.connect();
        this.db = this.client.db();
        this.movies = this.db.collection('movies');
        this.reviews = this.db.collection('reviews');
        this.users = this.db.collection('users');
        this.votes = this.db.collection('alwaysMovieVotes');

        // Create indexes for performance
        await this.createIndexes();
    }

    async getMovies(filters?: MovieFilters): Promise<Movie[]> {
        const query: any = {};
        
        if (filters?.year) query.year = filters.year;
        if (filters?.director) query.director = new RegExp(filters.director, 'i');
        if (filters?.genre) query.genre = { $in: filters.genre };
        if (filters?.addedBy) query.addedBy = filters.addedBy;
        
        return await this.movies.find(query).toArray();
    }

    async addMovie(movieData: Omit<Movie, 'id' | 'addedAt' | 'updatedAt'>): Promise<Movie> {
        const now = new Date().toISOString();
        const movie: Movie = {
            ...movieData,
            id: this.generateId(),
            addedAt: now,
            updatedAt: now
        };
        
        await this.movies.insertOne(movie);
        return movie;
    }

    private async createIndexes(): Promise<void> {
        // Movies indexes
        await this.movies.createIndex({ title: 1, year: 1 }); // Duplicate detection
        await this.movies.createIndex({ director: 1 });
        await this.movies.createIndex({ genre: 1 });
        await this.movies.createIndex({ addedBy: 1 });
        
        // Reviews indexes
        await this.reviews.createIndex({ movieId: 1 });
        await this.reviews.createIndex({ userId: 1 });
        await this.reviews.createIndex({ rating: 1 });
        await this.reviews.createIndex({ watchedDate: 1 });
        
        // Always Movie votes index
        await this.votes.createIndex({ movieId: 1, userId: 1 }, { unique: true });
    }
}
```

---

## 🎯 Core Business Logic

### Movie Manager
```typescript
// src/movie-manager.ts
export class MovieManager {
    constructor(
        private storage: MovieStorageInterface,
        private userManager: UserManager
    ) {}

    async addMovie(movieData: AddMovieRequest, userId: string): Promise<AddMovieResponse> {
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
                journalReviews, // Include all reviews from journal members
                sharedJournalContext
            };
        }));
    }
    
    async addReview(reviewData: AddReviewRequest, userId: string): Promise<AddReviewResponse> {
        const review = await this.storage.addReview({
            ...reviewData,
            userId
        });
        
        return {
            success: true,
            review
        };
    }
    
    async shareJournalWithUser(userId: string, targetUserId: string, journalName?: string): Promise<any> {
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
    }
    
    async getSharedJournalInfo(userId: string): Promise<any> {
        const sharedJournalContext = await this.storage.getSharedJournalContext(userId);
        const journalSharing = await this.storage.getJournalSharing(userId);
        
        return {
            success: true,
            journalContext: sharedJournalContext,
            sharingDetails: journalSharing
        };
    }
    
    async removeJournalSharing(userId: string, targetUserId: string): Promise<any> {
        const currentSharing = await this.storage.getJournalSharing(userId);
        
        if (!currentSharing || !currentSharing.sharedWith.includes(targetUserId)) {
            return {
                success: false,
                message: 'Journal is not shared with this user'
            };
        }
        
        currentSharing.sharedWith = currentSharing.sharedWith.filter(id => id !== targetUserId);
        currentSharing.updatedAt = new Date().toISOString();
        
        await this.storage.updateJournalSharing(userId, currentSharing);
        
        // Update target user's sharing record
        const targetSharing = await this.storage.getJournalSharing(targetUserId);
        if (targetSharing) {
            targetSharing.sharedBy = targetSharing.sharedBy.filter(id => id !== userId);
            targetSharing.updatedAt = new Date().toISOString();
            await this.storage.updateJournalSharing(targetUserId, targetSharing);
        }
        
        return {
            success: true,
            message: `Journal sharing with user ${targetUserId} has been removed`
        };
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
        // Simple Jaccard similarity - could be enhanced with Levenshtein distance
        const set1 = new Set(str1.split(' '));
        const set2 = new Set(str2.split(' '));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
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
```

### Suggestion Engine
```typescript
// src/suggestion-engine.ts
export class MovieSuggestionEngine {
    constructor(private storage: MovieStorageInterface) {}

    async getSuggestions(userId: string, mood: string, count: number = 5): Promise<MovieSuggestion[]> {
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
                confidence: Math.round((item.score / 10) * 100)
            }));
    }

    private getMoodProfile(mood: string): MoodProfile {
        const profiles: Record<string, MoodProfile> = {
            relaxing: {
                mood,
                preferredGenres: ['comedy', 'romance', 'family'],
                ratingThreshold: 7,
                rewatchableOnly: true
            },
            exciting: {
                mood,
                preferredGenres: ['action', 'thriller', 'adventure'],
                ratingThreshold: 8,
                rewatchableOnly: false
            },
            thoughtful: {
                mood,
                preferredGenres: ['drama', 'documentary'],
                ratingThreshold: 7,
                rewatchableOnly: false
            },
            nostalgic: {
                mood,
                preferredGenres: [],
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
            
            // Genre preference
            if (moodProfile.preferredGenres.length > 0 && movie.genre) {
                const hasPreferredGenre = movie.genre.some(g => 
                    moodProfile.preferredGenres.some(pg => 
                        g.toLowerCase().includes(pg.toLowerCase())
                    )
                );
                if (!hasPreferredGenre) return false;
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
            
            // Boost for preferred genres
            if (movie.genre && moodProfile.preferredGenres.length > 0) {
                const genreMatches = movie.genre.filter(g => 
                    moodProfile.preferredGenres.some(pg => 
                        g.toLowerCase().includes(pg.toLowerCase())
                    )
                ).length;
                score += genreMatches * 0.5;
                if (genreMatches > 0) reason += `, ${genreMatches} genre match(es)`;
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
```

---

## 🛠️ MCP Tools Implementation

### Tool Registration Pattern (REQUIRED)
All tools must be registered using a single handler for `CallToolRequestSchema`:
```typescript
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: createMovieTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params?.name;
  const params = request.params?.arguments || {};
  return await toolHandler(toolName, params);
});
```
**Never** register handlers by tool name string (e.g., `setRequestHandler('add_movie', ...)`).  
This ensures compatibility with the MCP SDK and LibreChat.

### Movie Tools
```typescript
// src/tools/movie-tools.ts
export function createMovieTools(manager: MovieManager): MCPTool[] {
    return [
        {
            name: 'add_movie',
            description: 'Add a new movie to the shared collection',
            inputSchema: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Movie title' },
                    year: { type: 'integer', description: 'Release year' },
                    director: { type: 'string', description: 'Director name' },
                    genre: { type: 'array', items: { type: 'string' }, description: 'Genres' }
                },
                required: ['title', 'year', 'director']
            }
        },
        {
            name: 'get_movies',
            description: 'Get movies with optional filtering',
            inputSchema: {
                type: 'object',
                properties: {
                    year: { type: 'integer', description: 'Filter by year' },
                    director: { type: 'string', description: 'Filter by director' },
                    genre: { type: 'array', items: { type: 'string' }, description: 'Filter by genre' }
                }
            }
        },
        {
            name: 'add_review',
            description: 'Add a personal review for a movie',
            inputSchema: {
                type: 'object',
                properties: {
                    movieId: { type: 'string', description: 'Movie ID' },
                    rating: { type: 'integer', minimum: 1, maximum: 10, description: 'Rating 1-10' },
                    review: { type: 'string', description: 'Written review' },
                    watchedDate: { type: 'string', description: 'Date watched (ISO string)' },
                    mood: { type: 'string', enum: ['relaxing', 'exciting', 'thoughtful', 'nostalgic'] },
                    rewatchable: { type: 'boolean', description: 'Would you rewatch this?' }
                },
                required: ['movieId', 'rating', 'review', 'watchedDate', 'rewatchable']
            }
        },
        {
            name: 'suggest_movies',
            description: 'Get movie suggestions based on mood',
            inputSchema: {
                type: 'object',
                properties: {
                    mood: { 
                        type: 'string', 
                        enum: ['relaxing', 'exciting', 'thoughtful', 'nostalgic'],
                        description: 'Current mood or vibe'
                    },
                    count: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
                },
                required: ['mood']
            }
        },
        {
            name: 'vote_always_movie',
            description: 'Vote on whether a movie should be marked as "Always Movie"',
            inputSchema: {
                type: 'object',
                properties: {
                    movieId: { type: 'string', description: 'Movie ID' },
                    vote: { type: 'boolean', description: 'True for yes, false for no' },
                    reason: { type: 'string', description: 'Optional reason for vote' }
                },
                required: ['movieId', 'vote']
            }
        },
        {
            name: 'get_always_movies',
            description: 'Get all movies marked as "Always Movies"',
            inputSchema: {
                type: 'object',
                properties: {}
            }
        },

        {
            name: 'share_journal_with_user',
            description: 'Share your movie journal with another user',
            inputSchema: {
                type: 'object',
                properties: {
                    targetUserId: { type: 'string', description: 'User ID to share journal with' },
                    journalName: { type: 'string', description: 'Optional name for the shared journal' }
                },
                required: ['targetUserId']
            }
        },
        {
            name: 'get_shared_journal_info',
            description: 'Get information about your shared journal',
            inputSchema: {
                type: 'object',
                properties: {}
            }
        },
        {
            name: 'remove_journal_sharing',
            description: 'Stop sharing your journal with a specific user',
            inputSchema: {
                type: 'object',
                properties: {
                    targetUserId: { type: 'string', description: 'User ID to stop sharing with' }
                },
                required: ['targetUserId']
            }
        }
    ];
}
```

---

## 🌐 Web UI Integration

⚠️ **CRITICAL**: This MCP server uses the `mcp-web-ui` framework for web interfaces. Always use the framework instead of creating custom implementations.

### Framework Installation
```bash
npm install mcp-web-ui
```

### UI Schema Configuration
```typescript
// web-ui/movies-ui-config.ts
import { UISchema } from 'mcp-web-ui';

export function createMovieSchema(title = "🎬 Movie Journal"): UISchema {
    return {
        title,
        description: "Your shared movie collection and personal reviews",
        components: [
            // Stats component for movie metrics
            {
                type: "stats",
                id: "movie-stats",
                config: {
                    metrics: [
                        "total_movies",
                        "this_month", 
                        "avg_rating",
                        "always_movies",
                        "suggestion_ready",
                        "journal_members"
                    ]
                }
            },
            // Main movie list component
            {
                type: "list",
                id: "movie-list",
                title: "Movie Collection",
                config: {
                    fields: [
                        { key: "title", label: "Title", type: "text" },
                        { key: "year", label: "Year", type: "number" },
                        { key: "director", label: "Director", type: "text" },
                        { key: "tags", label: "Genres", type: "text" },
                        { key: "rating", label: "Your Rating", type: "number" },
                        { key: "review", label: "Your Review", type: "text" },
                        { 
                            key: "mood", 
                            label: "Viewing Mood", 
                            type: "select",
                            options: [
                                { value: "relaxing", label: "😌 Relaxing" },
                                { value: "exciting", label: "⚡ Exciting" },
                                { value: "thoughtful", label: "🤔 Thoughtful" },
                                { value: "nostalgic", label: "💭 Nostalgic" }
                            ]
                        },
                        { key: "rewatchable", label: "Rewatchable", type: "checkbox" },
                        { key: "isAlwaysMovie", label: "Always Movie", type: "badge" }
                    ],
                    sortable: true,
                    filterable: true
                }
            }
        ],
        // Actions that can be performed
        actions: [
            {
                id: "add-movie",
                label: "Add Movie",
                type: "button",
                handler: "add-movie"
            },
            {
                id: "add-review",
                label: "Rate & Review",
                type: "button", 
                handler: "add-review"
            },
            {
                id: "suggest-movie",
                label: "Get Suggestions",
                type: "button",
                handler: "suggest-movie"
            },
            {
                id: "share-journal",
                label: "Share Journal",
                type: "button",
                handler: "share-journal"
            },
            {
                id: "vote-always",
                label: "Vote Always Movie",
                type: "inline",
                handler: "vote-always"
            }
        ],
        // Enable polling for real-time updates
        polling: {
            enabled: true,
            intervalMs: 2000
        }
    };
}
```

### Framework Integration
```typescript
// web-ui/movie-ui-factory.ts
import { MCPWebUI } from 'mcp-web-ui';
import { createMovieSchema } from './movies-ui-config.js';

export function createMovieWebUI(
    movieManager: MovieManager,
    suggestionEngine: MovieSuggestionEngine,
    config: MovieUIConfig = {}
): MCPWebUI {
    const schema = createMovieSchema("🎬 Movie Journal");

    const webUI = new MCPWebUI({
        schema,
        dataSource: async (userId?: string) => {
            const movies = await movieManager.getMoviesForUser(userId || 'default');
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
                // Include stats data for the stats component
                total_movies: movies.length,
                this_month: movies.filter(m => isThisMonth(m.userReview?.watchedDate)).length,
                avg_rating: calculateAverageRating(movies),
                always_movies: movies.filter(m => m.isAlwaysMovie).length,
                suggestion_ready: movies.filter(m => 
                    m.userReview && m.userReview.rating >= 7 && m.userReview.rewatchable
                ).length,
                journal_members: 1
            }));
        },
        onUpdate: async (action: string, data: any, userId: string) => {
            return await handleMovieUpdate(action, data, userId, movieManager, suggestionEngine);
        },
        sessionTimeout: config.sessionTimeout || 30 * 60 * 1000,
        pollInterval: config.pollInterval || 2000,
        enableLogging: config.enableLogging ?? true,
        portRange: config.port ? [config.port, config.port] : [3000, 65535],
        cssPath: './static'
    });

    return webUI;
}
```

### Main Server Integration
```typescript
// src/index.ts - Web UI setup
private initializeComponents() {
    // ... other initialization ...

    // Initialize web UI using framework
    this.webUI = createMovieWebUI(this.movieManager, this.suggestionEngine, {
        enableLogging: process.env.NODE_ENV !== 'production'
    });

    // Add web UI tool to tools array
    this.tools.push(this.webUI.getMCPToolDefinition());
}

// Handler for web UI tool calls
this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const toolName = request.params?.name;
    const params = request.params?.arguments || {};

    // Handle web UI tool call
    if (toolName === 'get_web_ui') {
        const userId = this.userManager.getCurrentUserId();
        return await this.webUI.handleGetWebUI(
            userId,
            params.extend_minutes || 30
        );
    }

    // ... other tool handlers ...
});
```

### Static Assets
```css
/* static/styles.css - Movie-specific styling */
:root {
    --movie-primary: #e50914;      /* Netflix red */
    --movie-secondary: #221f1f;    /* Dark gray */
    --movie-accent: #f5c518;       /* IMDB yellow */
    --movie-background: #141414;   /* Dark theme */
}

.movie-card {
    background: var(--movie-surface);
    border-left: 4px solid var(--movie-primary);
}

.movie-rating {
    color: var(--movie-accent);
    font-weight: bold;
}

.always-movie-badge {
    background: var(--movie-primary);
    color: white;
}
                config: {
                    showJournalName: true,
                    showSharedWith: true,
                    showJournalMembers: true
                }
            },
            {
                type: "stats",
                id: "movie-stats",
                config: {
                    metrics: [
                        { key: "total_movies", label: "Movies Watched", icon: "🎬" },
                        { key: "avg_rating", label: "Average Rating", icon: "⭐" },
                        { key: "always_movies", label: "Always Movies", icon: "💯" },
                        { key: "this_month", label: "This Month", icon: "📅" },
                        { key: "journal_members", label: "Journal Members", icon: "👥" }
                    ]
                }
            },
            {
                type: "list",
                id: "movie-list",
                config: {
                    itemType: "movie",
                    fields: [
                        { key: "title", label: "Title", type: "text", required: true },
                        { key: "year", label: "Year", type: "number", required: true },
                        { key: "director", label: "Director", type: "text", required: true },
                        { key: "genre", label: "Genres", type: "multiselect", 
                          options: ["action", "comedy", "drama", "horror", "romance", "thriller", "documentary"] },
                        { key: "userRating", label: "Your Rating", type: "rating", max: 10 },
                        { key: "userReview", label: "Your Review", type: "textarea" },
                        { key: "mood", label: "Viewing Mood", type: "select",
                          options: ["relaxing", "exciting", "thoughtful", "nostalgic"] },
                        { key: "rewatchable", label: "Rewatchable", type: "checkbox" },
                        { key: "journalReviews", label: "All Journal Reviews", type: "custom", 
                          component: "journal-reviews-display" }
                    ],
                    actions: {
                        item: ["view", "edit", "review", "vote-always"],
                        bulk: ["export"],
                        global: ["add", "suggest", "share-journal", "manage-sharing"]
                    },
                    features: {
                        enableSearch: true,
                        enableFilters: true,
                        enableSorting: true,
                        enableStats: true
                    }
                }
            }
        ]
    },
    
    customActions: {
        suggest: {
            label: "Get Suggestions",
            icon: "🎯",
            type: "modal",
            form: {
                fields: [
                    { 
                        key: "mood", 
                        label: "What's your mood?", 
                        type: "select",
                        options: [
                            { value: "relaxing", label: "😌 Relaxing" },
                            { value: "exciting", label: "⚡ Exciting" },
                            { value: "thoughtful", label: "🤔 Thoughtful" },
                            { value: "nostalgic", label: "💭 Nostalgic" }
                        ],
                        required: true
                    },
                    { key: "count", label: "Number of suggestions", type: "number", min: 1, max: 10, default: 5 }
                ]
            }
        },
        
        review: {
            label: "Add Review",
            icon: "✍️",
            type: "modal",
            form: {
                fields: [
                    { key: "rating", label: "Rating (1-10)", type: "number", min: 1, max: 10, required: true },
                    { key: "review", label: "Review", type: "textarea", required: true },
                    { key: "watchedDate", label: "Date Watched", type: "date", required: true },
                    { key: "mood", label: "Viewing Mood", type: "select", 
                      options: ["relaxing", "exciting", "thoughtful", "nostalgic"] },
                    { key: "rewatchable", label: "Would you rewatch this?", type: "checkbox" }
                ]
            }
        },
        
        "share-journal": {
            label: "Share Journal",
            icon: "👥",
            type: "modal",
            form: {
                fields: [
                    { key: "targetUserId", label: "User ID to share with", type: "text", required: true },
                    { key: "journalName", label: "Journal Name (optional)", type: "text", placeholder: "e.g., John & Jane's Movies" }
                ]
            }
        },
        
        "manage-sharing": {
            label: "Manage Journal Sharing",
            icon: "⚙️",
            type: "modal",
            description: "View and manage who you're sharing your journal with"
        }
    }
};
```

---

## 🚀 Main Server Entry Point

### Core Server Implementation
```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MovieManager } from './movie-manager.js';
import { UserManager } from './user-manager.js';
import { MovieSuggestionEngine } from './suggestion-engine.js';
import { JsonMovieStorage } from './storage/JsonStorage.js';
import { MongoMovieStorage } from './storage/MongodbStorage.js';
import { createMovieTools } from './tools/movie-tools.js';
import { MCPWebUI } from '@sizzek/mcp-web-ui';
import { moviesUIConfig } from '../web-ui/movies-ui-config.js';

class MoviesServer {
    private server: Server;
    private movieManager: MovieManager;
    private userManager: UserManager;
    private suggestionEngine: MovieSuggestionEngine;
    private webUI: MCPWebUI;

    constructor() {
        this.server = new Server(
            { name: 'movies-server', version: '1.0.0' },
            { capabilities: { tools: {} } }
        );

        this.initializeComponents();
        this.setupTools();
        this.setupWebUI();
    }

    private async initializeComponents() {
        // Initialize storage based on environment
        const storage = process.env.MONGODB_URI 
            ? new MongoMovieStorage(process.env.MONGODB_URI)
            : new JsonMovieStorage(process.env.DATA_DIR || './data');

        if (storage instanceof MongoMovieStorage) {
            await storage.connect();
        }

        this.userManager = new UserManager();
        this.movieManager = new MovieManager(storage, this.userManager);
        this.suggestionEngine = new MovieSuggestionEngine(storage);
    }

    private setupTools() {
        const tools = createMovieTools(this.movieManager);
        
        tools.forEach(tool => {
            this.server.setRequestHandler(tool.name, async (request) => {
                const userId = this.userManager.getCurrentUserId();
                
                try {
                    switch (tool.name) {
                        case 'add_movie':
                            return await this.movieManager.addMovie(request.params, userId);
                        case 'get_movies':
                            return await this.movieManager.getMoviesForUser(userId, request.params);
                        case 'add_review':
                            return await this.movieManager.addReview(request.params, userId);
                        case 'suggest_movies':
                            return await this.suggestionEngine.getSuggestions(
                                userId, request.params.mood, request.params.count
                            );
                        case 'vote_always_movie':
                            return await this.movieManager.voteAlwaysMovie(request.params.movieId, request.params.vote, userId, request.params.reason);
                        case 'get_always_movies':
                            return await this.movieManager.getAlwaysMovies(userId);
                        case 'share_journal_with_user':
                            return await this.movieManager.shareJournalWithUser(userId, request.params.targetUserId, request.params.journalName);
                        case 'get_shared_journal_info':
                            return await this.movieManager.getSharedJournalInfo(userId);
                        case 'remove_journal_sharing':
                            return await this.movieManager.removeJournalSharing(userId, request.params.targetUserId);
                        // ... other tool handlers
                    }
                } catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            });
        });
    }

    private setupWebUI() {
        this.webUI = new MCPWebUI({
            schema: moviesUIConfig.schema,
            dataSource: (userId) => this.movieManager.getMoviesForUser(userId),
            onUpdate: async (action, data, userId) => {
                return await this.handleWebUIAction(action, data, userId);
            }
        });

        // Add web UI tool
        this.server.setRequestHandler('get_web_ui', async () => {
            const userId = this.userManager.getCurrentUserId();
            const session = await this.webUI.createSession(userId);
            return {
                url: session.url,
                message: `Movie journal web interface available at: ${session.url}`
            };
        });
    }

    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Movies MCP Server running');
    }
}

// Start the server
const server = new MoviesServer();
server.start().catch(console.error);
```

---

## 📦 Package Configuration

### package.json
```json
{
  "name": "movies-mcp-server",
  "version": "1.0.0",
  "description": "Multi-user movie journal MCP server with intelligent suggestions",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "npm run build && node tests/run-all-tests.js",
    "test:unit": "npm run build && node tests/unit/*.test.js",
    "test:integration": "npm run build && node tests/integration/*.test.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@sizzek/mcp-data": "^1.0.0",
    "@sizzek/mcp-web-ui": "^1.0.0",
    "mongodb": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### Environment Configuration
```bash
# env.example
# User identification
MCP_USER_ID=user1

# Storage configuration
STORAGE_TYPE=json  # or 'mongodb'
DATA_DIR=./data
MONGODB_URI=mongodb://localhost:27017/movies

# Web UI configuration  
WEB_UI_PORT=3000
WEB_UI_HOST=localhost

# Development settings
NODE_ENV=development
DEBUG=movies:*
```

---

## 🔒 Security Considerations

### Multi-User Data Protection
- User context validation on every operation
- Explicit ownership tracking in all data models
- Access control testing for cross-user data leakage
- Secure session management for web UI

### Input Validation
- Comprehensive sanitization of all user inputs
- Movie title and director fuzzy matching for duplicates
- Rating validation (1-10 scale enforcement)
- Date validation for watch dates and reviews

This design provides a solid foundation for implementing the Movies MCP server with multi-user functionality, intelligent suggestions, and comprehensive data management. The modular architecture allows for easy testing and future enhancements. 