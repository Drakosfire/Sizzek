// Simple mock for mcp-data to handle ES module loading issues
const MockUserStorage = class {
    constructor(defaultData) {
        this.storage = new Map();
        this.defaultData = defaultData;
    }

    async save(data, userId = 'default') {
        this.storage.set(userId, JSON.stringify(data));
    }

    async saveForUser(userId, data) {
        await this.save(data, userId);
    }

    async load(userId = 'default') {
        const serialized = this.storage.get(userId);
        if (!serialized) {
            if (this.defaultData && !this.storage.has(userId)) {
                await this.save(this.defaultData, userId);
                return this.defaultData;
            }
            return null;
        }
        return JSON.parse(serialized);
    }

    async loadForUser(userId) {
        return await this.load(userId);
    }

    async exists(userId = 'default') {
        return this.storage.has(userId);
    }

    async delete(userId = 'default') {
        this.storage.delete(userId);
    }

    async cleanup() {
        this.storage.clear();
    }

    async backup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `tasks-backup-${timestamp}`;
    }
};

// Special mock that fails for error testing
const FailingMockStorage = class {
    async save() { throw new Error('ENOENT: no such file or directory'); }
    async saveForUser() { throw new Error('ENOENT: no such file or directory'); }
    async load() { throw new Error('ENOENT: no such file or directory'); }
    async loadForUser() { throw new Error('ENOENT: no such file or directory'); }
    async exists() { return false; }
    async delete() { throw new Error('ENOENT: no such file or directory'); }
    async cleanup() { /* no-op */ }
    async backup() { throw new Error('ENOENT: no such file or directory'); }
};

module.exports = {
    StorageFactory: {
        createUserStorage(config, defaultData) {
            // Return failing mock for error testing
            if (config && config.json && config.json.baseDir && config.json.baseDir.includes('/invalid/path')) {
                return new FailingMockStorage();
            }
            return new MockUserStorage(defaultData);
        }
    }
}; 