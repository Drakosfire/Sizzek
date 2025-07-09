# Movies MCP Server - Project Planning Document

**Date**: June 24, 2025  
**Project**: Multi-User Movie Journal MCP Server  
**Scope**: First shared-space MCP server with movie management and intelligent suggestions  

---

## 🎯 Project Vision

### Core Mission
Create a collaborative movie journal that makes it effortless for couples to capture, rate, and rediscover their movie experiences together. This will be our first **shared-space MCP server**, enabling multiple users to contribute to a unified movie database while maintaining personal preferences and review histories.

### Key Value Propositions
- **Effortless Capture**: Quick movie logging with title, year, director, and personal reviews
- **Shared Discovery**: Collaborative "Always Movie" curation for reliable comfort viewing
- **Intelligent Suggestions**: Mood-based movie recommendations from your personal watch history
- **Relationship Enhancement**: Shared movie memories and preferences in one place

---

## 🏗️ Architecture Overview

### Shared Journal Architecture Pattern
```
Movies MCP Server Architecture
├── User Management Layer
│   ├── Session handling (user identification)
│   ├── Journal sharing permissions
│   └── Personal preference storage
├── Shared Journal Data Layer
│   ├── Movie catalog (shared across journal members)
│   ├── Review system (collaborative - all members see all reviews)
│   └── "Always Movie" collection (requires unanimous consent)
├── Suggestion Engine
│   ├── Mood-based filtering
│   ├── Review evolution analysis
│   └── Semantic search foundation
└── Storage Abstraction
    ├── MongoDB implementation (production)
    └── JSON implementation (development/testing)
```

### Data Relationship Model
```
User ──┐
       ├── JournalSharing ──→ SharedWith: [Users]
       │                  └── JournalName
       ├── Review ──→ Movie
       │              ├── Title
       │              ├── Year  
       │              ├── Director
       │              └── AlwaysMovie (requires unanimous votes)
       └── Preferences
           ├── Favorite genres
           ├── Mood mappings
           └── Rating patterns
```

---

## 📁 File Structure

### Directory Organization
```
movies/
├── src/
│   ├── index.ts                    # Main MCP server entry point
│   ├── movie-manager.ts            # Core business logic
│   ├── user-manager.ts             # Multi-user session handling
│   ├── suggestion-engine.ts        # Movie recommendation logic
│   ├── storage/
│   │   ├── StorageInterface.ts     # Abstract storage interface
│   │   ├── JsonStorage.ts          # Local JSON implementation
│   │   └── MongodbStorage.ts       # MongoDB implementation
│   ├── models/
│   │   ├── Movie.ts                # Movie data model
│   │   ├── Review.ts               # Review data model
│   │   ├── User.ts                 # User data model
│   │   └── Suggestion.ts           # Suggestion data model
│   └── tools/
│       ├── movie-tools.ts          # Movie CRUD operations
│       ├── review-tools.ts         # Review management
│       ├── suggestion-tools.ts     # Movie suggestions
│       └── always-movie-tools.ts   # "Always Movie" management
├── tests/
│   ├── helpers/
│   │   ├── test-utilities.ts       # Multi-user test framework
│   │   └── mock-data.ts            # Sample movie/review data
│   ├── unit/
│   │   ├── movie-manager.test.ts   # Core logic tests
│   │   ├── user-manager.test.ts    # Multi-user functionality
│   │   └── suggestion-engine.test.ts # Recommendation tests
│   ├── integration/
│   │   ├── multi-user.test.ts      # Cross-user interaction tests
│   │   └── storage-backends.test.ts # Storage implementation tests
│   └── run-all-tests.ts
├── data/
│   ├── movies.json                 # Development data store
│   ├── users.json                  # User preferences store  
│   └── sample-data.json            # Test/demo data
├── web-ui/
│   ├── movies-ui-config.ts         # Web UI configuration
│   └── custom-styles.css           # Movie-specific styling
├── env.example
├── package.json
└── README.md
```

### Key Component Responsibilities

#### `movie-manager.ts`
- Central movie database management
- Cross-user movie deduplication
- Review aggregation and statistics
- "Always Movie" collection management

#### `user-manager.ts`
- User session identification and management
- Personal preference storage
- Access control and permissions
- User-specific data filtering

#### `suggestion-engine.ts`
- Mood-to-movie mapping algorithms
- Rating pattern analysis
- Semantic search integration (future)
- Recommendation logic and scoring

---

## 🔧 Technical Approach

### Shared Journal Data Strategy

#### Collaborative Data Model
```typescript
// Shared across journal members
interface SharedMovie {
    id: string;
    title: string;
    year: number;
    director: string;
    alwaysMovie: boolean; // Requires unanimous votes from all journal members
    addedBy: string; // Track who added it
    addedAt: string;
}

// Visible to all journal members
interface JournalReview {
    id: string;
    movieId: string;
    userId: string;
    rating: number; // 1-10 scale
    review: string;
    watchedDate: string;
    mood?: string; // For suggestion training
    rewatchable: boolean;
    viewingNumber: number; // Track multiple viewings
    viewingContext?: string; // 'first-time', 'rewatch', etc.
}

// Journal sharing configuration
interface JournalSharing {
    userId: string;
    sharedWith: string[]; // Users this journal is shared with
    sharedBy: string[]; // Users who have shared their journal with this user
    journalName?: string; // Optional name for the shared journal
}
```

#### User Identification Pattern
```typescript
// Use environment variable for user identification
const currentUser = process.env.MCP_USER_ID || 'default';

// Or extract from session context if available
const currentUser = context?.user?.id || process.env.MCP_USER_ID || 'default';
```

### Storage Implementation Strategy

#### Simple JSON Storage
```typescript
// Single approach for simplicity - JSON files
{
    "movies.json": SharedMovie[],
    "reviews.json": Review[],
    "users.json": UserPreference[],
    "journal-sharing.json": JournalSharing[],
    "always-movie-votes.json": AlwaysMovieVote[]
}
```

### Simple Suggestion Algorithm

#### Basic Mood-to-Genre Mapping
```typescript
const moodProfiles = {
    "relaxing": { genres: ["comedy", "romance"], minRating: 7, rewatchable: true },
    "exciting": { genres: ["action", "thriller"], minRating: 8, rewatchable: false },
    "thoughtful": { genres: ["drama", "documentary"], minRating: 7, rewatchable: false },
    "nostalgic": { genres: [], minRating: 6, rewatchable: true }
};
```

### MCP Tool Registration Policy
- All MCP servers must use the schema-based tool dispatch pattern.
- Tool registration must use a single handler for `CallToolRequestSchema` and dispatch by `params.name`.
- **Checklist:**  
  - [ ] Tool registration uses CallToolRequestSchema pattern  
  - [ ] No per-tool string-based handler registration

> **Warning:** Never register handlers by tool name string (e.g., `setRequestHandler('add_movie', ...)`). This is not compatible with the MCP SDK and will break integration with LibreChat and other MCP clients.

### MCP Framework Integration
- Uses `@sizzek/mcp-data` for storage abstraction
- Leverages established user isolation patterns
- Follows MCP tool definition standards
- **REQUIRED:** Registers all tools using a single handler for `CallToolRequestSchema` and dispatches by `params.name`.
- Integrates with existing LibreChat setup

---

## ⚠️ Critical Pitfalls & Mitigation Strategies

### 1. **Journal Sharing Security**

**Risk**: Accidentally exposing journal data to non-members or mixing journal contexts

**Mitigation**:
- Explicit data ownership tracking in all models
- User context validation in every operation
- Comprehensive access control testing
- Clear separation between shared and personal data

```typescript
// Always validate user context
class MovieManager {
    async getMoviesForUser(userId: string): Promise<MovieWithUserReview[]> {
        if (!userId) throw new Error('User context required');
        
        const movies = await this.storage.getSharedMovies();
        const userReviews = await this.storage.getUserReviews(userId);
        
        return movies.map(movie => ({
            ...movie,
            userReview: userReviews.find(r => r.movieId === movie.id)
        }));
    }
}
```

### 2. **Movie Deduplication Challenges**

**Risk**: Multiple entries for the same movie with slight variations

**Mitigation**:
- Fuzzy matching for movie titles
- Year + director combination validation
- User confirmation for potential duplicates
- Movie ID normalization strategy

```typescript
// Smart duplicate detection
async findPotentialDuplicates(title: string, year: number, director: string) {
    const existing = await this.storage.searchMovies({
        titleSimilarity: 0.8, // Fuzzy match threshold
        yearRange: [year - 1, year + 1], // Account for release date variations
        director: director
    });
    
    return existing.filter(movie => 
        this.calculateSimilarity(movie.title, title) > 0.8
    );
}
```

### 3. **"Always Movie" Consensus Management**

**Risk**: Disagreement on "Always Movie" status between users

**Mitigation**:
- Voting system rather than boolean flag
- Require consensus for "Always Movie" designation
- Track voting history for transparency
- Allow for "Always Movie" removal with discussion

```typescript
interface AlwaysMovieVote {
    movieId: string;
    userId: string;
    vote: boolean;
    reason?: string;
    votedAt: string;
}

// Require consensus for "Always Movie" status
function calculateAlwaysMovieStatus(votes: AlwaysMovieVote[]): boolean {
    const uniqueVoters = new Set(votes.map(v => v.userId));
    const positiveVotes = votes.filter(v => v.vote).length;
    
    // Require unanimous positive votes from all users who voted
    return positiveVotes === uniqueVoters.size && positiveVotes > 0;
}
```

### 4. **Storage Backend Consistency**

**Risk**: Different behavior between JSON and MongoDB implementations

**Mitigation**:
- Comprehensive storage interface abstraction
- Identical test suites for both backends
- Data migration utilities between storage types
- Performance parity validation

### 5. **Suggestion Algorithm Bias**

**Risk**: Recommendations becoming stale or biased toward specific genres/eras

**Mitigation**:
- Diversification scoring in recommendations
- Temporal weighting to prefer recent preferences
- Explicit genre/era distribution targets
- User feedback loop for recommendation quality

---

## 🚀 Development Phases

### Phase 1: Core Functionality (Week 1)
- Basic movie CRUD operations
- Simple review system
- Journal sharing setup
- JSON storage implementation

### Phase 2: Collaboration Features (Week 2)
- "Always Movie" voting system
- Journal member review visibility
- Basic suggestion algorithm
- Multi-user testing

### Phase 3: Web UI (Week 3)
- Simple movie list interface
- Review forms
- Basic mobile support
- Integration testing

---

## 📊 Success Metrics

### Technical Metrics
- **Multi-user Safety**: Zero cross-user data leakage incidents
- **Performance**: Sub-200ms response times for all operations
- **Data Consistency**: 100% storage backend compatibility
- **Test Coverage**: 95%+ coverage across all components

### User Experience Metrics
- **Ease of Use**: Average movie logging time under 2 minutes
- **Suggestion Quality**: 70%+ user satisfaction with recommendations
- **"Always Movie" Accuracy**: Successful comfort viewing 90%+ of the time
- **Adoption**: Daily usage by both users within first month

---

## 🔗 Integration Points

### MCP Framework Integration
- Uses `@sizzek/mcp-data` for storage abstraction
- Leverages established user isolation patterns
- Follows MCP tool definition standards
- **REQUIRED:** Registers all tools using a single handler for `CallToolRequestSchema` and dispatches by `params.name`.
- Integrates with existing LibreChat setup

### Future Expansion Opportunities
- **Social Features**: Share recommendations with friends
- **External APIs**: TMDB integration for movie metadata
- **Advanced Analytics**: Viewing pattern analysis
- **Mobile App**: Native mobile companion app
- **AI Integration**: LLM-powered review analysis and suggestions

---

## 🎬 Conclusion

This Movies MCP server represents a significant evolution in our MCP ecosystem, introducing true multi-user collaboration while maintaining the security and isolation principles we've established. The combination of shared movie discovery and personal review tracking creates a unique solution that enhances rather than complicates the movie-watching experience.

The phased approach ensures we can validate the multi-user architecture early while building toward more sophisticated features like semantic search and advanced recommendation algorithms. This foundation will serve as a template for future collaborative MCP servers across different domains.

**Next Steps**: Review this planning document, then proceed to the detailed design document for implementation specifics.

---

**🎯 Ready to build something amazing together!** 🍿 