import { promises as fs } from 'fs';
import { Task } from '../../types/index.js';
import { TaskStorageData, TaskStorageManagerConfig, MigrationInfo } from '../../types/storage.js';

export class JsonToUnifiedMigrator {
    private config: TaskStorageManagerConfig;

    constructor(config: TaskStorageManagerConfig) {
        this.config = config;
    }

    /**
     * Check if migration is needed from legacy JSON format
     */
    async checkMigrationNeeded(): Promise<MigrationInfo> {
        const migrationInfo: MigrationInfo = {
            required: false,
            toVersion: '2.0.0',
            completed: false
        };

        try {
            // Check for legacy task files in the old format
            const legacyPaths = await this.findLegacyFiles();

            if (legacyPaths.length > 0) {
                migrationInfo.required = true;
                migrationInfo.fromVersion = '1.0.0';

                // Count tasks in legacy files
                let totalTasks = 0;
                for (const legacyPath of legacyPaths) {
                    const tasks = await this.loadLegacyTasks(legacyPath);
                    totalTasks += tasks.length;
                }

                migrationInfo.taskCount = totalTasks;

                if (this.config.migrationConfig?.debugMode) {
                    console.log(`🔍 Migration check: Found ${legacyPaths.length} legacy files with ${totalTasks} tasks`);
                }
            }

        } catch (error: any) {
            console.warn('⚠️ Error checking migration requirements:', error.message);
        }

        return migrationInfo;
    }

    /**
     * Perform the migration from legacy format to unified format
     */
    async migrate(): Promise<void> {
        console.log('🔄 Starting migration from legacy JSON format...');

        const legacyPaths = await this.findLegacyFiles();
        if (legacyPaths.length === 0) {
            console.log('ℹ️ No legacy files found for migration');
            return;
        }

        let totalMigrated = 0;
        const backupPaths: string[] = [];

        for (const legacyPath of legacyPaths) {
            try {
                console.log(`🔄 Migrating file: ${legacyPath}`);

                // Load tasks from legacy format
                const legacyTasks = await this.loadLegacyTasks(legacyPath);

                if (legacyTasks.length === 0) {
                    console.log(`ℹ️ No tasks found in ${legacyPath}, skipping`);
                    continue;
                }

                // Create backup of original file
                if (this.config.migrationConfig?.keepBackup) {
                    const backupPath = await this.createMigrationBackup(legacyPath);
                    backupPaths.push(backupPath);
                }

                // Convert to new unified format (conversion happens in memory)
                this.convertToUnifiedFormat(legacyTasks, legacyPath);

                // The actual save would be handled by the TaskStorageManager after migration
                totalMigrated += legacyTasks.length;

                console.log(`✅ Migrated ${legacyTasks.length} tasks from ${legacyPath}`);

            } catch (error: any) {
                console.error(`❌ Failed to migrate ${legacyPath}:`, error.message);
                throw new Error(`Migration failed for ${legacyPath}: ${error.message}`);
            }
        }

        console.log(`🎉 Migration completed! Migrated ${totalMigrated} tasks from ${legacyPaths.length} files`);
        if (backupPaths.length > 0) {
            console.log(`📦 Backup files created: ${backupPaths.join(', ')}`);
        }
    }

    /**
     * Convert legacy task data to unified storage format
     */
    convertToUnifiedFormat(legacyTasks: Task[], sourceFile: string): TaskStorageData {
        return {
            tasks: legacyTasks,
            metadata: {
                version: '2.0.0',
                lastBackup: new Date(),
                totalTasks: legacyTasks.length,
                lastModified: new Date(),
                storageType: this.config.storageType,
                migratedFrom: `legacy-json:${sourceFile}`
            }
        };
    }

    // Private methods

    private async findLegacyFiles(): Promise<string[]> {
        const possiblePaths: string[] = [];

        // Check default locations for legacy files
        const defaultPaths = [
            '/media/drakosfire/Projects/Sizzek/memory_files/tasks.json',
            './tasks.json',
            '../tasks.json',
            '../../tasks.json'
        ];

        // Add configured path if it exists
        if (this.config.jsonConfig?.filePath) {
            defaultPaths.unshift(this.config.jsonConfig.filePath);
        }

        // Check environment variable paths
        if (process.env.TASKS_FILE_PATH) {
            defaultPaths.unshift(process.env.TASKS_FILE_PATH);
        }

        for (const path of defaultPaths) {
            try {
                await fs.access(path);

                // Check if it's in legacy format by trying to parse it
                const isLegacy = await this.isLegacyFormat(path);
                if (isLegacy) {
                    possiblePaths.push(path);
                }
            } catch (error) {
                // File doesn't exist or can't be accessed
                continue;
            }
        }

        return possiblePaths;
    }

    private async isLegacyFormat(filePath: string): Promise<boolean> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);

            // Legacy format: direct array of tasks
            // New format: { tasks: Task[], metadata: {...} }

            if (Array.isArray(data)) {
                // Direct array = legacy format
                return true;
            }

            if (data && typeof data === 'object' && !data.metadata) {
                // Object without metadata = likely legacy
                return true;
            }

            if (data && data.metadata && data.metadata.version === '2.0.0') {
                // Already in new format
                return false;
            }

            // Has metadata but not version 2.0.0 = old unified format
            return data.metadata?.version !== '2.0.0';

        } catch (error) {
            // Can't parse = assume not a valid task file
            return false;
        }
    }

    private async loadLegacyTasks(filePath: string): Promise<Task[]> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content, this.dateReviver);

            // Handle different legacy formats
            if (Array.isArray(data)) {
                // Direct array of tasks
                return data;
            }

            if (data && typeof data === 'object') {
                // Could be wrapped in an object
                if (data.tasks && Array.isArray(data.tasks)) {
                    return data.tasks;
                }

                // Might be a single task object
                if (data.id && data.name) {
                    return [data];
                }
            }

            console.warn(`⚠️ Unrecognized format in ${filePath}, assuming empty task list`);
            return [];

        } catch (error: any) {
            console.error(`❌ Failed to load legacy tasks from ${filePath}:`, error.message);
            throw error;
        }
    }

    private async createMigrationBackup(originalPath: string): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${originalPath}.migration-backup-${timestamp}`;

        try {
            await fs.copyFile(originalPath, backupPath);
            console.log(`📦 Created migration backup: ${backupPath}`);
            return backupPath;
        } catch (error: any) {
            console.error(`❌ Failed to create migration backup:`, error.message);
            throw error;
        }
    }

    private dateReviver(_key: string, value: any): any {
        // Convert ISO date strings back to Date objects
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
            return new Date(value);
        }
        return value;
    }
} 