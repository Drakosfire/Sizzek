import { MongoClient, Db, Collection } from 'mongodb';

export interface UserLookupDebugConfig {
    connectionString: string;
    databaseName: string;
    timeout: number;
    maxRetries: number;
    agentName: string;
}

export interface LibreChatUser {
    _id: any; // Could be string or ObjectId
    email?: string;
    name?: string;
    username?: string;
    phoneNumber?: string;
    metadata?: {
        phoneNumber?: string;
        agentName?: string;
        [key: string]: any;
    };
    [key: string]: any; // Allow additional fields
}

export class UserLookupDebugService {
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private config: UserLookupDebugConfig;

    constructor(config: UserLookupDebugConfig) {
        this.config = config;
    }

    async initialize(): Promise<void> {
        try {
            console.log('🔍 DEBUG: Initializing MongoDB connection...');
            console.log(`   Connection String: ${this.config.connectionString}`);
            console.log(`   Database: ${this.config.databaseName}`);
            console.log(`   Agent Name: ${this.config.agentName}`);

            this.client = new MongoClient(this.config.connectionString, {
                connectTimeoutMS: this.config.timeout,
                serverSelectionTimeoutMS: this.config.timeout,
            });

            await this.client.connect();
            this.db = this.client.db(this.config.databaseName);

            console.log(`✅ DEBUG: Connected to MongoDB for user lookup: ${this.config.databaseName}`);

            // Test database connection
            await this.debugDatabaseInfo();

        } catch (error) {
            console.error('❌ DEBUG: Failed to connect to MongoDB for user lookup:', error);
            throw error;
        }
    }

    async debugDatabaseInfo(): Promise<void> {
        if (!this.db) {
            console.error('❌ DEBUG: Database not initialized');
            return;
        }

        try {
            console.log('🔍 DEBUG: Checking database information...');

            // List collections
            const collections = await this.db.listCollections().toArray();
            console.log(`   Collections found: ${collections.map(c => c.name).join(', ')}`);

            // Check users collection
            const usersCollection = this.db.collection('users');
            const userCount = await usersCollection.countDocuments();
            console.log(`   Total users in collection: ${userCount}`);

            // Sample some users (limit to 3 for safety)
            const sampleUsers = await usersCollection.find({}).limit(3).toArray();
            console.log('   Sample users (first 3):');
            sampleUsers.forEach((user, index) => {
                console.log(`   User ${index + 1}:`);
                console.log(`     _id: ${user._id} (type: ${typeof user._id})`);
                console.log(`     name: ${user.name}`);
                console.log(`     email: ${user.email}`);
                console.log(`     username: ${user.username || 'N/A'}`);
                console.log(`     phoneNumber: ${user.phoneNumber || 'N/A'}`);
                console.log(`     metadata: ${JSON.stringify(user.metadata || {}, null, 6)}`);
                console.log('');
            });

        } catch (error) {
            console.error('❌ DEBUG: Error checking database info:', error);
        }
    }

    async debugLookupUserIdByAgentName(agentName: string): Promise<string | null> {
        if (!this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }

        console.log(`🔍 DEBUG: Starting user lookup for agent: "${agentName}"`);

        try {
            const usersCollection: Collection<LibreChatUser> = this.db.collection('users');

            // Strategy 1: Look for user with matching agent name in metadata
            console.log('🔍 DEBUG: Strategy 1 - Looking for metadata.agentName...');
            let query: any = { 'metadata.agentName': agentName };
            console.log(`   Query: ${JSON.stringify(query)}`);

            let user = await usersCollection.findOne(query);
            console.log(`   Result: ${user ? `Found user ${user._id}` : 'No user found'}`);

            if (user) {
                console.log(`✅ DEBUG: Found user by agent name in metadata: ${user._id}`);
                return String(user._id);
            }

            // Strategy 2: Look for user with matching name/username
            console.log('🔍 DEBUG: Strategy 2 - Looking for name or username...');
            query = {
                $or: [
                    { name: agentName },
                    { username: agentName }
                ]
            };
            console.log(`   Query: ${JSON.stringify(query)}`);

            user = await usersCollection.findOne(query);
            console.log(`   Result: ${user ? `Found user ${user._id}` : 'No user found'}`);

            if (user) {
                console.log(`✅ DEBUG: Found user by name/username: ${user._id}`);
                return String(user._id);
            }

            // Strategy 3: Look for user with phone number matching the agent pattern
            console.log('🔍 DEBUG: Strategy 3 - Looking for phone number pattern...');
            query = {
                $or: [
                    { phoneNumber: { $regex: agentName, $options: 'i' } },
                    { 'metadata.phoneNumber': { $regex: agentName, $options: 'i' } }
                ]
            };
            console.log(`   Query: ${JSON.stringify(query)}`);

            user = await usersCollection.findOne(query);
            console.log(`   Result: ${user ? `Found user ${user._id}` : 'No user found'}`);

            if (user) {
                console.log(`✅ DEBUG: Found user by phone number pattern: ${user._id}`);
                return String(user._id);
            }

            // Strategy 4: Look for any user with "sizzek" in the email (case insensitive)
            if (agentName.toLowerCase() === 'sizzek') {
                console.log('🔍 DEBUG: Strategy 4 - Looking for sizzek in email...');
                query = { email: { $regex: 'sizzek', $options: 'i' } };
                console.log(`   Query: ${JSON.stringify(query)}`);

                user = await usersCollection.findOne(query);
                console.log(`   Result: ${user ? `Found user ${user._id}` : 'No user found'}`);

                if (user) {
                    console.log(`✅ DEBUG: Found user by email pattern: ${user._id}`);
                    return String(user._id);
                }
            }

            // Additional debug: Try case-insensitive name search
            console.log('🔍 DEBUG: Extra Strategy - Case-insensitive name search...');
            query = { name: { $regex: `^${agentName}$`, $options: 'i' } };
            console.log(`   Query: ${JSON.stringify(query)}`);

            user = await usersCollection.findOne(query);
            console.log(`   Result: ${user ? `Found user ${user._id}` : 'No user found'}`);

            if (user) {
                console.log(`✅ DEBUG: Found user by case-insensitive name: ${user._id}`);
                return String(user._id);
            }

            // Final debug: Search for any user with the agent name anywhere
            console.log('🔍 DEBUG: Fallback Strategy - Searching anywhere in name field...');
            query = { name: { $regex: agentName, $options: 'i' } };
            console.log(`   Query: ${JSON.stringify(query)}`);

            user = await usersCollection.findOne(query);
            console.log(`   Result: ${user ? `Found user ${user._id}` : 'No user found'}`);

            if (user) {
                console.log(`✅ DEBUG: Found user by partial name match: ${user._id}`);
                return String(user._id);
            }

            console.warn(`⚠️  DEBUG: No user found for agent name: ${agentName}`);

            // Final debug: Show all users for manual inspection
            console.log('🔍 DEBUG: All users in database:');
            const allUsers = await usersCollection.find({}).toArray();
            allUsers.forEach((u, index) => {
                console.log(`   User ${index + 1}: ${u._id} - "${u.name}" - ${u.email}`);
            });

            return null;

        } catch (error) {
            console.error(`❌ DEBUG: Error looking up user for agent ${agentName}:`, error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            console.log('🔌 DEBUG: Disconnected from MongoDB user lookup service');
        }
    }
}

// Factory function to create debug user lookup service from environment
export function createDebugUserLookupService(): UserLookupDebugService {
    const config: UserLookupDebugConfig = {
        connectionString: process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017/LibreChat',
        databaseName: process.env.MONGODB_DATABASE || 'LibreChat',
        timeout: parseInt(process.env.MCP_MONGODB_TIMEOUT || '10000'),
        maxRetries: parseInt(process.env.MCP_MONGODB_RETRIES || '3'),
        agentName: process.env.LIBRECHAT_AGENT_NAME || 'Sizzek'
    };

    return new UserLookupDebugService(config);
}

// Debug script to run manually
async function runDebugScript() {
    console.log('🔧 DEBUG: Starting user lookup debug script...');

    const service = createDebugUserLookupService();

    try {
        await service.initialize();

        const agentName = process.env.LIBRECHAT_AGENT_NAME || 'Sizzek';
        const userId = await service.debugLookupUserIdByAgentName(agentName);

        if (userId) {
            console.log(`🎉 DEBUG: Successfully found user ID: ${userId}`);
        } else {
            console.log(`❌ DEBUG: Could not find user for agent: ${agentName}`);
        }

    } catch (error) {
        console.error('💥 DEBUG: Debug script failed:', error);
    } finally {
        await service.disconnect();
    }
}

// Run debug script if called directly
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
    runDebugScript();
}

export { runDebugScript }; 