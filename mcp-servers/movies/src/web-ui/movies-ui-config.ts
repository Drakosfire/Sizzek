import { UISchema } from 'mcp-web-ui';

/**
 * Create movie-specific UI schema for the mcp-web-ui framework
 * This follows the standard UISchema structure that the framework expects
 */
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

/**
 * Alternative simple movie schema for basic use cases
 */
export function createSimpleMovieSchema(title = "Movie List"): UISchema {
    return {
        title,
        description: "Simple movie tracking",
        components: [
            {
                type: "list",
                id: "simple-movie-list",
                config: {
                    fields: [
                        { key: "title", label: "Movie Title", type: "text" },
                        { key: "year", label: "Year", type: "number" },
                        { key: "rating", label: "Rating", type: "number" }
                    ]
                }
            }
        ],
        actions: [
            {
                id: "add-movie",
                label: "Add Movie",
                type: "button",
                handler: "add-movie"
            }
        ]
    };
}

/**
 * Form configurations for modals (if needed by the framework)
 * Note: These are not part of UISchema but can be used by action handlers
 */
export const movieFormConfigs = {
    addMovie: {
        title: "Add Movie to Collection",
        fields: [
            {
                key: "title",
                label: "Movie Title",
                type: "text",
                placeholder: "Enter movie title..."
            },
            {
                key: "year",
                label: "Release Year",
                type: "number",
                min: 1900,
                max: new Date().getFullYear() + 2
            },
            {
                key: "director",
                label: "Director",
                type: "text",
                placeholder: "Director name..."
            },
            {
                key: "tags",
                label: "Genres",
                type: "text",
                placeholder: "Action, Drama, Thriller (comma-separated)"
            }
        ]
    },

    addReview: {
        title: "Rate & Review Movie",
        fields: [
            {
                key: "rating",
                label: "Your Rating (1-10)",
                type: "number",
                min: 1,
                max: 10
            },
            {
                key: "review",
                label: "Your Review",
                type: "textarea",
                placeholder: "What did you think of this movie?"
            },
            {
                key: "watchedDate",
                label: "Date Watched",
                type: "date"
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
    },

    suggestMovie: {
        title: "Get Movie Suggestions",
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
                ]
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
    },

    shareJournal: {
        title: "Share Movie Journal",
        fields: [
            {
                key: "targetUserId",
                label: "User ID to share with",
                type: "text",
                placeholder: "user123"
            },
            {
                key: "journalName",
                label: "Journal Name (optional)",
                type: "text",
                placeholder: "e.g., John & Jane's Movies"
            }
        ]
    }
};

// Export the main schema function as default
export default createMovieSchema; 