import { Task } from './index.js';

/**
 * Task storage data structure for unified storage system
 */
export interface TaskStorageData {
    tasks: Task[];
    metadata: {
        version: string;
        lastBackup: Date;
        totalTasks: number;
        lastModified: Date;
        storageType: 'json' | 'mongodb';
        migratedFrom?: string; // Original storage system version
    };
}

/**
 * Configuration for the task storage manager
 */
export interface TaskStorageManagerConfig {
    // Storage type selection
    storageType: 'json' | 'mongodb';

    // User isolation
    userBased: boolean;
    defaultUserId?: string | undefined;

    // JSON storage specific
    jsonConfig?: {
        filePath: string;
        backupEnabled: boolean;
        maxBackups: number;
        backupInterval: number;
    } | undefined;

    // MongoDB storage specific
    mongoConfig?: {
        connectionString: string;
        databaseName: string;
        collectionName: string;
        timeout: number;
        maxRetries: number;
        encryptionKey?: string | undefined;
    } | undefined;
}

/**
 * Storage health and statistics
 */
export interface StorageHealth {
    healthy: boolean;
    storageType: 'json' | 'mongodb';
    userBased: boolean;
    taskCount: number;
    lastAccess: Date;
    totalSize: number; // in bytes
    backupCount?: number | undefined;
    error?: string | undefined;
} 