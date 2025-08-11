import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { MongoClient, Db, Collection, ObjectId } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generic, overrideable env loader (keep in sync with server)
import fs from 'fs';
function loadEnv() {
    const candidates: string[] = [];
    if (process.env.ENV_PATH) candidates.push(process.env.ENV_PATH);
    const dirCandidates = [path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..')];
    const fileCandidates = ['.env.local', '.env', process.env.NODE_ENV === 'production' ? '.env.production' : undefined].filter(Boolean) as string[];
    for (const dir of dirCandidates) {
        for (const file of fileCandidates) {
            candidates.push(path.join(dir, file));
        }
    }
    let used: string | undefined;
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            dotenv.config({ path: p, override: true });
            used = used || p;
        }
    }
    if (!used) dotenv.config();
}
loadEnv();

// Agent Configuration
const AGENT_ID = process.env.LIBRECHAT_AGENT_ID || 'agent_G5HmZ0jJtfPMXIykL81Nx'; // Default from docs
const AGENT_MODEL = process.env.LIBRECHAT_AGENT_MODEL || 'gpt-4.1';

interface Contact {
    phoneNumber: string;
    name: string | null;
    agentId: string;
    conversationId: string;
    lastInteraction: string;
    metadata?: {
        notes?: string;
        tags?: string[];
        memoryPath?: string;
        todoodlePath?: string;
    }
}

interface ContactStore {
    contacts: Map<string, Contact>;
    lastUpdated: string;
}

interface LibreChatUser {
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

interface ContactLookupResult {
    source: 'local' | 'librechat';
    phoneNumber?: string;
    name?: string;
    email?: string;
    userId?: string;
    agentId?: string;
    conversationId?: string;
    lastInteraction?: string;
    metadata?: any;
}

interface ContactLookupConfig {
    storageType: 'json' | 'mongodb';
    jsonFilePath?: string;
    mongoConnectionString?: string;
    mongoDatabaseName?: string;
    mongoCollectionName?: string;
    timeout?: number;
    maxRetries?: number;
}

class ContactManager {
    private store: ContactStore;
    private readonly storePath: string;
    private readonly defaultAgentId: string;

    constructor() {
        // Get data directory from environment or use default
        const customDataDir = process.env.CONTACTS_DATA_DIR;
        let dataDir: string;

        if (customDataDir) {
            // If custom path is provided, use it directly
            dataDir = customDataDir;
            console.error('[ContactManager] Using custom data directory:', dataDir);

            // Verify the directory exists and is writable
            try {
                if (!fs.existsSync(dataDir)) {
                    fs.mkdirSync(dataDir, { recursive: true });
                }
                // Test write access
                const testFile = path.join(dataDir, '.test');
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
            } catch (error) {
                console.error('[ContactManager] Error accessing custom data directory, falling back to default');
                const projectRoot = path.join(__dirname, '..');
                dataDir = path.join(projectRoot, 'data');
            }
        } else {
            // Otherwise use default location in project
            const projectRoot = path.join(__dirname, '..');
            dataDir = path.join(projectRoot, 'data');
        }

        this.storePath = path.join(dataDir, 'contacts.json');
        this.defaultAgentId = AGENT_ID;

        // Ensure data directory exists
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Initialize store by loading from file or creating new if needed
        this.store = this.loadStore();
    }

    private createEmptyStore(): ContactStore {
        return {
            contacts: new Map<string, Contact>(),
            lastUpdated: new Date().toISOString()
        };
    }

    private loadStore(): ContactStore {
        try {
            if (fs.existsSync(this.storePath)) {
                const fileContent = fs.readFileSync(this.storePath, 'utf-8');

                // Check if file is empty
                if (!fileContent.trim()) {
                    const emptyStore = this.createEmptyStore();
                    this.saveStore(emptyStore);
                    return emptyStore;
                }

                try {
                    const data = JSON.parse(fileContent);
                    // Validate data structure
                    if (!data.contacts || !Array.isArray(data.contacts)) {
                        const emptyStore = this.createEmptyStore();
                        this.saveStore(emptyStore);
                        return emptyStore;
                    }

                    // Convert the contacts array back to a Map
                    const contactsMap = new Map<string, Contact>();
                    data.contacts.forEach((contact: Contact) => {
                        contactsMap.set(contact.phoneNumber, contact);
                    });
                    return {
                        contacts: contactsMap,
                        lastUpdated: data.lastUpdated || new Date().toISOString()
                    };
                } catch (parseError) {
                    console.error('[ContactManager] Error parsing contact store, creating new store');
                    const emptyStore = this.createEmptyStore();
                    this.saveStore(emptyStore);
                    return emptyStore;
                }
            } else {
                const emptyStore = this.createEmptyStore();
                this.saveStore(emptyStore);
                return emptyStore;
            }
        } catch (error) {
            console.error('[ContactManager] Error loading contact store:', error);
            const emptyStore = this.createEmptyStore();
            this.saveStore(emptyStore);
            return emptyStore;
        }
    }

    private saveStore(store: ContactStore): void {
        try {
            const data = {
                contacts: Array.from(store.contacts.values()),
                lastUpdated: store.lastUpdated
            };
            fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('[ContactManager] Error saving contact store:', error);
        }
    }

    private normalizePhoneNumber(phoneNumber: string): string {
        // Remove all non-numeric characters
        return phoneNumber.replace(/\D/g, '');
    }

    public getContact(phoneNumber: string): Contact | undefined {
        const normalizedNumber = this.normalizePhoneNumber(phoneNumber);
        return this.store.contacts.get(normalizedNumber);
    }

    public addOrUpdateContact(
        phoneNumber: string,
        updates: Partial<Contact>,
        conversationId: string
    ): Contact {
        const normalizedNumber = this.normalizePhoneNumber(phoneNumber);
        const existingContact = this.store.contacts.get(normalizedNumber);

        const contact: Contact = {
            phoneNumber: normalizedNumber,
            name: updates.name ?? existingContact?.name ?? null,
            agentId: updates.agentId ?? existingContact?.agentId ?? this.defaultAgentId,
            conversationId: conversationId,
            lastInteraction: new Date().toISOString(),
            metadata: {
                ...existingContact?.metadata,
                ...updates.metadata
            }
        };

        this.store.contacts.set(normalizedNumber, contact);
        this.saveStore(this.store);
        return contact;
    }

    public updateContactName(phoneNumber: string, name: string): Contact | undefined {
        const normalizedNumber = this.normalizePhoneNumber(phoneNumber);
        const contact = this.store.contacts.get(normalizedNumber);

        if (contact) {
            contact.name = name;
            contact.lastInteraction = new Date().toISOString();
            this.store.contacts.set(normalizedNumber, contact);
            this.saveStore(this.store);
            return contact;
        }

        return undefined;
    }

    public getConversationTitle(phoneNumber: string): string {
        const contact = this.getContact(phoneNumber);
        if (contact?.name) {
            return `SMS Agent Chat with ${contact.name}`;
        }
        return `SMS Agent Chat with Unknown (${phoneNumber})`;
    }

    public needsNamePrompt(phoneNumber: string): boolean {
        const contact = this.getContact(phoneNumber);
        return !contact?.name;
    }

    // Search local contacts by name or phone number
    public searchLocalContacts(query: string): Contact[] {
        const results: Contact[] = [];
        const normalizedQuery = query.toLowerCase().trim();

        for (const contact of this.store.contacts.values()) {
            // Search by name
            if (contact.name && contact.name.toLowerCase().includes(normalizedQuery)) {
                results.push(contact);
                continue;
            }

            // Search by phone number (partial match)
            if (contact.phoneNumber.includes(normalizedQuery.replace(/\D/g, ''))) {
                results.push(contact);
                continue;
            }

            // Search by metadata
            if (contact.metadata?.notes && contact.metadata.notes.toLowerCase().includes(normalizedQuery)) {
                results.push(contact);
                continue;
            }

            // Search by tags
            if (contact.metadata?.tags && contact.metadata.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))) {
                results.push(contact);
                continue;
            }
        }

        return results;
    }

    // Get all contacts
    public getAllContacts(): Contact[] {
        return Array.from(this.store.contacts.values());
    }
}

class ContactLookupService {
    private contactManager: ContactManager;
    private mongoClient: MongoClient | null = null;
    private db: Db | null = null;
    private config: ContactLookupConfig;

    constructor(contactManager: ContactManager, config: Partial<ContactLookupConfig> = {}) {
        this.contactManager = contactManager;
        this.config = {
            storageType: config.storageType || (process.env.MCP_STORAGE_TYPE as 'json' | 'mongodb') || 'json',
            jsonFilePath: config.jsonFilePath || process.env.TODOS_FILE_PATH || './memory_files/contacts.json',
            mongoConnectionString: config.mongoConnectionString || process.env.MONGODB_CONNECTION_STRING,
            mongoDatabaseName: config.mongoDatabaseName || process.env.MONGODB_CONTACT_DATABASE || 'LibreChat',
            mongoCollectionName: config.mongoCollectionName || process.env.MONGODB_COLLECTION || 'users',
            timeout: config.timeout || parseInt(process.env.MCP_MONGODB_TIMEOUT || '10000'),
            maxRetries: config.maxRetries || parseInt(process.env.MCP_MONGODB_RETRIES || '3')
        };
    }

    async initialize(): Promise<void> {
        console.log(`[ContactLookupService] Initializing with storage type: ${this.config.storageType}`);

        if (this.config.storageType === 'json') {
            console.log(`[ContactLookupService] Using JSON file storage: ${this.config.jsonFilePath}`);
            return;
        }

        if (!this.config.mongoConnectionString) {
            console.warn('[ContactLookupService] MongoDB storage selected but no connection string provided. Falling back to local contact lookup only.');
            return;
        }

        try {
            this.mongoClient = new MongoClient(this.config.mongoConnectionString!, {
                connectTimeoutMS: this.config.timeout,
                serverSelectionTimeoutMS: this.config.timeout,
            });

            await this.mongoClient.connect();
            this.db = this.mongoClient.db(this.config.mongoDatabaseName);

            console.log(`✅ Connected to MongoDB for contact lookup: ${this.config.mongoDatabaseName}.${this.config.mongoCollectionName}`);
        } catch (error) {
            console.error('❌ Failed to connect to MongoDB for contact lookup:', error);
            // Don't throw - allow local contacts to work
        }
    }

    async disconnect(): Promise<void> {
        if (this.mongoClient) {
            await this.mongoClient.close();
            this.mongoClient = null;
            this.db = null;
            console.log('🔌 Disconnected from MongoDB contact lookup service');
        }
    }

    private normalizePhoneNumber(phoneNumber: string): string {
        // Remove all non-numeric characters
        return phoneNumber.replace(/\D/g, '');
    }

    // Search LibreChat users by name, username, email, or phone number
    private async searchLibreChatUsers(query: string): Promise<LibreChatUser[]> {
        if (!this.db) {
            return [];
        }

        try {
            const usersCollection: Collection<LibreChatUser> = this.db.collection(this.config.mongoCollectionName!);
            const sanitizedQuery = query.trim();

            // Create a comprehensive search query
            const searchQuery = {
                $or: [
                    { name: { $regex: sanitizedQuery, $options: 'i' } },
                    { username: { $regex: sanitizedQuery, $options: 'i' } },
                    { email: { $regex: sanitizedQuery, $options: 'i' } },
                    { phoneNumber: { $regex: sanitizedQuery, $options: 'i' } },
                    { 'metadata.phoneNumber': { $regex: sanitizedQuery, $options: 'i' } },
                    { 'metadata.agentName': { $regex: sanitizedQuery, $options: 'i' } }
                ]
            };

            const users = await usersCollection.find(searchQuery).limit(20).toArray();
            return users;
        } catch (error) {
            console.error('❌ Error searching LibreChat users:', error);
            return [];
        }
    }

    // Comprehensive contact lookup
    async lookupContacts(query: string): Promise<ContactLookupResult[]> {
        const results: ContactLookupResult[] = [];

        try {
            // 1. Search local contacts
            const localContacts = this.contactManager.searchLocalContacts(query);
            for (const contact of localContacts) {
                results.push({
                    source: 'local',
                    phoneNumber: contact.phoneNumber,
                    name: contact.name || undefined,
                    agentId: contact.agentId,
                    conversationId: contact.conversationId,
                    lastInteraction: contact.lastInteraction,
                    metadata: contact.metadata
                });
            }

            // 2. Search LibreChat users (if MongoDB is available)
            if (this.db) {
                const libreChatUsers = await this.searchLibreChatUsers(query);
                for (const user of libreChatUsers) {
                    results.push({
                        source: 'librechat',
                        phoneNumber: user.phoneNumber || user.metadata?.phoneNumber,
                        name: user.name || user.username,
                        email: user.email,
                        userId: user._id.toString(),
                        metadata: user.metadata
                    });
                }
            }

            console.log(`✅ Found ${results.length} contacts matching "${query}"`);
            return results;
        } catch (error) {
            console.error('❌ Error during contact lookup:', error);
            throw error;
        }
    }

    // Lookup contact by exact phone number
    async lookupContactByPhoneNumber(phoneNumber: string): Promise<ContactLookupResult | null> {
        const normalizedNumber = this.normalizePhoneNumber(phoneNumber);

        try {
            // 1. Check local contacts first
            const localContact = this.contactManager.getContact(phoneNumber);
            if (localContact) {
                return {
                    source: 'local',
                    phoneNumber: localContact.phoneNumber,
                    name: localContact.name || undefined,
                    agentId: localContact.agentId,
                    conversationId: localContact.conversationId,
                    lastInteraction: localContact.lastInteraction,
                    metadata: localContact.metadata
                };
            }

            // 2. Check LibreChat users
            if (this.db) {
                const usersCollection: Collection<LibreChatUser> = this.db.collection(this.config.mongoCollectionName!);
                const user = await usersCollection.findOne({
                    $or: [
                        { phoneNumber: phoneNumber },
                        { phoneNumber: normalizedNumber },
                        { 'metadata.phoneNumber': phoneNumber },
                        { 'metadata.phoneNumber': normalizedNumber }
                    ]
                });

                if (user) {
                    return {
                        source: 'librechat',
                        phoneNumber: user.phoneNumber || user.metadata?.phoneNumber,
                        name: user.name || user.username,
                        email: user.email,
                        userId: user._id.toString(),
                        metadata: user.metadata
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('❌ Error looking up contact by phone number:', error);
            throw error;
        }
    }

    // Get all contacts (local + LibreChat users)
    async getAllContacts(): Promise<ContactLookupResult[]> {
        const results: ContactLookupResult[] = [];

        try {
            // 1. Get all local contacts
            const localContacts = this.contactManager.getAllContacts();
            for (const contact of localContacts) {
                results.push({
                    source: 'local',
                    phoneNumber: contact.phoneNumber,
                    name: contact.name || undefined,
                    agentId: contact.agentId,
                    conversationId: contact.conversationId,
                    lastInteraction: contact.lastInteraction,
                    metadata: contact.metadata
                });
            }

            // 2. Get LibreChat users with phone numbers
            if (this.db) {
                const usersCollection: Collection<LibreChatUser> = this.db.collection(this.config.mongoCollectionName!);
                const users = await usersCollection.find({
                    $or: [
                        { phoneNumber: { $exists: true, $regex: /.+/ } },
                        { 'metadata.phoneNumber': { $exists: true, $regex: /.+/ } }
                    ]
                }).toArray();

                for (const user of users) {
                    results.push({
                        source: 'librechat',
                        phoneNumber: user.phoneNumber || user.metadata?.phoneNumber,
                        name: user.name || user.username,
                        email: user.email,
                        userId: user._id.toString(),
                        metadata: user.metadata
                    });
                }
            }

            console.log(`✅ Retrieved ${results.length} total contacts`);
            return results;
        } catch (error) {
            console.error('❌ Error getting all contacts:', error);
            throw error;
        }
    }
}

export { ContactManager, Contact, ContactLookupService, ContactLookupResult, ContactLookupConfig }; 