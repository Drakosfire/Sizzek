/**
 * JSON File Storage Implementation
 * Part of the Sizzek MCP Data project
 * 
 * Features:
 * - File-based storage with user isolation
 * - Atomic writes with backup protection
 * - Independent operation (no external dependencies)
 * - Cross-platform file system support
 */

import { promises as fs } from 'fs';
import path from 'path';
import { UserStorageInterface, StorageStats, StorageHealthInterface } from './StorageInterface.js';

export interface JsonStorageConfig {
    baseDir: string;
    createDirIfNotExists?: boolean;
    backupEnabled?: boolean;
    compressionEnabled?: boolean;
}

export class JsonUserStorage<T> implements UserStorageInterface<T>, StorageHealthInterface {
    private config: JsonStorageConfig;
    private defaultData: T;

    constructor(config: JsonStorageConfig, defaultData: T) {
        this.config = {
            createDirIfNotExists: true,
            backupEnabled: true,
            compressionEnabled: false,
            ...config
        };
        this.defaultData = defaultData;
    }

    private getUserFilePath(userId: string): string {
        // Create user-specific subdirectory
        const userDir = path.join(this.config.baseDir, 'users', userId);
        return path.join(userDir, 'data.json');
    }

    private getBackupFilePath(userId: string): string {
        const filePath = this.getUserFilePath(userId);
        return `${filePath}.backup`;
    }

    private getTempFilePath(userId: string): string {
        const filePath = this.getUserFilePath(userId);
        return `${filePath}.tmp`;
    }

    async saveForUser(userId: string, data: T): Promise<void> {
        const filePath = this.getUserFilePath(userId);
        const tempPath = this.getTempFilePath(userId);
        const backupPath = this.getBackupFilePath(userId);
        const dir = path.dirname(filePath);

        // Ensure directory exists
        if (this.config.createDirIfNotExists) {
            await fs.mkdir(dir, { recursive: true });
        }

        try {
            // Create backup if file exists and backup is enabled
            if (this.config.backupEnabled && await this.existsForUser(userId)) {
                await fs.copyFile(filePath, backupPath);
            }

            // Prepare data with metadata
            const documentData = {
                userId,
                data,
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                version: '1.0.0',
                dataType: 'json-storage'
            };

            // Write to temp file first (atomic operation)
            const jsonContent = JSON.stringify(documentData, null, 2);
            await fs.writeFile(tempPath, jsonContent, 'utf8');

            // Atomic rename
            await fs.rename(tempPath, filePath);

            // Remove backup on success (if backup was enabled)
            if (this.config.backupEnabled) {
                try {
                    await fs.unlink(backupPath);
                } catch {
                    // Ignore backup cleanup errors
                }
            }
        } catch (error) {
            // Cleanup temp file on error
            try {
                await fs.unlink(tempPath);
            } catch {
                // Ignore cleanup errors
            }
            throw new Error(`Failed to save data for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async loadForUser(userId: string): Promise<T> {
        const filePath = this.getUserFilePath(userId);
        const backupPath = this.getBackupFilePath(userId);

        try {
            const data = await fs.readFile(filePath, 'utf-8');
            const document = JSON.parse(data);

            // Return the actual data, not the wrapper
            return document.data || document; // Support both new and legacy formats
        } catch (error) {
            // Try backup file if enabled
            if (this.config.backupEnabled) {
                try {
                    const backupData = await fs.readFile(backupPath, 'utf-8');
                    const document = JSON.parse(backupData);
                    console.warn(`[JsonStorage] Using backup file for user ${userId}`);
                    return document.data || document; // Support both formats
                } catch {
                    // Fall through to default data
                }
            }

            // Return default data if no file exists
            return structuredClone(this.defaultData);
        }
    }

    async existsForUser(userId: string): Promise<boolean> {
        try {
            await fs.access(this.getUserFilePath(userId));
            return true;
        } catch {
            return false;
        }
    }

    async clearForUser(userId: string): Promise<void> {
        const filePath = this.getUserFilePath(userId);
        const backupPath = this.getBackupFilePath(userId);

        try {
            await fs.unlink(filePath);
        } catch {
            // File doesn't exist, that's fine
        }

        // Also remove backup if it exists
        try {
            await fs.unlink(backupPath);
        } catch {
            // Backup doesn't exist, that's fine
        }
    }

    async listUsers(): Promise<string[]> {
        const usersDir = path.join(this.config.baseDir, 'users');
        try {
            const entries = await fs.readdir(usersDir, { withFileTypes: true });
            const userDirs = entries
                .filter(entry => entry.isDirectory())
                .map(entry => entry.name);

            // Filter to only users that actually have data files
            const validUsers: string[] = [];
            for (const userId of userDirs) {
                if (await this.existsForUser(userId)) {
                    validUsers.push(userId);
                }
            }

            return validUsers;
        } catch {
            return [];
        }
    }

    // Health monitoring methods
    async healthCheck(): Promise<boolean> {
        try {
            // Test that we can create the base directory and write to it
            const testDir = path.join(this.config.baseDir, '.health-check');
            const testFile = path.join(testDir, 'test.json');

            await fs.mkdir(testDir, { recursive: true });
            await fs.writeFile(testFile, '{"test": true}', 'utf8');
            await fs.readFile(testFile, 'utf8');

            // Cleanup
            await fs.unlink(testFile);
            await fs.rmdir(testDir);

            return true;
        } catch (error) {
            console.error('[JsonStorage] Health check failed:', error);
            return false;
        }
    }

    async getStats(): Promise<StorageStats> {
        try {
            const users = await this.listUsers();
            let totalSize = 0;

            // Calculate total size of all user data files
            for (const userId of users) {
                try {
                    const filePath = this.getUserFilePath(userId);
                    const stats = await fs.stat(filePath);
                    totalSize += stats.size;
                } catch {
                    // Ignore errors for individual files
                }
            }

            return {
                totalUsers: users.length,
                totalSize,
                lastAccessed: new Date(),
                collections: ['json-files']
            };
        } catch (error) {
            return {
                totalUsers: 0,
                totalSize: 0,
                lastAccessed: new Date(),
                collections: []
            };
        }
    }

    async cleanup(): Promise<void> {
        try {
            const users = await this.listUsers();
            let cleanedCount = 0;

            // Clean up old backup files and empty directories
            for (const userId of users) {
                const backupPath = this.getBackupFilePath(userId);
                try {
                    // Remove backup files older than 7 days
                    const stats = await fs.stat(backupPath);
                    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

                    if (stats.mtime < sevenDaysAgo) {
                        await fs.unlink(backupPath);
                        cleanedCount++;
                    }
                } catch {
                    // File doesn't exist or other error, ignore
                }
            }

            if (cleanedCount > 0) {
                console.log(`[JsonStorage] Cleaned up ${cleanedCount} old backup files`);
            }
        } catch (error) {
            console.warn('[JsonStorage] Cleanup failed:', error);
        }
    }

    // Legacy compatibility methods
    async save(data: T): Promise<void> {
        await this.saveForUser('default', data);
    }

    async load(): Promise<T> {
        return await this.loadForUser('default');
    }

    async exists(): Promise<boolean> {
        return await this.existsForUser('default');
    }

    async clear(): Promise<void> {
        await this.clearForUser('default');
    }

    async backup(): Promise<string> {
        try {
            const users = await this.listUsers();
            const backupData = {
                timestamp: new Date().toISOString(),
                storageType: 'json',
                baseDir: this.config.baseDir,
                version: '1.0.0',
                totalUsers: users.length,
                users: {} as Record<string, T>
            };

            // Collect all user data
            for (const userId of users) {
                try {
                    backupData.users[userId] = await this.loadForUser(userId);
                } catch (error) {
                    console.warn(`[JsonStorage] Failed to backup user ${userId}:`, error);
                }
            }

            return JSON.stringify(backupData, null, 2);
        } catch (error) {
            throw new Error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Additional utility methods specific to JSON storage
    async getFileInfo(userId: string): Promise<{
        exists: boolean;
        size: number;
        lastModified: Date;
        hasBackup: boolean;
    } | null> {
        try {
            const filePath = this.getUserFilePath(userId);
            const backupPath = this.getBackupFilePath(userId);

            const [fileStats, hasBackup] = await Promise.all([
                fs.stat(filePath),
                fs.access(backupPath).then(() => true).catch(() => false)
            ]);

            return {
                exists: true,
                size: fileStats.size,
                lastModified: fileStats.mtime,
                hasBackup
            };
        } catch {
            return null;
        }
    }
} 