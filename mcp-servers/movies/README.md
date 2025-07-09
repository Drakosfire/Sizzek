# Movies MCP Server

A multi-user movie journal MCP server with intelligent suggestions, collaborative features, and a beautiful web interface.

## Features

- **🎬 Web UI Interface**: Beautiful, responsive web interface for movie management
- **Multi-User Movie Journal**: Share your movie collection with family members
- **Personal Reviews**: Rate and review movies with mood tracking
- **"Always Movies"**: Collaborative voting system for comfort viewing
- **Intelligent Suggestions**: Mood-based movie recommendations
- **Journal Sharing**: Share your movie journal with others
- **Duplicate Detection**: Smart duplicate prevention when adding movies
- **Mobile-Friendly**: Optimized for both desktop and mobile devices

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Configuration

Copy the environment example file and configure:

```bash
cp env.example .env
```

### Environment Variables

- `MCP_USER_ID`: Your user identifier (required)
- `DATA_DIR`: Directory for JSON data storage (default: ./data)
- `NODE_ENV`: Environment (development/production)

## Usage

### Starting the Server

```bash
npm run dev    # Development mode with hot reload
npm start      # Production mode
```

### Web UI Access

The Movies MCP Server includes a complete web interface for managing your movie collection:

- **Dashboard**: View your movie statistics and recent activity
- **Movie Collection**: Browse, search, and filter your movies
- **Add Movies**: Easy form to add new movies to your collection
- **Review System**: Rate and review movies with mood tracking
- **Always Movie Voting**: Collaboratively vote on comfort viewing favorites
- **Suggestions**: Get mood-based movie recommendations
- **Journal Sharing**: Manage shared movie journals with other users

#### Web UI Features

- **Movie Cards**: Visual movie cards with ratings, genres, and Always Movie indicators
- **Multi-Section Lists**: Organize movies by categories (Recent, Always Movies, All Movies)
- **Modal Forms**: Intuitive forms for adding movies, reviews, and managing preferences
- **Responsive Design**: Optimized for both desktop and mobile viewing
- **Genre Color Coding**: Visual genre tags with color-coded styling
- **Rating System**: Visual rating displays with color-coded excellence indicators

### Available Tools

#### Movie Management
- `add_movie`: Add a new movie to the collection
- `get_movies`: Retrieve movies with optional filtering
- `add_review`: Add a personal review for a movie

#### Suggestions
- `suggest_movies`: Get mood-based movie recommendations

#### "Always Movies"
- `vote_always_movie`: Vote on movies for the "Always Movies" collection
- `get_always_movies`: Get all movies marked as "Always Movies"

#### Journal Sharing
- `share_journal_with_user`: Share your journal with another user
- `get_shared_journal_info`: Get information about shared journals
- `remove_journal_sharing`: Stop sharing with a user

## Tool Examples

### Add a Movie

```json
{
  "tool": "add_movie",
  "arguments": {
    "title": "The Matrix",
    "year": 1999,
    "director": "The Wachowskis",
    "genre": ["action", "sci-fi"]
  }
}
```

### Add a Review

```json
{
  "tool": "add_review",
  "arguments": {
    "movieId": "movie_123",
    "rating": 9,
    "review": "Mind-bending sci-fi masterpiece!",
    "watchedDate": "2024-01-15",
    "mood": "exciting",
    "rewatchable": true
  }
}
```

### Get Movie Suggestions

```json
{
  "tool": "suggest_movies",
  "arguments": {
    "mood": "relaxing",
    "count": 5
  }
}
```

### Vote for Always Movie

```json
{
  "tool": "vote_always_movie",
  "arguments": {
    "movieId": "movie_123",
    "vote": true,
    "reason": "Perfect for any mood!"
  }
}
```

### Share Journal

```json
{
  "tool": "share_journal_with_user",
  "arguments": {
    "targetUserId": "partner_user_id",
    "journalName": "Our Movie Collection"
  }
}
```

## Data Structure

The server uses JSON files for storage:

- `movies.json`: Movie collection
- `reviews.json`: User reviews
- `users.json`: User preferences
- `always-movie-votes.json`: Always Movie votes
- `journal-sharing.json`: Journal sharing configuration

## Multi-User Architecture

### Journal Sharing
- Each user has their own journal
- Journals can be shared with other users
- Shared journals show combined movie collections
- Reviews are visible to all journal members

### "Always Movies"
- Requires unanimous positive votes from all journal members
- Perfect for movies everyone agrees are rewatchable
- Ideal for "I don't know what to watch" moments

### Suggestions
- Based on your personal review history
- Mood-based filtering (relaxing, exciting, thoughtful, nostalgic)
- Considers rating, rewatchability, and genre preferences

## Development

### Project Structure

```
src/
├── models/           # TypeScript interfaces
├── storage/          # Storage implementations
├── tools/            # MCP tool definitions
├── web-ui/           # Web UI components and assets
│   ├── movie-ui-factory.ts      # Web UI factory and integration
│   ├── movies-ui-config.ts      # UI component configurations
│   ├── movie-web-ui-handlers.ts # Custom action handlers
│   ├── styles/                  # CSS styling
│   │   └── movie-ui-styles.css
│   ├── index.html              # Main HTML template
│   └── movie-ui.js             # Client-side JavaScript
├── movie-manager.ts  # Core business logic
├── user-manager.ts   # User session management
├── suggestion-engine.ts  # Recommendation logic
└── index.ts          # Main server entry point
```

### Web UI Architecture

The Web UI is built using a modular component system:

- **Movie UI Factory**: Creates and configures the web interface
- **Component Configuration**: Defines dashboard, lists, modals, and forms
- **Custom Handlers**: Processes user actions and integrates with the backend
- **Styling System**: Movie-themed CSS with responsive design
- **Client-Side Logic**: JavaScript for interactions and state management

### Testing

```bash
npm run test        # Run all tests
npm run test:unit   # Run unit tests
npm run test:integration  # Run integration tests
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Roadmap

- [x] **Web UI integration** - Complete movie management interface
- [ ] MongoDB storage backend
- [ ] External movie API integration (TMDB)
- [ ] Advanced recommendation algorithms
- [ ] Export/import functionality
- [ ] Movie statistics and analytics
- [ ] User authentication and multi-tenant support
- [ ] Mobile app integration
- [ ] Social features (movie recommendations between users) 