import { MongoClient, Db, Collection, ObjectId } from 'mongodb';

export interface UserLookupConfig {
    connectionString: string;
    databaseName: string;
    timeout: number;
    maxRetries: number;
    agentName: string;
}

export interface LibreChatUser {
    _id: ObjectId;
    email: string;
    name?: string;
    username?: string;
    phoneNumber?: string;
    metadata?: {
        phoneNumber?: string;
        agentName?: string;
        [key: string]: any;
    };
}

export class UserLookupService {
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private config: UserLookupConfig;

    constructor(config: UserLookupConfig) {
        this.config = config;
    }

    async initialize(): Promise<void> {
        try {
            this.client = new MongoClient(this.config.connectionString, {
                connectTimeoutMS: this.config.timeout,
                serverSelectionTimeoutMS: this.config.timeout,
            });

            await this.client.connect();
            this.db = this.client.db(this.config.databaseName);

            console.log(`✅ Connected to MongoDB for user lookup: ${this.config.databaseName}`);
        } catch (error) {
            console.error('❌ Failed to connect to MongoDB for user lookup:', error);
            throw error;
        }
    }

    async lookupUserIdByAgentName(agentName: string): Promise<string | null> {
        if (!this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }

        // Handle null/undefined/empty agent names
        if (!agentName || typeof agentName !== 'string' || agentName.trim() === '') {
            console.warn(`⚠️  Invalid agent name provided: ${agentName}`);
            return null;
        }

        // Sanitize agent name
        const sanitizedAgentName = agentName.trim();

        try {
            const usersCollection: Collection<LibreChatUser> = this.db.collection('users');

            // Try multiple lookup strategies

            // Strategy 1: Look for user with matching agent name in metadata
            let user = await usersCollection.findOne({
                'metadata.agentName': sanitizedAgentName
            });

            if (user) {
                console.log(`✅ Found user by agent name in metadata: ${user._id}`);
                return user._id.toString();
            }

            // Strategy 2: Look for user with matching name/username
            user = await usersCollection.findOne({
                $or: [
                    { name: sanitizedAgentName },
                    { username: sanitizedAgentName }
                ]
            });

            if (user) {
                console.log(`✅ Found user by name/username: ${user._id}`);
                return user._id.toString();
            }

            // Strategy 3: Look for user with phone number matching the agent pattern
            // This is useful for SMS-based agents
            user = await usersCollection.findOne({
                $or: [
                    { phoneNumber: { $regex: sanitizedAgentName, $options: 'i' } },
                    { 'metadata.phoneNumber': { $regex: sanitizedAgentName, $options: 'i' } }
                ]
            });

            if (user) {
                console.log(`✅ Found user by phone number pattern: ${user._id}`);
                return user._id.toString();
            }

            // Strategy 4: Look for any user with "sizzek" in the email
            if (sanitizedAgentName.toLowerCase() === 'sizzek') {
                user = await usersCollection.findOne({
                    email: { $regex: 'sizzek', $options: 'i' }
                });

                if (user) {
                    console.log(`✅ Found user by email pattern: ${user._id}`);
                    return user._id.toString();
                }
            }

            console.warn(`⚠️  No user found for agent name: ${sanitizedAgentName}`);
            return null;

        } catch (error) {
            console.error(`❌ Error looking up user for agent ${sanitizedAgentName}:`, error);

            // Retry logic
            for (let i = 0; i < this.config.maxRetries; i++) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                    return await this.lookupUserIdByAgentName(sanitizedAgentName);
                } catch (retryError) {
                    console.warn(`⚠️  Retry ${i + 1} failed for user lookup:`, retryError);
                }
            }

            throw error;
        }
    }

    async lookupUserById(userId: string): Promise<LibreChatUser | null> {
        if (!this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }

        try {
            const usersCollection: Collection<LibreChatUser> = this.db.collection('users');

            // Try to find by string ID first (for tests), then try ObjectId conversion
            let user = await usersCollection.findOne({ _id: userId as any });

            if (!user) {
                // Try with ObjectId conversion for real MongoDB
                try {
                    user = await usersCollection.findOne({ _id: new ObjectId(userId) });
                } catch (objectIdError) {
                    // If ObjectId conversion fails, the user probably doesn't exist
                    console.warn(`⚠️  Invalid or non-existent user ID: ${userId}`);
                    return null;
                }
            }

            if (user) {
                console.log(`✅ Found user by ID: ${userId}`);
            } else {
                console.warn(`⚠️  No user found with ID: ${userId}`);
            }

            return user;
        } catch (error) {
            console.error(`❌ Error looking up user by ID ${userId}:`, error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            console.log('🔌 Disconnected from MongoDB user lookup service');
        }
    }

    // Utility method to create a conversation ID for a user
    // This can be used when we need to create a new conversation
    createConversationId(userId: string): string {
        // Generate a conversation ID based on user ID and current timestamp
        const timestamp = Date.now().toString(36);
        const userIdShort = userId.substring(userId.length - 8);
        return `sched_${userIdShort}_${timestamp}`;
    }
}

// Factory function to create user lookup service from environment
export function createUserLookupService(): UserLookupService {
    const config: UserLookupConfig = {
        connectionString: process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017/LibreChat',
        databaseName: process.env.MONGODB_LIBRECHAT_DB || 'LibreChat',
        timeout: parseInt(process.env.MCP_MONGODB_TIMEOUT || '10000'),
        maxRetries: parseInt(process.env.MCP_MONGODB_RETRIES || '3'),
        agentName: process.env.LIBRECHAT_AGENT_NAME || 'Sizzek'
    };

    return new UserLookupService(config);
} 