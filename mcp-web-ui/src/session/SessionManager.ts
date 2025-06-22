import { v4 as uuidv4 } from 'uuid';
import { WebUISession } from '../types/index.js';

/**
 * Manages UI sessions with automatic cleanup and lifecycle management
 */
export class SessionManager {
    private sessions = new Map<string, WebUISession>();
    private usedPorts = new Set<number>();
    private portRange: [number, number];
    private baseUrl: string;
    private userSessionLimits = new Map<string, { count: number; lastCreated: Date }>();

    constructor(
        sessionTimeoutMs = 30 * 60 * 1000, // 30 minutes default
        portRange: [number, number] = [3000, 65535],
        baseUrl = 'localhost'
    ) {
        this.portRange = portRange;
        this.baseUrl = baseUrl;

        // Note: Cleanup is now handled by MCPWebUI to properly stop UI servers
    }

    /**
 * Create a new session for a user
 * Automatically terminates any existing session for the same user
 */
    createSession(userId: string): WebUISession {
        // Rate limiting: max 5 sessions per user per hour
        const sessionTime = new Date();
        const userLimits = this.userSessionLimits.get(userId);

        if (userLimits) {
            const hourAgo = new Date(sessionTime.getTime() - 60 * 60 * 1000);
            if (userLimits.lastCreated > hourAgo && userLimits.count >= 5) {
                throw new Error('Session creation rate limit exceeded. Maximum 5 sessions per hour.');
            }

            if (userLimits.lastCreated > hourAgo) {
                userLimits.count++;
            } else {
                userLimits.count = 1;
            }
            userLimits.lastCreated = sessionTime;
        } else {
            this.userSessionLimits.set(userId, { count: 1, lastCreated: sessionTime });
        }

        // Check for and terminate any existing session for this user
        const existingSession = this.getSessionByUserId(userId);
        if (existingSession) {
            this.log('INFO', `Terminating existing session ${existingSession.id} for user ${userId} before creating new one`);
            this.terminateSession(existingSession.id);
        }

        const sessionId = uuidv4();
        const token = uuidv4();
        const port = this.allocatePort();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

        const session: WebUISession = {
            id: sessionId,
            token,
            userId,
            url: `http://${this.baseUrl}:${port}?token=${token}`,
            port,
            startTime: now,
            lastActivity: now,
            expiresAt,
            isActive: true
        };

        this.sessions.set(sessionId, session);
        this.log('INFO', `Created session ${sessionId} for user ${userId} on port ${port}`);

        return session;
    }

    /**
     * Get session by token (for authentication)
     * @param token Session token
     * @param updateActivity Whether to update lastActivity (default: false for polling, true for user actions)
     */
    getSessionByToken(token: string, updateActivity = false): WebUISession | null {
        for (const session of this.sessions.values()) {
            if (session.token === token && session.isActive) {
                // Only update last activity for actual user interactions, not polling
                if (updateActivity) {
                    session.lastActivity = new Date();
                }
                return session;
            }
        }
        return null;
    }

    /**
     * Get session by ID
     */
    getSession(sessionId: string): WebUISession | null {
        const session = this.sessions.get(sessionId);
        if (session && session.isActive) {
            session.lastActivity = new Date();
            return session;
        }
        return null;
    }

    /**
     * Get active session by user ID
     */
    getSessionByUserId(userId: string): WebUISession | null {
        for (const session of this.sessions.values()) {
            if (session.userId === userId && session.isActive) {
                session.lastActivity = new Date();
                return session;
            }
        }
        return null;
    }

    /**
     * Extend session timeout
     */
    extendSession(sessionId: string, additionalMinutes = 30): boolean {
        const session = this.sessions.get(sessionId);
        if (session && session.isActive) {
            session.expiresAt = new Date(session.expiresAt.getTime() + additionalMinutes * 60 * 1000);
            session.lastActivity = new Date();
            this.log('INFO', `Extended session ${sessionId} by ${additionalMinutes} minutes`);
            return true;
        }
        return false;
    }

    /**
     * Terminate a specific session
     */
    terminateSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.isActive = false;
            this.usedPorts.delete(session.port);
            this.sessions.delete(sessionId);
            this.log('INFO', `Terminated session ${sessionId}, freed port ${session.port}`);
            return true;
        }
        return false;
    }

    /**
     * Get all active sessions for debugging
     */
    getActiveSessions(): WebUISession[] {
        return Array.from(this.sessions.values()).filter(s => s.isActive);
    }

    /**
 * Get session stats
 */
    getStats() {
        const active = this.getActiveSessions();
        const userSessions = new Map<string, number>();

        // Count sessions per user
        for (const session of active) {
            userSessions.set(session.userId, (userSessions.get(session.userId) || 0) + 1);
        }

        return {
            totalSessions: active.length,
            usedPorts: Array.from(this.usedPorts).sort(),
            oldestSession: active.length > 0 ?
                Math.min(...active.map(s => s.startTime.getTime())) : null,
            nextExpiry: active.length > 0 ?
                Math.min(...active.map(s => s.expiresAt.getTime())) : null,
            sessionsPerUser: Object.fromEntries(userSessions),
            uniqueUsers: userSessions.size
        };
    }

    /**
     * Shutdown session manager and cleanup all sessions
     */
    shutdown(): void {
        // Cleanup all active sessions
        for (const sessionId of this.sessions.keys()) {
            this.terminateSession(sessionId);
        }

        this.usedPorts.clear();
        this.log('INFO', 'SessionManager shutdown complete');
    }

    /**
     * Allocate a random available port
     */
    private allocatePort(): number {
        const [minPort, maxPort] = this.portRange;
        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
            const port = Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort;

            if (!this.usedPorts.has(port)) {
                this.usedPorts.add(port);
                return port;
            }

            attempts++;
        }

        throw new Error(`Unable to allocate port after ${maxAttempts} attempts`);
    }

    /**
     * Simple logging utility
     */
    private log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}][${level}][SessionManager] ${message}`);
    }
} 