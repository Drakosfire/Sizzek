/**
 * MCP Data Storage Abstraction Layer
 * Part of the Sizzek project - Independent storage system for MCP servers
 * Can be used with LibreChat or any other MCP host
 */

export interface StorageInterface<T> {
    save(data: T): Promise<void>;
    load(): Promise<T>;
    exists(): Promise<boolean>;
    clear(): Promise<void>;
    backup?(): Promise<string>; // Optional backup functionality
}

export interface UserStorageInterface<T> extends StorageInterface<T> {
    saveForUser(userId: string, data: T): Promise<void>;
    loadForUser(userId: string): Promise<T>;
    existsForUser(userId: string): Promise<boolean>;
    clearForUser(userId: string): Promise<void>;
    listUsers(): Promise<string[]>;
}

export interface EncryptedStorageInterface<T> extends UserStorageInterface<T> {
    saveEncrypted(userId: string, data: T, encryptionKey?: string): Promise<void>;
    loadDecrypted(userId: string, encryptionKey?: string): Promise<T>;

    // Batch operations for efficiency
    saveEncryptedBatch(userData: Record<string, T>, encryptionKey?: string): Promise<void>;
    loadDecryptedBatch(userIds: string[], encryptionKey?: string): Promise<Record<string, T>>;
}

export interface StorageStats {
    totalUsers: number;
    totalSize: number; // in bytes
    lastAccessed: Date;
    collections: string[];
}

export interface StorageHealthInterface {
    healthCheck(): Promise<boolean>;
    getStats(): Promise<StorageStats>;
    cleanup(): Promise<void>; // Remove expired or orphaned data
} 