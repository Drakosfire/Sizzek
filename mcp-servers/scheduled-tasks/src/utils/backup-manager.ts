import { TaskStore } from '../storage/task-store.js';
import { Task } from '../types/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface BackupInfo {
    filename: string;
    path: string;
    size: number;
    taskCount: number;
    createdAt: Date;
    checksum?: string;
    isValid: boolean;
}

export class BackupManager {
    private taskStore: TaskStore;

    constructor(memoryFilesPath: string = '/media/drakosfire/Projects/Sizzek/memory_files') {
        this.taskStore = new TaskStore({
            dataDir: memoryFilesPath,
            backupDir: join(memoryFilesPath, 'backups'),
            maxBackups: 50, // Keep more backups for production
            backupInterval: 30 // 30 minutes
        });
    }

    async initialize(): Promise<void> {
        await this.taskStore.initialize();
        console.log('✅ BackupManager initialized');
    }

    async createManualBackup(reason?: string): Promise<string> {
        console.log('📦 Creating manual backup...');

        const tasks = await this.taskStore.loadTasks();
        const backupPath = await this.taskStore.createBackup(tasks);

        if (reason) {
            // Add reason to backup metadata
            const backupData = JSON.parse(await fs.readFile(backupPath, 'utf-8'));
            backupData.metadata.reason = reason;
            backupData.metadata.manual = true;
            await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
        }

        console.log(`✅ Manual backup created: ${backupPath.split('/').pop()}`);
        return backupPath;
    }

    async listAllBackups(): Promise<BackupInfo[]> {
        console.log('📋 Listing all backups...');

        const backupFiles = await this.taskStore.listBackups();
        const backupInfos: BackupInfo[] = [];

        for (const filename of backupFiles) {
            try {
                const info = await this.getBackupInfo(filename);
                backupInfos.push(info);
            } catch (error) {
                console.warn(`Failed to read backup ${filename}:`, error);
                backupInfos.push({
                    filename,
                    path: '',
                    size: 0,
                    taskCount: 0,
                    createdAt: new Date(0),
                    isValid: false
                });
            }
        }

        return backupInfos;
    }

    async getBackupInfo(filename: string): Promise<BackupInfo> {
        const backupDir = join('/media/drakosfire/Projects/Sizzek/memory_files', 'backups');
        const backupPath = join(backupDir, filename);

        const stats = await fs.stat(backupPath);
        const content = await fs.readFile(backupPath, 'utf-8');

        try {
            const backupData = JSON.parse(content);

            return {
                filename,
                path: backupPath,
                size: stats.size,
                taskCount: backupData.metadata?.taskCount || backupData.tasks?.length || 0,
                createdAt: new Date(backupData.metadata?.createdAt || stats.birthtime),
                checksum: backupData.metadata?.checksum,
                isValid: true
            };
        } catch (error) {
            return {
                filename,
                path: backupPath,
                size: stats.size,
                taskCount: 0,
                createdAt: stats.birthtime,
                isValid: false
            };
        }
    }

    async restoreFromBackup(filename: string, confirm: boolean = false): Promise<Task[]> {
        if (!confirm) {
            throw new Error('Restoration requires explicit confirmation. Set confirm=true to proceed.');
        }

        console.log(`🔄 Restoring from backup: ${filename}`);

        // Create backup of current state before restoration
        await this.createManualBackup(`Pre-restoration backup before restoring ${filename}`);

        // Perform restoration
        const restoredTasks = await this.taskStore.restoreFromBackup(filename);

        console.log(`✅ Successfully restored ${restoredTasks.length} tasks from ${filename}`);
        return restoredTasks;
    }

    async verifyBackup(filename: string): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
        taskCount: number;
        checksumValid?: boolean;
    }> {
        console.log(`🔍 Verifying backup: ${filename}`);

        const result: {
            isValid: boolean;
            errors: string[];
            warnings: string[];
            taskCount: number;
            checksumValid?: boolean;
        } = {
            isValid: true,
            errors: [] as string[],
            warnings: [] as string[],
            taskCount: 0
        };

        const backupDir = join('/media/drakosfire/Projects/Sizzek/memory_files', 'backups');
        const backupPath = join(backupDir, filename);

        try {
            // Check file exists and is readable
            await fs.access(backupPath);
            const content = await fs.readFile(backupPath, 'utf-8');

            // Parse JSON
            let backupData;
            try {
                backupData = JSON.parse(content);
            } catch (parseError) {
                result.errors.push('Invalid JSON format');
                result.isValid = false;
                return result;
            }

            // Validate structure
            if (!backupData.tasks || !Array.isArray(backupData.tasks)) {
                result.errors.push('Missing or invalid tasks array');
                result.isValid = false;
            } else {
                result.taskCount = backupData.tasks.length;

                // Validate each task
                for (let i = 0; i < backupData.tasks.length; i++) {
                    const task = backupData.tasks[i];
                    if (!task.id) {
                        result.errors.push(`Task ${i} missing id field`);
                        result.isValid = false;
                    }
                    if (!task.name) {
                        result.errors.push(`Task ${i} missing name field`);
                        result.isValid = false;
                    }
                    if (!task.schedule) {
                        result.errors.push(`Task ${i} missing schedule field`);
                        result.isValid = false;
                    }
                }
            }

            // Verify checksum if available
            if (backupData.metadata?.checksum) {
                const crypto = await import('crypto');
                const calculatedChecksum = crypto
                    .createHash('sha256')
                    .update(JSON.stringify(backupData.tasks))
                    .digest('hex');

                result.checksumValid = calculatedChecksum === backupData.metadata.checksum;
                if (!result.checksumValid) {
                    result.warnings.push('Checksum mismatch - data may be corrupted');
                }
            }

            // Check file age
            const stats = await fs.stat(backupPath);
            const ageInDays = (Date.now() - stats.birthtime.getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays > 30) {
                result.warnings.push(`Backup is ${Math.round(ageInDays)} days old`);
            }

        } catch (error) {
            result.errors.push(`Failed to access backup file: ${error}`);
            result.isValid = false;
        }

        return result;
    }

    async cleanupOldBackups(keepCount: number = 30): Promise<number> {
        console.log(`🧹 Cleaning up old backups (keeping ${keepCount} most recent)...`);

        const backups = await this.taskStore.listBackups();
        const backupsToDelete = backups.slice(keepCount);

        if (backupsToDelete.length === 0) {
            console.log('No backups to clean up');
            return 0;
        }

        const backupDir = join('/media/drakosfire/Projects/Sizzek/memory_files', 'backups');
        let deletedCount = 0;

        for (const backup of backupsToDelete) {
            try {
                await fs.unlink(join(backupDir, backup));
                deletedCount++;
                console.log(`🗑️  Deleted: ${backup}`);
            } catch (error) {
                console.warn(`Failed to delete ${backup}:`, error);
            }
        }

        console.log(`✅ Cleaned up ${deletedCount} old backups`);
        return deletedCount;
    }

    async getStorageReport(): Promise<{
        primaryFile: {
            exists: boolean;
            size: number;
            taskCount: number;
            lastModified: Date;
        };
        backups: {
            count: number;
            totalSize: number;
            oldestBackup?: string;
            newestBackup?: string;
        };
        recommendations: string[];
    }> {
        console.log('📊 Generating storage report...');

        const report: {
            primaryFile: {
                exists: boolean;
                size: number;
                taskCount: number;
                lastModified: Date;
            };
            backups: {
                count: number;
                totalSize: number;
                oldestBackup?: string;
                newestBackup?: string;
            };
            recommendations: string[];
        } = {
            primaryFile: {
                exists: false,
                size: 0,
                taskCount: 0,
                lastModified: new Date(0)
            },
            backups: {
                count: 0,
                totalSize: 0
            },
            recommendations: [] as string[]
        };

        // Check primary file
        try {
            const primaryPath = join('/media/drakosfire/Projects/Sizzek/memory_files', 'tasks.json');
            const stats = await fs.stat(primaryPath);
            const tasks = await this.taskStore.loadTasks();

            report.primaryFile = {
                exists: true,
                size: stats.size,
                taskCount: tasks.length,
                lastModified: stats.mtime
            };
        } catch (error) {
            report.recommendations.push('Primary tasks file is missing or corrupted - consider restoration from backup');
        }

        // Check backups
        const backups = await this.taskStore.listBackups();
        const backupDir = join('/media/drakosfire/Projects/Sizzek/memory_files', 'backups');

        let totalSize = 0;
        for (const backup of backups) {
            try {
                const stats = await fs.stat(join(backupDir, backup));
                totalSize += stats.size;
            } catch (error) {
                console.warn(`Could not stat backup ${backup}:`, error);
            }
        }

        report.backups = {
            count: backups.length,
            totalSize,
            ...(backups.length > 0 && {
                oldestBackup: backups[backups.length - 1],
                newestBackup: backups[0]
            })
        };

        // Generate recommendations
        if (report.backups.count === 0) {
            report.recommendations.push('No backups found - create initial backup for data safety');
        } else if (report.backups.count < 5) {
            report.recommendations.push('Consider creating more frequent backups');
        } else if (report.backups.count > 100) {
            report.recommendations.push('Large number of backups - consider cleanup to save disk space');
        }

        if (report.backups.totalSize > 100 * 1024 * 1024) { // 100MB
            report.recommendations.push('Backup directory using significant disk space - consider cleanup');
        }

        const lastModifiedDays = (Date.now() - report.primaryFile.lastModified.getTime()) / (1000 * 60 * 60 * 24);
        if (lastModifiedDays > 7) {
            report.recommendations.push('Primary file has not been modified recently - verify system health');
        }

        return report;
    }

    async exportBackup(filename: string, exportPath: string): Promise<void> {
        console.log(`📤 Exporting backup ${filename} to ${exportPath}...`);

        const backupDir = join('/media/drakosfire/Projects/Sizzek/memory_files', 'backups');
        const sourcePath = join(backupDir, filename);

        await fs.copyFile(sourcePath, exportPath);
        console.log(`✅ Backup exported to ${exportPath}`);
    }

    async importBackup(importPath: string): Promise<string> {
        console.log(`📥 Importing backup from ${importPath}...`);

        // Verify the import file is valid
        const content = await fs.readFile(importPath, 'utf-8');
        const backupData = JSON.parse(content);

        if (!backupData.tasks || !Array.isArray(backupData.tasks)) {
            throw new Error('Invalid backup format - missing tasks array');
        }

        // Generate new filename with import timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tasks-imported-${timestamp}.json`;
        const backupDir = join('/media/drakosfire/Projects/Sizzek/memory_files', 'backups');
        const targetPath = join(backupDir, filename);

        // Add import metadata
        backupData.metadata = backupData.metadata || {};
        backupData.metadata.imported = true;
        backupData.metadata.importedAt = new Date().toISOString();
        backupData.metadata.importedFrom = importPath;

        await fs.writeFile(targetPath, JSON.stringify(backupData, null, 2));

        console.log(`✅ Backup imported as ${filename}`);
        return filename;
    }
} 