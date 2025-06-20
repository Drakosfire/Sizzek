/**
 * Mock MCP Client for Testing
 * Simulates LibreChat and other clients interacting with the Memory MCP Server
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export class MockMCPClient extends EventEmitter {
    constructor(serverPath = './dist/index.js', options = {}) {
        super();
        this.serverPath = serverPath;
        this.serverProcess = null;
        this.isConnected = false;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.serverLogs = [];

        // Configuration
        this.options = {
            timeout: 10000, // 10 second timeout
            startupTimeout: 5000, // 5 second startup timeout
            logLevel: 'INFO',
            ...options
        };
    }

    /**
     * Start the MCP server process
     */
    async startServer(env = {}) {
        return new Promise((resolve, reject) => {
            if (this.serverProcess) {
                return resolve();
            }

            console.log('[MockMCPClient] Starting MCP server...');

            // Set up environment
            const serverEnv = {
                ...process.env,
                NODE_ENV: 'test',
                MCP_DEBUG: 'true',
                ...env
            };

            this.serverProcess = spawn('node', [this.serverPath], {
                env: serverEnv,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Handle server stdout (MCP responses)
            this.serverProcess.stdout.on('data', (data) => {
                this.handleServerResponse(data);
            });

            // Handle server stderr (logs)
            this.serverProcess.stderr.on('data', (data) => {
                const logLine = data.toString().trim();
                this.serverLogs.push({
                    timestamp: new Date(),
                    level: 'INFO',
                    message: logLine
                });

                if (this.options.logLevel === 'DEBUG') {
                    console.log('[MCP Server Log]', logLine);
                }
            });

            // Handle server exit
            this.serverProcess.on('exit', (code, signal) => {
                console.log(`[MockMCPClient] Server exited with code ${code}, signal ${signal}`);
                this.isConnected = false;
                this.emit('serverExit', { code, signal });
            });

            // Handle errors
            this.serverProcess.on('error', (error) => {
                console.error('[MockMCPClient] Server error:', error);
                this.emit('serverError', error);
                reject(error);
            });

            // Wait for startup
            setTimeout(() => {
                this.isConnected = true;
                console.log('[MockMCPClient] Server started successfully');
                resolve();
            }, this.options.startupTimeout);
        });
    }

    /**
     * Stop the MCP server process
     */
    async stopServer() {
        return new Promise((resolve) => {
            if (!this.serverProcess) {
                return resolve();
            }

            console.log('[MockMCPClient] Stopping MCP server...');

            this.serverProcess.on('exit', () => {
                this.serverProcess = null;
                this.isConnected = false;
                console.log('[MockMCPClient] Server stopped');
                resolve();
            });

            this.serverProcess.kill('SIGTERM');

            // Force kill after 3 seconds if not exited gracefully
            setTimeout(() => {
                if (this.serverProcess) {
                    this.serverProcess.kill('SIGKILL');
                    this.serverProcess = null;
                    this.isConnected = false;
                    resolve();
                }
            }, 3000);
        });
    }

    /**
     * Send a raw JSON-RPC request to the server
     */
    async sendRequest(method, params = {}, userId = null) {
        if (!this.isConnected) {
            throw new Error('Server not connected');
        }

        return new Promise((resolve, reject) => {
            this.requestId++;
            const id = this.requestId;

            const request = {
                jsonrpc: '2.0',
                id,
                method,
                params: userId ? { ...params, userId } : params
            };

            // Store pending request
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request ${id} timed out`));
            }, this.options.timeout);

            this.pendingRequests.set(id, { resolve, reject, timeout });

            // Send request
            const requestJson = JSON.stringify(request) + '\n';
            this.serverProcess.stdin.write(requestJson);

            if (this.options.logLevel === 'DEBUG') {
                console.log('[MockMCPClient] Sent request:', request);
            }
        });
    }

    /**
     * Handle responses from the server
     */
    handleServerResponse(data) {
        const responses = data.toString().split('\n').filter(line => line.trim());

        for (const responseStr of responses) {
            try {
                const response = JSON.parse(responseStr);

                if (this.options.logLevel === 'DEBUG') {
                    console.log('[MockMCPClient] Received response:', response);
                }

                if (response.id && this.pendingRequests.has(response.id)) {
                    const { resolve, reject, timeout } = this.pendingRequests.get(response.id);
                    clearTimeout(timeout);
                    this.pendingRequests.delete(response.id);

                    if (response.error) {
                        reject(new Error(response.error.message || 'MCP Server Error'));
                    } else {
                        resolve(response.result);
                    }
                }
            } catch (error) {
                console.warn('[MockMCPClient] Failed to parse response:', responseStr);
            }
        }
    }

    /**
     * List available tools
     */
    async listTools() {
        return await this.sendRequest('tools/list');
    }

    /**
     * Call a specific tool
     */
    async callTool(toolName, arguments_, userId = null) {
        return await this.sendRequest('tools/call', {
            name: toolName,
            arguments: arguments_
        }, userId);
    }

    // === Memory MCP Tool Wrappers ===

    /**
     * Create entities
     */
    async createEntities(entities, userId = null) {
        return await this.callTool('create_entities', { entities }, userId);
    }

    /**
     * Create relations
     */
    async createRelations(relations, userId = null) {
        return await this.callTool('create_relations', { relations }, userId);
    }

    /**
     * Add observations
     */
    async addObservations(observations, userId = null) {
        return await this.callTool('add_observations', { observations }, userId);
    }

    /**
     * Delete entities
     */
    async deleteEntities(entityNames, userId = null) {
        return await this.callTool('delete_entities', { entityNames }, userId);
    }

    /**
     * Delete observations
     */
    async deleteObservations(deletions, userId = null) {
        return await this.callTool('delete_observations', { deletions }, userId);
    }

    /**
     * Delete relations
     */
    async deleteRelations(relations, userId = null) {
        return await this.callTool('delete_relations', { relations }, userId);
    }

    /**
     * Read entire graph
     */
    async readGraph(userId = null) {
        return await this.callTool('read_graph', {}, userId);
    }

    /**
     * Search nodes
     */
    async searchNodes(query, userId = null) {
        return await this.callTool('search_nodes', { query }, userId);
    }

    /**
     * Open specific nodes
     */
    async openNodes(names, userId = null) {
        return await this.callTool('open_nodes', { names }, userId);
    }

    // === Test Scenarios ===

    /**
     * Simulate LibreChat SMS user interaction
     */
    async simulateSMSUser(phoneNumber, scenario = 'basic') {
        const userId = phoneNumber;

        switch (scenario) {
            case 'basic':
                return await this.simulateBasicUserScenario(userId);
            case 'complex':
                return await this.simulateComplexUserScenario(userId);
            default:
                throw new Error(`Unknown scenario: ${scenario}`);
        }
    }

    /**
     * Basic user scenario: create entities, add observations, search
     */
    async simulateBasicUserScenario(userId) {
        const results = {};

        // 1. Create initial entities
        results.createEntities = await this.createEntities([
            {
                name: 'User Preference',
                entityType: 'Preference',
                observations: ['Likes coffee in the morning', 'Prefers remote work']
            }
        ], userId);

        // 2. Add observations
        results.addObservations = await this.addObservations([
            {
                entityName: 'User Preference',
                entityType: 'Preference',
                contents: ['Also enjoys tea in the afternoon']
            }
        ], userId);

        // 3. Read graph
        results.readGraph = await this.readGraph(userId);

        // 4. Search
        results.search = await this.searchNodes('coffee', userId);

        return results;
    }

    /**
     * Complex user scenario: multiple entities, relations, deletions
     */
    async simulateComplexUserScenario(userId) {
        const results = {};

        // 1. Create multiple entities
        results.createEntities = await this.createEntities([
            {
                name: 'John Doe',
                entityType: 'Person',
                observations: ['Software engineer', 'Lives in SF']
            },
            {
                name: 'Project Alpha',
                entityType: 'Project',
                observations: ['Due next month', 'High priority']
            }
        ], userId);

        // 2. Create relations
        results.createRelations = await this.createRelations([
            {
                from: 'John Doe',
                to: 'Project Alpha',
                relationType: 'works_on'
            }
        ], userId);

        // 3. Open specific nodes
        results.openNodes = await this.openNodes(['John Doe'], userId);

        // 4. Delete some observations
        results.deleteObservations = await this.deleteObservations([
            {
                entityName: 'John Doe',
                observations: ['Lives in SF']
            }
        ], userId);

        // 5. Final graph state
        results.finalGraph = await this.readGraph(userId);

        return results;
    }

    /**
     * Get server logs
     */
    getServerLogs(level = null) {
        if (level) {
            return this.serverLogs.filter(log => log.level === level);
        }
        return this.serverLogs;
    }

    /**
     * Clear server logs
     */
    clearServerLogs() {
        this.serverLogs = [];
    }

    /**
     * Check if server is healthy
     */
    async healthCheck() {
        try {
            const tools = await this.listTools();
            return {
                healthy: true,
                toolCount: tools.tools ? tools.tools.length : 0,
                serverLogs: this.serverLogs.length
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }

    /**
     * Cleanup and disconnect
     */
    async cleanup() {
        await this.stopServer();
    }
}

/**
 * Convenience function to create and start mock client
 */
export async function createMockClient(serverPath, env = {}) {
    const client = new MockMCPClient(serverPath);
    await client.startServer(env);
    return client;
}

export default MockMCPClient; 