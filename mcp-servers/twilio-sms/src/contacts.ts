import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the same .env file as the SMS server
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

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
}

export { ContactManager, Contact }; 