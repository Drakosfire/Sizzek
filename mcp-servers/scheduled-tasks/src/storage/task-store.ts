import { promises as fs } from 'fs';
import { join } from 'path';
import { Task } from '../types/index.js';

export interface TaskStoreConfig {
    dataDir: string;
    tasksFile: string;
    backupDir: string;
    maxBackups: number;
    backupInterval: number; // minutes between backups
}

export interface TaskStoreMetadata {
    version: string;
    lastBackup: Date;
    totalTasks: number;
    lastModified: Date;
    checksums: {
        primary: string;
        backup: string;
    };
}

export class TaskStore {
    private config: TaskStoreConfig;
    private writeQueue: Promise<void> = Promise.resolve();
    private lastBackupTime: Date = new Date(0);

    constructor(config: Partial<TaskStoreConfig> = {}) {
        this.config = {
            dataDir: config.dataDir || '/media/drakosfire/Projects/Sizzek/memory_files',
            tasksFile: config.tasksFile || 'tasks.json',
            backupDir: config.backupDir || '/media/drakosfire/Projects/Sizzek/memory_files/backups',
            maxBackups: config.maxBackups || 30,
            backupInterval: config.backupInterval || 60 // 1 hour
        };
    }

    async initialize(): Promise<void> {
        console.log('🔧 Initializing TaskStore...');

        // Ensure directories exist
        await this.ensureDirectory(this.config.dataDir);
        await this.ensureDirectory(this.config.backupDir);

        // Verify file integrity on startup
        await this.verifyIntegrity();

        console.log('✅ TaskStore initialized successfully');
    }

    async loadTasks(): Promise<Task[]> {
        console.log('📖 Loading tasks from storage...');

        // Wait for any pending writes to complete
        await this.writeQueue;

        const tasksFilePath = this.getTasksFilePath();

        try {
            const data = await fs.readFile(tasksFilePath, 'utf-8');
            const tasks = JSON.parse(data, this.dateReviver);

            // Validate loaded data
            this.validateTaskData(tasks);

            console.log(`📖 Loaded ${tasks.length} tasks successfully`);
            return tasks;

        } catch (error) {
            console.warn('⚠️  Primary tasks file error, attempting recovery...', error);
            return await this.recoverFromBackup();
        }
    }

    async saveTasks(tasks: Task[]): Promise<void> {
        console.log(`💾 Saving ${tasks.length} tasks to storage...`);

        // Queue write operation to prevent race conditions
        this.writeQueue = this.writeQueue.then(() => this.performAtomicWrite(tasks));
        await this.writeQueue;

        // Create backup if enough time has passed
        await this.createPeriodicBackup(tasks);

        console.log('✅ Tasks saved successfully');
    }

    async createBackup(tasks: Task[]): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `tasks-${timestamp}.json`;
        const backupPath = join(this.config.backupDir, backupFileName);

        try {
            const backupData = {
                metadata: {
                    version: '1.0.0',
                    createdAt: new Date().toISOString(),
                    taskCount: tasks.length,
                    checksum: await this.calculateChecksum(JSON.stringify(tasks))
                },
                tasks: tasks
            };

            await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');

            // Clean up old backups
            await this.cleanupOldBackups();

            console.log(`📦 Created backup: ${backupFileName}`);
            return backupPath;

        } catch (error) {
            console.error('❌ Failed to create backup:', error);
            throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async listBackups(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.config.backupDir);
            return files
                .filter(file => file.startsWith('tasks-') && file.endsWith('.json'))
                .sort()
                .reverse(); // Newest first
        } catch (error) {
            console.warn('Failed to list backups:', error);
            return [];
        }
    }

    async restoreFromBackup(backupFileName?: string): Promise<Task[]> {
        console.log('🔄 Restoring from backup...');

        const backups = await this.listBackups();
        if (backups.length === 0) {
            throw new Error('No backups available for restoration');
        }

        const targetBackup = backupFileName || backups[0]; // Use latest if not specified
        const backupPath = join(this.config.backupDir, targetBackup);

        try {
            const backupData = await fs.readFile(backupPath, 'utf-8');
            const backup = JSON.parse(backupData, this.dateReviver);

            // Validate backup structure
            if (!backup.tasks || !Array.isArray(backup.tasks)) {
                throw new Error('Invalid backup format');
            }

            // Verify checksum if available
            if (backup.metadata?.checksum) {
                const calculatedChecksum = await this.calculateChecksum(JSON.stringify(backup.tasks));
                if (calculatedChecksum !== backup.metadata.checksum) {
                    console.warn('⚠️  Backup checksum mismatch - data may be corrupted');
                }
            }

            // Restore to primary file
            await this.saveTasks(backup.tasks);

            console.log(`✅ Restored ${backup.tasks.length} tasks from backup: ${targetBackup}`);
            return backup.tasks;

        } catch (error) {
            console.error(`❌ Failed to restore from backup ${targetBackup}:`, error);
            throw new Error(`Backup restoration failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async getStorageStats(): Promise<{
        totalTasks: number;
        fileSize: number;
        lastModified: Date;
        backupCount: number;
        oldestBackup?: string;
        newestBackup?: string;
    }> {
        const tasksFilePath = this.getTasksFilePath();
        const tasks = await this.loadTasks();
        const backups = await this.listBackups();

        let fileSize = 0;
        let lastModified = new Date(0);

        try {
            const stats = await fs.stat(tasksFilePath);
            fileSize = stats.size;
            lastModified = stats.mtime;
        } catch (error) {
            console.warn('Could not get file stats:', error);
        }

        return {
            totalTasks: tasks.length,
            fileSize,
            lastModified,
            backupCount: backups.length,
            oldestBackup: backups[backups.length - 1],
            newestBackup: backups[0]
        };
    }

    // Private methods

    private async performAtomicWrite(tasks: Task[]): Promise<void> {
        const tasksFilePath = this.getTasksFilePath();
        const tempFilePath = `${tasksFilePath}.tmp`;
        const backupFilePath = `${tasksFilePath}.backup`;

        try {
            // Validate tasks before writing
            this.validateTaskData(tasks);

            // 1. Write to temporary file
            const jsonData = JSON.stringify(tasks, null, 2);
            await fs.writeFile(tempFilePath, jsonData, 'utf-8');

            // 2. Verify written data
            const writtenData = await fs.readFile(tempFilePath, 'utf-8');
            const verifyTasks = JSON.parse(writtenData, this.dateReviver);
            if (verifyTasks.length !== tasks.length) {
                throw new Error('Data verification failed - task count mismatch');
            }

            // 3. Create backup of existing file
            try {
                await fs.access(tasksFilePath);
                await fs.copyFile(tasksFilePath, backupFilePath);
            } catch (error) {
                // Original file doesn't exist, that's okay
                console.log('No existing file to backup');
            }

            // 4. Atomic rename (OS-guaranteed atomicity)
            await fs.rename(tempFilePath, tasksFilePath);

            // 5. Set proper permissions
            await fs.chmod(tasksFilePath, 0o644);

            console.log(`💾 Atomic write completed: ${tasks.length} tasks`);

        } catch (error) {
            // Clean up temporary file if it exists
            try {
                await fs.unlink(tempFilePath);
            } catch (cleanupError) {
                console.warn('Failed to cleanup temp file:', cleanupError);
            }

            throw new Error(`Atomic write failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async createPeriodicBackup(tasks: Task[]): Promise<void> {
        const now = new Date();
        const timeSinceLastBackup = now.getTime() - this.lastBackupTime.getTime();
        const backupIntervalMs = this.config.backupInterval * 60 * 1000;

        if (timeSinceLastBackup >= backupIntervalMs) {
            try {
                await this.createBackup(tasks);
                this.lastBackupTime = now;
            } catch (error) {
                console.warn('Periodic backup failed:', error);
                // Don't throw - backup failure shouldn't prevent task saving
            }
        }
    }

    private async recoverFromBackup(): Promise<Task[]> {
        console.log('🔄 Attempting recovery from backup files...');

        const tasksFilePath = this.getTasksFilePath();
        const immediateBackupPath = `${tasksFilePath}.backup`;

        // Try immediate backup first
        try {
            const backupData = await fs.readFile(immediateBackupPath, 'utf-8');
            const tasks = JSON.parse(backupData, this.dateReviver);
            this.validateTaskData(tasks);

            // Restore from immediate backup
            await fs.copyFile(immediateBackupPath, tasksFilePath);
            console.log('✅ Recovered from immediate backup');
            return tasks;

        } catch (error) {
            console.warn('Immediate backup recovery failed:', error);
        }

        // Try timestamped backups
        const backups = await this.listBackups();
        for (const backup of backups) {
            try {
                console.log(`Trying backup: ${backup}`);
                return await this.restoreFromBackup(backup);
            } catch (error) {
                console.warn(`Failed to restore from ${backup}:`, error);
                continue;
            }
        }

        // If all backups failed, create empty task store
        console.warn('⚠️  All recovery attempts failed, initializing empty task store');
        await this.initializeEmptyTaskStore();
        return [];
    }

    private async initializeEmptyTaskStore(): Promise<void> {
        const emptyTasks: Task[] = [];
        const tasksFilePath = this.getTasksFilePath();

        await fs.writeFile(tasksFilePath, JSON.stringify(emptyTasks, null, 2), 'utf-8');
        console.log('📝 Initialized empty task store');
    }

    private async cleanupOldBackups(): Promise<void> {
        try {
            const backups = await this.listBackups();

            if (backups.length > this.config.maxBackups) {
                const backupsToDelete = backups.slice(this.config.maxBackups);

                for (const backup of backupsToDelete) {
                    const backupPath = join(this.config.backupDir, backup);
                    await fs.unlink(backupPath);
                    console.log(`🗑️  Deleted old backup: ${backup}`);
                }

                console.log(`🧹 Cleaned up ${backupsToDelete.length} old backups`);
            }
        } catch (error) {
            console.warn('Failed to cleanup old backups:', error);
        }
    }

    private async verifyIntegrity(): Promise<void> {
        const tasksFilePath = this.getTasksFilePath();

        try {
            await fs.access(tasksFilePath);
            const data = await fs.readFile(tasksFilePath, 'utf-8');
            const tasks = JSON.parse(data, this.dateReviver);
            this.validateTaskData(tasks);
            console.log('✅ Task file integrity verified');
        } catch (error) {
            console.warn('⚠️  Task file integrity check failed:', error);
            // Don't throw - recovery will handle this
        }
    }

    private validateTaskData(tasks: any): void {
        if (!Array.isArray(tasks)) {
            throw new Error('Tasks data must be an array');
        }

        for (const task of tasks) {
            if (!task.id || typeof task.id !== 'string') {
                throw new Error('Task missing valid id field');
            }
            if (!task.name || typeof task.name !== 'string') {
                throw new Error('Task missing valid name field');
            }
            if (!task.schedule || typeof task.schedule !== 'object') {
                throw new Error('Task missing valid schedule field');
            }
        }
    }

    private async calculateChecksum(data: string): Promise<string> {
        const crypto = await import('crypto');
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    private async ensureDirectory(dirPath: string): Promise<void> {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
        }
    }

    private getTasksFilePath(): string {
        return join(this.config.dataDir, this.config.tasksFile);
    }

    private dateReviver(_key: string, value: any): any {
        // Convert ISO date strings back to Date objects
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
            return new Date(value);
        }
        return value;
    }
} 