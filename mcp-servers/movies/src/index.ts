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

// Generic, overrideable env loader
function loadEnv(serverLabel: string) {
    const candidates: string[] = [];
    if (process.env.ENV_PATH) candidates.push(process.env.ENV_PATH);

    // Add shared .env.sizzek file from config directory
    const sharedEnvPath = path.resolve(__dirname, '..', '..', '..', 'config', '.env.sizzek');
    candidates.push(sharedEnvPath);

    const dirCandidates = [path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..')];
    const fileCandidates = [
        '.env.local',
        '.env',
        process.env.NODE_ENV === 'production' ? '.env.production' : undefined,
    ].filter(Boolean) as string[];
    for (const dir of dirCandidates) {
        for (const file of fileCandidates) {
            candidates.push(path.join(dir, file));
        }
    }

    let usedPath: string | undefined;
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            dotenv.config({ path: p, override: true });
            usedPath = usedPath || p;
        }
    }
    if (!usedPath) dotenv.config();

    // Normalize Mongo env vars for cross-compat
    if (!process.env.MONGO_URI && process.env.MONGODB_URI) {
        process.env.MONGO_URI = process.env.MONGODB_URI;
    }
    if (!process.env.MONGODB_URI && process.env.MONGO_URI) {
        process.env.MONGODB_URI = process.env.MONGO_URI;
    }

    const uri = (process.env.MONGODB_URI || '').replace(/\/\/.*@/, '//***@');
    const db = process.env.MONGODB_DATABASE || '';
    const coll = process.env.MONGODB_COLLECTION || process.env.MONGODB_COLLECTION_PREFIX || '';
    console.error(`[${serverLabel}] Env loaded: ${usedPath || '(default)'} | DB=${db} | Collection=${coll} | URI=${uri ? '[SET]' : '[NOT_SET]'}`);
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
        log('INFO', 'MONGODB_URI: ' + process.env.MONGODB_URI, undefined);
        log('INFO', 'MONGODB_DATABASE: ' + process.env.MONGODB_DATABASE, undefined);
        log('INFO', 'MONGODB_COLLECTION: ' + process.env.MONGODB_COLLECTION, undefined);
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
server.start().catch(console.error); 