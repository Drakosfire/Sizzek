# Movies MCP Server - Web UI Implementation Plan

**Date**: June 24, 2025  
**Project**: Movie Journal Web UI Design  
**Framework**: MCP Web UI with Movies-Specific Enhancements  

---

## 🎯 Web UI Vision

### Core User Experience Goals
- **Effortless Movie Logging**: Quick capture while memories are fresh
- **Shared Discovery**: Browse family movie collection with personal context
- **Intelligent Browsing**: Find movies by mood, rating, or "Always Movie" status
- **Mobile-First**: Log movies from couch, bed, or anywhere
- **Visual Appeal**: Movie-focused design with posters and rich metadata

### Shared Journal Interface Goals
- Show shared movies with personal review context
- Display all journal member reviews for each movie
- Indicate "Always Movie" consensus status
- Simple, focused movie logging and discovery

---

## 🏗️ Component Architecture Using mcp-web-ui Framework

**⚠️ IMPORTANT: This implementation uses the `mcp-web-ui` npm package, not custom components.**

### Framework Setup

```typescript
// ✅ REQUIRED: Use actual mcp-web-ui framework
import { MCPWebUI, UISchema } from 'mcp-web-ui';

// Install: npm install mcp-web-ui
```

### Primary UI Components

#### 1. **Movie Dashboard Component**
```typescript
// ✅ Using mcp-web-ui StatsComponent
const movieStatsConfig = {
    type: "stats",
    id: "movie-dashboard", 
    config: {
        metrics: [
            { key: "total_movies", label: "Movies Watched", icon: "🎬", color: "#3b82f6" },
            { key: "this_month", label: "This Month", icon: "📅", color: "#10b981" },
            { key: "avg_rating", label: "Avg Rating", icon: "⭐", color: "#f59e0b" },
            { key: "always_movies", label: "Always Movies", icon: "💯", color: "#ef4444" },
            { key: "suggestion_ready", label: "Ready to Suggest", icon: "🎯", color: "#8b5cf6" }
        ],
        layout: "grid-auto",
        enableAnimations: true
    }
};
```

#### 2. **Enhanced Movie List Component**
```typescript
// ✅ Using mcp-web-ui ListComponent
const movieListConfig = {
    type: "list",
    id: "movie-collection",
    config: {
        fields: [
            { key: "title", label: "Title", type: "text", required: true },
            { key: "year", label: "Year", type: "number", required: true },
            { key: "director", label: "Director", type: "text", required: true },
            { key: "rating", label: "Rating", type: "number", min: 1, max: 10 },
            { key: "tags", label: "Genres", type: "text" }
        ],
        sortable: true,
        filterable: true,
        actions: {
            item: ["view-details", "add-review", "edit", "vote-always"],
            bulk: ["export", "batch-review"], 
            global: ["add-movie", "suggest-movie"]
        }
    }
};
```

#### 3. **Movie Details Modal**
```typescript
// ✅ Using mcp-web-ui ModalComponent
// Modals are handled automatically by the framework through actions
// Custom modal configuration is handled in the actions section
```

#### 4. **Movie Suggestion Interface**
```typescript
// ✅ Suggestions handled through actions with modal forms
// The framework automatically handles modal display and form submission
// Configuration is defined in the actions section below
```

---

## 🎨 Visual Design System

### Movie-Specific Color Palette
```css
:root {
    /* Movie-themed colors */
    --movie-primary: #1e3a8a;      /* Deep blue for headers */
    --movie-secondary: #dc2626;    /* Red for accents */
    --movie-gold: #fbbf24;         /* Gold for ratings/awards */
    --movie-silver: #6b7280;       /* Silver for metadata */
    
    /* Genre colors */
    --genre-action: #ef4444;
    --genre-comedy: #10b981;
    --genre-drama: #3b82f6;
    --genre-horror: #7c2d12;
    --genre-romance: #ec4899;
    --genre-scifi: #8b5cf6;
    
    /* Rating colors */
    --rating-excellent: #059669;   /* 9-10 */
    --rating-good: #10b981;        /* 7-8 */
    --rating-okay: #f59e0b;        /* 5-6 */
    --rating-poor: #ef4444;        /* 1-4 */
    
    /* Always Movie gradient */
    --always-movie-gradient: linear-gradient(135deg, #fbbf24, #f59e0b, #dc2626);
}
```

### Component Styling
```css
/* Movie card design */
.movie-card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    border: 2px solid transparent;
}

.movie-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.movie-card.always-movie {
    border: 2px solid var(--movie-gold);
    background: linear-gradient(135deg, #fef3c7, #ffffff);
}

.movie-header {
    padding: 1.5rem;
    background: linear-gradient(135deg, var(--movie-primary), var(--movie-secondary));
    color: white;
    position: relative;
}

.movie-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.movie-metadata {
    display: flex;
    gap: 1rem;
    align-items: center;
    opacity: 0.9;
}

.movie-year, .movie-director {
    font-size: 0.9rem;
    font-weight: 500;
}

/* Rating display */
.rating-display {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.875rem;
}

.rating-excellent { background: var(--rating-excellent); color: white; }
.rating-good { background: var(--rating-good); color: white; }
.rating-okay { background: var(--rating-okay); color: white; }
.rating-poor { background: var(--rating-poor); color: white; }

/* Genre tags */
.genre-tag {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    margin-right: 0.5rem;
    margin-bottom: 0.25rem;
}

.genre-action { background: var(--genre-action); color: white; }
.genre-comedy { background: var(--genre-comedy); color: white; }
.genre-drama { background: var(--genre-drama); color: white; }
/* ... other genre styles */

/* Always Movie indicator */
.always-movie-badge {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: var(--always-movie-gradient);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-weight: 700;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    animation: alwaysMovieGlow 2s ease-in-out infinite alternate;
}

@keyframes alwaysMovieGlow {
    0% { box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); }
    100% { box-shadow: 0 4px 20px rgba(251, 191, 36, 0.4); }
}
```

---

## 🚀 Enhanced Features

### 1. **Smart Movie Logging**
```typescript
// Enhanced add movie form with smart features
const addMovieFormConfig = {
    title: "Add Movie to Collection",
    size: "medium",
    fields: [
        { 
            key: "title", 
            label: "Movie Title", 
            type: "text", 
            required: true,
            placeholder: "Enter movie title..."
        },
        { 
            key: "year", 
            label: "Release Year", 
            type: "number", 
            required: true,
            min: 1900,
            max: new Date().getFullYear() + 2,
            placeholder: "2023"
        },
        { 
            key: "director", 
            label: "Director", 
            type: "text", 
            required: true,
            placeholder: "Director name..."
        },
        { 
            key: "genre", 
            label: "Genres", 
            type: "multiselect",
            options: [
                "Action", "Comedy", "Drama", "Horror", "Romance", 
                "Thriller", "Documentary", "Adventure", "Family"
            ]
        }
    ]
};
```

### 2. **Review Form**
```typescript
const reviewFormConfig = {
    title: "Rate & Review",
    fields: [
        { 
            key: "rating", 
            label: "Your Rating (1-10)", 
            type: "number", 
            min: 1,
            max: 10,
            required: true
        },
        { 
            key: "review", 
            label: "Your Review", 
            type: "textarea", 
            required: true,
            placeholder: "What did you think?"
        },
        { 
            key: "watchedDate", 
            label: "Date Watched", 
            type: "date", 
            required: true
        },
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
        { 
            key: "rewatchable", 
            label: "Would you rewatch this?", 
            type: "checkbox"
        }
    ]
};
```

### 3. **Movie Suggestion Form**
```typescript
const suggestionFormConfig = {
    title: "Get Movie Suggestions",
    type: "modal",
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
        {
            key: "count",
            label: "Number of suggestions",
            type: "number",
            min: 1,
            max: 10,
            default: 5
        }
    ]
};
```

---

## 📱 Mobile Optimization

### Touch-Friendly Movie Interface
```css
/* Mobile-specific movie interface */
@media (max-width: 768px) {
    .movie-card {
        margin: 0.75rem;
        border-radius: 12px;
    }
    
    .movie-header {
        padding: 1rem;
    }
    
    .movie-title {
        font-size: 1.25rem;
        line-height: 1.3;
    }
    
    .movie-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        padding: 1rem;
    }
    
    .movie-action-btn {
        min-height: 44px;
        border-radius: 8px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }
    
    /* Quick rating interface for mobile */
    .quick-rating {
        display: flex;
        justify-content: center;
        gap: 0.25rem;
        padding: 1rem;
        background: var(--gray-50);
        border-top: 1px solid var(--gray-200);
    }
    
    .quick-rating-star {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        transition: all 0.2s ease;
        cursor: pointer;
    }
    
    .quick-rating-star:hover,
    .quick-rating-star.active {
        background: var(--movie-gold);
        color: white;
        transform: scale(1.1);
    }
}
```

### Mobile Navigation
```typescript
const mobileNavConfig = {
    type: "bottom-navigation",
    items: [
        { 
            id: "movies", 
            label: "Movies", 
            icon: "🎬", 
            route: "/" 
        },
        { 
            id: "suggest", 
            label: "Suggest", 
            icon: "🎯", 
            route: "/suggest",
            highlight: true
        },
        { 
            id: "always", 
            label: "Always", 
            icon: "💯", 
            route: "/always"
        },
        { 
            id: "add", 
            label: "Add", 
            icon: "➕", 
            action: "open-add-movie-modal"
        }
    ],
    style: "floating",
    position: "bottom"
};
```

---

## 🔧 Technical Implementation Using mcp-web-ui Framework

### Movie Schema Creation
```typescript
// ✅ Using mcp-web-ui framework approach
import { MCPWebUI, UISchema } from 'mcp-web-ui';
import { MovieManager } from '../movie-manager.js';
import { MovieSuggestionEngine } from '../suggestion-engine.js';

export function createMovieSchema(title = "🎬 Movie Journal"): UISchema {
    return {
        title,
        description: "Your shared movie collection and personal reviews",
        components: [
            // Stats component using framework
            {
                type: "stats",
                id: "movie-stats",
                config: {
                    metrics: [
                        { key: "total_movies", label: "Movies Watched", icon: "🎬", color: "#3b82f6" },
                        { key: "this_month", label: "This Month", icon: "📅", color: "#10b981" },
                        { key: "avg_rating", label: "Avg Rating", icon: "⭐", color: "#f59e0b" },
                        { key: "always_movies", label: "Always Movies", icon: "💯", color: "#ef4444" }
                    ]
                }
            },
            // List component using framework
            {
                type: "list",
                id: "movie-list",
                config: {
                    fields: [
                        { key: "title", label: "Title", type: "text", required: true },
                        { key: "year", label: "Year", type: "number", required: true },
                        { key: "director", label: "Director", type: "text", required: true },
                        { key: "rating", label: "Rating", type: "number", min: 1, max: 10 },
                        { key: "tags", label: "Genres", type: "text" }
                    ],
                    sortable: true,
                    filterable: true
                }
            }
        ],
        // Actions handled by framework modals
        actions: [
            {
                id: "add-movie",
                label: "Add Movie",
                type: "modal",
                modal: {
                    title: "Add Movie",
                    fields: [
                        { key: "title", label: "Movie Title", type: "text", required: true },
                        { key: "year", label: "Release Year", type: "number", required: true },
                        { key: "director", label: "Director", type: "text", required: true },
                        { key: "tags", label: "Tags", type: "text" }
                    ]
                }
            },
            {
                id: "add-review",
                label: "Rate & Review",
                type: "modal",
                modal: {
                    title: "Rate & Review",
                    fields: [
                        { key: "rating", label: "Your Rating (1-10)", type: "number", min: 1, max: 10, required: true },
                        { key: "review", label: "Your Review", type: "textarea", required: true },
                        { key: "watchedDate", label: "Date Watched", type: "date", required: true },
                        { key: "mood", label: "Viewing Mood", type: "select", 
                          options: [
                              { value: "relaxing", label: "😌 Relaxing" },
                              { value: "exciting", label: "⚡ Exciting" },
                              { value: "thoughtful", label: "🤔 Thoughtful" },
                              { value: "nostalgic", label: "💭 Nostalgic" }
                          ], required: true }
                    ]
                }
            },
            {
                id: "suggest-movie", 
                label: "Get Suggestions",
                type: "modal",
                modal: {
                    title: "Get Movie Suggestions",
                    fields: [
                        { key: "mood", label: "What's your mood?", type: "select",
                          options: [
                              { value: "relaxing", label: "😌 Relaxing" },
                              { value: "exciting", label: "⚡ Exciting" },
                              { value: "thoughtful", label: "🤔 Thoughtful" },
                              { value: "nostalgic", label: "💭 Nostalgic" }
                          ], required: true },
                        { key: "count", label: "Number of suggestions", type: "number", min: 1, max: 10, default: 5 }
                    ]
                }
            }
        ]
    };
}

### Framework Integration
```typescript
export function createMovieWebUI(
    movieManager: MovieManager, 
    suggestionEngine: MovieSuggestionEngine,
    config = {}
) {
    // ✅ Use actual mcp-web-ui framework
    const webUI = new MCPWebUI({
        schema: createMovieSchema(),
        dataSource: async (userId?: string) => {
            return await getMovieUIData(movieManager, userId || 'default');
        },
        onUpdate: async (action: string, data: any, userId: string) => {
            return await handleMovieUpdate(action, data, userId, movieManager, suggestionEngine);
        },
        sessionTimeout: 30 * 60 * 1000, // 30 minutes
        pollInterval: 2000,
        enableLogging: true,
        ...config
    });

    return webUI;
}
```

### Data Source Integration
```typescript
// ✅ Framework-compatible data source function
async function getMovieUIData(movieManager: MovieManager, userId: string) {
    const movies = await movieManager.getMoviesForUser(userId);
    
    // Return data for framework components
    return {
        'movie-stats': {
            total_movies: movies.length,
            this_month: movies.filter(m => isThisMonth(m.userReview?.watchedDate)).length,
            avg_rating: calculateAverageRating(movies),
            always_movies: movies.filter(m => m.isAlwaysMovie).length
        },
        'movie-list': movies.map(movie => ({
            id: movie.id,
            title: movie.title,
            year: movie.year,
            director: movie.director,
            rating: movie.userReview?.rating || 0,
            tags: movie.tags?.join(', ') || ''
        }))
    };
}

// ✅ Framework-compatible update handler
async function handleMovieUpdate(
    action: string, 
    data: any, 
    userId: string,
    movieManager: MovieManager,
    suggestionEngine: MovieSuggestionEngine
) {
    switch (action) {
        case 'add-movie':
            return await movieManager.addMovie(data, userId);
        
        case 'add-review':
            return await movieManager.addReview(data, userId);
        
        case 'suggest-movie':
            const suggestions = await suggestionEngine.getSuggestions(
                userId, data.mood, data.count
            );
            return { success: true, suggestions };
        
        case 'vote-always':
            return await movieManager.voteAlwaysMovie(
                data.movieId, data.vote, data.reason, userId
            );
        
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}
```

---

### MCP Tool Registration
```typescript
// ✅ Register web UI tool with MCP server
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// In your MCP server setup
const server = new Server({ name: "movies-mcp-server" }, { capabilities: {} });

// Create movie web UI
const movieWebUI = createMovieWebUI(movieManager, suggestionEngine);

// Register the get_web_ui tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    if (name === "get_web_ui") {
        return await movieWebUI.handleGetWebUI(
            args.user_id || "default",
            args.extend_minutes || 30
        );
    }
    
    // Handle other movie tools...
});

// Register the tool definition
server.listTools = async () => {
    return {
        tools: [
            movieWebUI.getMCPToolDefinition(),
            // Other movie tools...
        ]
    };
};
```

## 🎯 User Experience Enhancements

### Core Features
1. **Quick Actions**: Simple rating and review forms via framework modals
2. **Always Movie Voting**: Easy consensus voting through actions
3. **Mobile Support**: Framework provides responsive design automatically
4. **Journal Sharing**: See reviews from all journal members
5. **Framework Benefits**: 
   - Automatic XSS protection and security
   - CSP-compliant implementation
   - Session management with auto-cleanup
   - Real-time polling for updates

This Web UI plan creates a delightful, movie-focused interface that leverages the proven mcp-web-ui framework while adding domain-specific enhancements that make movie logging and discovery a joy for couples sharing their film journey together. 🍿

**⚠️ IMPORTANT: Always use `npm install mcp-web-ui` and import the actual framework components. Never create mock implementations.** 