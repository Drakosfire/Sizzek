import { StorageFactory } from 'mcp-data';
import { UserStorageInterface } from 'mcp-data';
import { Task } from '../types/index.js';
import { TaskStorageData, TaskStorageManagerConfig, MigrationInfo, StorageHealth } from '../types/storage.js';
import { JsonToUnifiedMigrator } from './migration/JsonToUnifiedMigrator.js';
import path from 'path';

export class TaskStorageManager {
    private storage: UserStorageInterface<TaskStorageData>;
    private config: TaskStorageManagerConfig;
    private migrator: JsonToUnifiedMigrator;
    private operationLocks: Map<string, Promise<any>> = new Map();

    constructor(config?: Partial<TaskStorageManagerConfig>) {
        this.config = this.buildConfig(config);
        this.storage = this.createStorage();
        this.migrator = new JsonToUnifiedMigrator(this.config);
    }

    /**
     * Initialize the storage manager
     */
    async initialize(): Promise<void> {
        console.log('🔧 Initializing TaskStorageManager...');
        console.log(`📊 Storage type: ${this.config.storageType}`);
        console.log(`👤 User-based: ${this.config.userBased}`);

        // Check for migration requirements
        if (this.config.migrationConfig?.autoMigrate) {
            const migrationInfo = await this.checkMigrationNeeded();
            if (migrationInfo.required) {
                console.log('🔄 Migration required from legacy storage format');
                await this.performMigration();
            }
        }

        console.log('✅ TaskStorageManager initialized successfully');
    }

    /**
     * Load all tasks for a user or default storage
     */
    async loadTasks(userId?: string): Promise<Task[]> {
        const effectiveUserId = userId || this.config.defaultUserId || 'default';

        return await this.withLock(effectiveUserId, async () => {
            try {
                let data: TaskStorageData;

                if (this.config.userBased && userId) {
                    data = await this.storage.loadForUser(effectiveUserId);
                } else {
                    data = await this.storage.load();
                }

                console.log(`📖 Loaded ${data.tasks.length} tasks for user ${effectiveUserId}`);

                // Convert string dates back to Date objects
                const tasks = this.convertStringDatesToObjects(data.tasks);
                return tasks;

            } catch (error: any) {
                console.warn(`⚠️ Failed to load tasks for user ${effectiveUserId}:`, error.message);

                // Return empty array if storage doesn't exist yet
                if (error.message?.includes('not found') || error.code === 'ENOENT') {
                    return [];
                }

                throw error;
            }
        });
    }

    /**
     * Save all tasks for a user or default storage
     */
    async saveTasks(tasks: Task[], userId?: string): Promise<void> {
        const effectiveUserId = userId || this.config.defaultUserId || 'default';

        return await this.withLock(effectiveUserId, async () => {
            const data: TaskStorageData = {
                tasks,
                metadata: {
                    version: '2.0.0',
                    lastBackup: new Date(),
                    totalTasks: tasks.length,
                    lastModified: new Date(),
                    storageType: this.config.storageType
                }
            };

            try {
                if (this.config.userBased && userId) {
                    await this.storage.saveForUser(effectiveUserId, data);
                } else {
                    await this.storage.save(data);
                }

                console.log(`💾 Saved ${tasks.length} tasks for user ${effectiveUserId}`);

            } catch (error: any) {
                console.error(`❌ Failed to save tasks for user ${effectiveUserId}:`, error.message);
                throw error;
            }
        });
    }

    /**
     * Create a backup of current tasks
     */
    async createBackup(userId?: string): Promise<string> {
        const tasks = await this.loadTasks(userId);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `tasks-backup-${timestamp}`;

        // For JSON storage, we can use the built-in backup functionality
        if (this.config.storageType === 'json' && this.storage.backup) {
            return await this.storage.backup();
        }

        // For MongoDB or other storage, manual backup would require implementation
        // based on specific storage backend capabilities
        console.log(`📦 Created backup: ${backupName} with ${tasks.length} tasks`);
        return backupName;
    }

    /**
     * Get storage health information
     */
    async getStorageHealth(userId?: string): Promise<StorageHealth> {
        try {
            const tasks = await this.loadTasks(userId);

            return {
                healthy: true,
                storageType: this.config.storageType,
                userBased: this.config.userBased,
                taskCount: tasks.length,
                lastAccess: new Date(),
                totalSize: JSON.stringify(tasks).length, // Approximate size
                backupCount: this.config.jsonConfig?.maxBackups || undefined
            };
        } catch (error: any) {
            return {
                healthy: false,
                storageType: this.config.storageType,
                userBased: this.config.userBased,
                taskCount: 0,
                lastAccess: new Date(),
                totalSize: 0,
                error: error.message
            };
        }
    }

    /**
     * Clean up storage connections
     */
    async cleanup(): Promise<void> {
        // Close storage connections to prevent hanging
        if (this.storage && 'disconnect' in this.storage && typeof (this.storage as any).disconnect === 'function') {
            await (this.storage as any).disconnect();
        }
        console.log('🧹 TaskStorageManager cleanup completed');
    }

    // Private methods

    private buildConfig(config?: Partial<TaskStorageManagerConfig>): TaskStorageManagerConfig {
        const storageType = (process.env.MCP_STORAGE_TYPE as 'json' | 'mongodb') || 'json';

        return {
            storageType,
            userBased: process.env.MCP_USER_BASED === 'true',
            defaultUserId: process.env.MCP_USER_ID || 'default',

            jsonConfig: storageType === 'json' ? {
                filePath: process.env.TASKS_FILE_PATH || './tasks.json',
                backupEnabled: process.env.MCP_BACKUP_ENABLED !== 'false',
                maxBackups: parseInt(process.env.MCP_BACKUP_MAX_FILES || '30'),
                backupInterval: parseInt(process.env.MCP_BACKUP_INTERVAL || '60')
            } : undefined,

            mongoConfig: storageType === 'mongodb' ? {
                connectionString: process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017/LibreChat',
                databaseName: process.env.MONGODB_DATABASE || 'LibreChat',
                collectionName: process.env.MONGODB_COLLECTION || 'scheduled_tasks',
                timeout: parseInt(process.env.MCP_MONGODB_TIMEOUT || '10000'),
                maxRetries: parseInt(process.env.MCP_MONGODB_RETRIES || '3'),
                encryptionKey: process.env.CREDS_KEY
            } : undefined,

            migrationConfig: {
                autoMigrate: process.env.MCP_AUTO_MIGRATE !== 'false',
                keepBackup: process.env.MCP_KEEP_MIGRATION_BACKUP !== 'false',
                debugMode: process.env.MCP_MIGRATION_DEBUG === 'true'
            },

            ...config
        };
    }

    private createStorage(): UserStorageInterface<TaskStorageData> {
        const defaultData: TaskStorageData = {
            tasks: [],
            metadata: {
                version: '2.0.0',
                lastBackup: new Date(),
                totalTasks: 0,
                lastModified: new Date(),
                storageType: this.config.storageType
            }
        };

        const unifiedConfig = {
            type: this.config.storageType,
            mongodb: this.config.mongoConfig ? {
                connectionString: this.config.mongoConfig.connectionString,
                databaseName: this.config.mongoConfig.databaseName,
                collectionName: this.config.mongoConfig.collectionName,
                connectionTimeout: this.config.mongoConfig.timeout,
                maxRetries: this.config.mongoConfig.maxRetries,
                encryptionKey: this.config.mongoConfig.encryptionKey
            } : undefined,
            json: this.config.jsonConfig ? {
                baseDir: path.dirname(this.config.jsonConfig.filePath),
                createDirIfNotExists: true,
                backupEnabled: this.config.jsonConfig.backupEnabled
            } : undefined
        };

        return StorageFactory.createUserStorage(unifiedConfig as any, defaultData);
    }

    private async withLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
        const lockKey = `user_${userId}`;

        // Wait for existing operation to complete
        while (this.operationLocks.has(lockKey)) {
            try {
                await this.operationLocks.get(lockKey);
            } catch (error: any) {
                // Previous operation failed, but lock should be cleaned up
                console.warn(`Previous operation failed for user ${userId}: ${error.message}`);
            }
            // Small delay to prevent tight loops
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Create new operation promise
        const operationPromise = (async () => {
            try {
                return await operation();
            } catch (error: any) {
                console.error(`Operation failed for user ${userId}: ${error.message}`);
                throw error;
            }
        })();

        this.operationLocks.set(lockKey, operationPromise);

        try {
            const result = await operationPromise;
            return result;
        } finally {
            // Clean up the lock
            this.operationLocks.delete(lockKey);
        }
    }

    private async checkMigrationNeeded(): Promise<MigrationInfo> {
        return await this.migrator.checkMigrationNeeded();
    }

    private async performMigration(): Promise<void> {
        await this.migrator.migrate();
    }

    /**
     * Convert string dates back to Date objects after JSON deserialization
     */
    private convertStringDatesToObjects(tasks: Task[]): Task[] {
        return tasks.map(task => ({
            ...task,
            createdAt: this.convertToDate(task.createdAt),
            updatedAt: this.convertToDate(task.updatedAt),
            lastRun: task.lastRun ? this.convertToDate(task.lastRun) : undefined,
            nextRun: task.nextRun ? this.convertToDate(task.nextRun) : undefined
        }));
    }

    /**
     * Convert a value to Date object if it's a string
     */
    private convertToDate(value: any): Date {
        if (value instanceof Date) {
            return value;
        }
        if (typeof value === 'string') {
            return new Date(value);
        }
        return value;
    }
} 