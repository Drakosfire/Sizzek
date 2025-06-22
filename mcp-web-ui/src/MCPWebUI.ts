import { SessionManager } from './session/SessionManager.js';
import { UIServer } from './server/UIServer.js';
import {
    MCPWebUIConfig,
    WebUISession,
    UIServer as UIServerInterface
} from './types/index.js';

/**
 * Main MCP Web UI framework class
 * Orchestrates session management and dynamic UI servers
 */
export class MCPWebUI<T = any> {
    private sessionManager: SessionManager;
    private activeServers = new Map<string, UIServer>();
    private config: Required<MCPWebUIConfig<T>>;

    constructor(config: MCPWebUIConfig<T>) {
        // Set defaults
        this.config = {
            sessionTimeout: 30 * 60 * 1000, // 30 minutes
            pollInterval: 2000, // 2 seconds
            portRange: [3000, 65535],
            enableLogging: true,
            baseUrl: 'localhost',
            // If baseUrl is not localhost, default to binding all interfaces
            bindAddress: config.baseUrl && config.baseUrl !== 'localhost' ? '0.0.0.0' : 'localhost',
            ...config
        };

        this.sessionManager = new SessionManager(
            this.config.sessionTimeout,
            this.config.portRange,
            this.config.baseUrl
        );

        // Set up automatic cleanup - check for expired sessions every minute
        this.startAutomaticCleanup();

        // Cleanup on process exit
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    /**
     * Start automatic cleanup of expired sessions
     */
    private startAutomaticCleanup(): void {
        setInterval(async () => {
            await this.cleanupExpiredSessions();
        }, 60 * 1000); // Check every minute
    }

    /**
     * Cleanup expired sessions and their UI servers
     */
    private async cleanupExpiredSessions(): Promise<void> {
        const now = new Date();
        const activeSessions = this.sessionManager.getActiveSessions();
        const expiredSessions = activeSessions.filter(session => now > session.expiresAt);

        if (expiredSessions.length > 0) {
            this.log('INFO', `Found ${expiredSessions.length} expired sessions, cleaning up...`);

            for (const session of expiredSessions) {
                this.log('INFO', `Session ${session.id} expired (${session.expiresAt.toISOString()}), terminating...`);
                await this.terminateSession(session.id);
            }
        }
    }

    /**
     * Create a new UI session for a user
     * Returns the session with URL that can be shared
     * Automatically cleans up any existing session for the same user
     */
    async createSession(userId: string): Promise<WebUISession> {
        try {
            // Check for existing session for this user and clean it up
            const existingSession = this.sessionManager.getSessionByUserId(userId);
            if (existingSession) {
                this.log('INFO', `Cleaning up existing session for user ${userId} before creating new one`);
                await this.terminateSession(existingSession.id);
            }

            // Create session (SessionManager will also check, but this ensures UI server cleanup)
            const session = this.sessionManager.createSession(userId);

            // Create and start UI server
            const uiServer = new UIServer(
                session,
                this.config.schema,
                this.config.dataSource,
                this.config.onUpdate,
                this.config.pollInterval,
                this.config.bindAddress
            );

            await uiServer.start();
            this.activeServers.set(session.id, uiServer);

            this.log('INFO', `Created UI session for user ${userId}: ${session.url}`);
            return session;
        } catch (error) {
            this.log('ERROR', `Failed to create UI session for user ${userId}: ${error}`);
            throw error;
        }
    }

    /**
     * Get active session by token (for validation)
     */
    getSessionByToken(token: string): WebUISession | null {
        return this.sessionManager.getSessionByToken(token);
    }

    /**
     * Manually terminate a session
     */
    async terminateSession(sessionId: string): Promise<boolean> {
        try {
            const uiServer = this.activeServers.get(sessionId);
            if (uiServer) {
                await uiServer.stop();
                this.activeServers.delete(sessionId);
            }

            const success = this.sessionManager.terminateSession(sessionId);
            if (success) {
                this.log('INFO', `Terminated session ${sessionId}`);
            }
            return success;
        } catch (error) {
            this.log('ERROR', `Failed to terminate session ${sessionId}: ${error}`);
            return false;
        }
    }

    /**
     * Get stats about active sessions and servers
     */
    getStats() {
        const sessionStats = this.sessionManager.getStats();
        return {
            ...sessionStats,
            activeServers: this.activeServers.size,
            serverPorts: Array.from(this.activeServers.values()).map(server =>
                (server as any).session?.port
            ).filter(Boolean)
        };
    }

    /**
     * Cleanup and shutdown all sessions and servers
     */
    async shutdown(): Promise<void> {
        this.log('INFO', 'Shutting down MCPWebUI...');

        // Stop all active servers
        const stopPromises = Array.from(this.activeServers.values()).map(server =>
            server.stop().catch(error =>
                this.log('ERROR', `Error stopping server: ${error}`)
            )
        );

        await Promise.all(stopPromises);
        this.activeServers.clear();

        // Shutdown session manager
        this.sessionManager.shutdown();

        this.log('INFO', 'MCPWebUI shutdown complete');
    }

    /**
     * Create MCP tool definition for get_web_ui
     */
    getMCPToolDefinition() {
        return {
            name: "get_web_ui",
            description: `Get a web interface for ${this.config.schema.title}`,
            inputSchema: {
                type: "object" as const,
                properties: {
                    extend_minutes: {
                        type: "number" as const,
                        description: "Minutes to extend session (default: 30)",
                        minimum: 5,
                        maximum: 120
                    }
                },
                additionalProperties: false
            }
        };
    }

    /**
     * Handle the get_web_ui tool call
     * This is what MCP servers will call
     */
    async handleGetWebUI(userId: string, extendMinutes = 30): Promise<{
        content: Array<{ type: string; text: string }>;
    }> {
        try {
            const session = await this.createSession(userId);

            return {
                content: [{
                    type: "text",
                    text: `🌐 Your ${this.config.schema.title} dashboard is ready!\n\n` +
                        `🔗 **URL**: ${session.url}\n\n` +
                        `⏰ **Session expires**: ${session.expiresAt.toLocaleString()}\n` +
                        `👤 **User**: ${userId}\n\n` +
                        `💡 *Tip: Bookmark this link or use the "Extend" button in the UI to keep your session active.*`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Failed to create web UI: ${error instanceof Error ? error.message : 'Unknown error'}`
                }]
            };
        }
    }

    /**
     * Simple logging utility
     */
    private log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
        if (this.config.enableLogging) {
            const timestamp = new Date().toISOString();
            console.error(`[${timestamp}][${level}][MCPWebUI] ${message}`);
        }
    }
} 