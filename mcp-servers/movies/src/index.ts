import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { MovieManager } from './movie-manager.js';
import { UserManager } from './user-manager.js';
import { MovieSuggestionEngine } from './suggestion-engine.js';
import { JsonMovieStorage } from './storage/JsonStorage.js';
import { MongoMovieStorage } from './storage/MongoStorage.js';
import { McpDataMovieStorage } from './storage/McpDataMovieStorage.js';
import { createMovieTools, createToolHandler, MCPTool } from './tools/movie-tools.js';
import { createMovieWebUI } from './web-ui/movie-ui-factory.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple environment loader
function loadEnv(serverLabel: string) {
    // Load from ENV_PATH or fallback to default location
    const envPath = process.env.ENV_PATH || '/app/.env.sizzek';

    console.error(`[${serverLabel}] Looking for environment file at: ${envPath}`);
    console.error(`[${serverLabel}] File exists: ${fs.existsSync(envPath)}`);

    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: true });
        console.error(`[${serverLabel}] Environment loaded from: ${envPath}`);
    } else {
        console.error(`[${serverLabel}] Warning: Environment file not found at ${envPath}`);
    }

    // Log key environment variables for debugging
    const masked = (val?: string) => (val ? '✓ Set' : '✗ Not set');
    console.error(`[${serverLabel}] MCP_STORAGE_TYPE: ${process.env.MCP_STORAGE_TYPE || 'json (default)'}`);
    console.error(`[${serverLabel}] MONGO_URI: ${masked(process.env.MONGO_URI)}`);
    console.error(`[${serverLabel}] MONGODB_DATABASE: ${process.env.MONGODB_DATABASE || 'LibreChat (default)'}`);
    console.error(`[${serverLabel}] MCP_USER_BASED: ${process.env.MCP_USER_BASED || 'false (default)'}`);
    console.error(`[${serverLabel}] MOVIES_MONGODB_COLLECTION: ${process.env.MOVIES_MONGODB_COLLECTION || 'Not set'}`);
}

loadEnv('Movies');

// Enhanced logging function
function log(level: string = 'INFO', message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}][${level}][Movies MCP] ${message}`;
    console.error(logMessage);
    if (data && process.env.MCP_DEBUG === 'true') {
        console.error(JSON.stringify(data, null, 2));
    }
}

class MoviesServer {
    private server: Server;
    private movieManager!: MovieManager;
    private userManager!: UserManager;
    private suggestionEngine!: MovieSuggestionEngine;
    private storage!: JsonMovieStorage | MongoMovieStorage | McpDataMovieStorage;
    private tools!: MCPTool[];
    private toolHandler!: (toolName: string, params: any) => Promise<any>;
    private webUI!: any;

    constructor() {
        // Log all relevant environment variables for debugging
        log('INFO', '=== Movies MCP Server Environment Variables ===', undefined);
        log('INFO', 'MCP_STORAGE_TYPE: ' + process.env.MCP_STORAGE_TYPE, undefined);
        log('INFO', 'MCP_MOVIES_DATA_DIR: ' + process.env.MCP_MOVIES_DATA_DIR, undefined);
        log('INFO', 'MONGODB_URI: ' + (process.env.MONGODB_URI || process.env.MONGO_URI), undefined);
        log('INFO', 'MONGODB_DATABASE: ' + process.env.MONGODB_DATABASE, undefined);
        log('INFO', 'MONGODB_COLLECTION: ' + (process.env.MOVIES_MONGODB_COLLECTION || process.env.MONGODB_COLLECTION), undefined);
        log('INFO', 'MCP_USER_BASED: ' + process.env.MCP_USER_BASED, undefined);
        log('INFO', 'MCP_USER_ID: ' + process.env.MCP_USER_ID, undefined);
        log('INFO', 'NODE_ENV: ' + process.env.NODE_ENV, undefined);
        log('INFO', 'CWD: ' + process.cwd(), undefined);
        log('INFO', '.env exists: ' + fs.existsSync('.env'), undefined);
        log('INFO', '============================================', undefined);

        this.server = new Server(
            { name: 'movies-server', version: '1.0.0' },
            { capabilities: { tools: {} } }
        );

        this.initializeComponents();
        this.setupHandlers();
    }

    private initializeComponents() {
        // Initialize storage
        // Select storage type based on MCP_STORAGE_TYPE
        const storageType = (process.env.MCP_STORAGE_TYPE || 'json').toLowerCase();

        // Use mcp-data for unified storage when possible
        if (storageType === 'json' || storageType === 'mongodb') {
            this.storage = new McpDataMovieStorage();
        } else if (storageType === 'legacy-mongodb') {
            this.storage = new MongoMovieStorage();
        } else {
            const dataDir = process.env.MCP_MOVIES_DATA_DIR || process.env.DATA_DIR || './data';
            this.storage = new JsonMovieStorage(dataDir);
        }
        console.log('Storage type:', storageType);

        // Initialize managers
        this.userManager = new UserManager();
        this.movieManager = new MovieManager(this.storage, this.userManager);
        this.suggestionEngine = new MovieSuggestionEngine(this.storage);

        // Initialize web UI
        this.webUI = createMovieWebUI(this.movieManager, this.suggestionEngine, {
            enableLogging: process.env.NODE_ENV !== 'production'
        });

        // Prepare tools and handler
        this.tools = createMovieTools(this.movieManager, this.suggestionEngine);

        // Add web UI tool
        this.tools.push(this.webUI.getMCPToolDefinition());

        const userId = this.userManager.getCurrentUserId();
        this.toolHandler = createToolHandler(this.movieManager, this.suggestionEngine, userId);
    }

    private setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            // Return tools in the same format as grocery-list
            return {
                tools: this.tools.map((tool: MCPTool) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                }))
            };
        });

        // Handle tool calls
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

            // Dispatch to other tool handlers
            const result = await this.toolHandler(toolName, params);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        });
    }

    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);

        console.error('Movies MCP Server running');
        console.error(`User ID: ${this.userManager.getCurrentUserId()}`);
        console.error(`Data directory: ${process.env.DATA_DIR || './data'}`);
    }
}

// Start the server
const server = new MoviesServer();

// Graceful shutdown handling
const cleanup = async () => {
    console.error('🛑 Shutting down Movies MCP Server...');
    try {
        // Clean up any resources
        if (server['storage'] && 'cleanup' in server['storage'] && typeof server['storage'].cleanup === 'function') {
            await server['storage'].cleanup();
        }
        console.error('✅ Movies MCP Server shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

// Handle shutdown signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

server.start().catch((error) => {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
}); 