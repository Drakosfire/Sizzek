import { TaskStorageManager } from '../storage/TaskStorageManager.js';
import { Task } from '../types/index.js';

export async function migrateTasksToUserContext(storageManager?: TaskStorageManager): Promise<void> {
    console.log('🔄 Starting user context migration...');

    const manager = storageManager || new TaskStorageManager();
    if (!storageManager) {
        await manager.initialize();
    }

    try {
        // Load existing tasks
        const existingTasks = await manager.loadTasks();
        console.log(`📋 Found ${existingTasks.length} existing tasks to migrate`);

        // Migrate each task
        const migratedTasks: Task[] = existingTasks.map((task: any) => {
            // Check if task has all required user context fields
            const hasCreatorUserId = 'creatorUserId' in task && task.creatorUserId;
            const hasSharedWith = 'sharedWith' in task && Array.isArray(task.sharedWith);
            const hasContextType = 'contextType' in task && task.contextType;

            if (hasCreatorUserId && hasSharedWith && hasContextType) {
                console.log(`⏭️  Task already fully migrated: ${task.name} (${task.id})`);
                return task as Task;
            }

            // Partial migration needed - preserve existing fields and add missing ones
            const userId = process.env.MCP_USER_ID || 'unknown';

            const migratedTask: Task = {
                ...task,
                // Preserve existing creatorUserId or use default
                creatorUserId: task.creatorUserId || userId,
                // Ensure sharedWith exists as array
                sharedWith: Array.isArray(task.sharedWith) ? task.sharedWith : [],
                // Set contextType based on sharing
                contextType: (Array.isArray(task.sharedWith) && task.sharedWith.length > 0) ||
                    (task.contextType === 'shared') ? 'shared' : 'user'
            };

            console.log(`✅ Migrated task: ${task.name} (${task.id}) with creatorUserId: ${migratedTask.creatorUserId}`);
            return migratedTask;
        });

        // Save migrated tasks
        await manager.saveTasks(migratedTasks);
        console.log(`🎉 Successfully migrated ${migratedTasks.length} tasks`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

/**
 * Check if migration is needed
 */
export async function isMigrationNeeded(): Promise<boolean> {
    const storageManager = new TaskStorageManager();
    await storageManager.initialize();

    try {
        const existingTasks = await storageManager.loadTasks();

        // Check if any task is missing user context
        return existingTasks.some(task => !('creatorUserId' in task));
    } catch (error) {
        console.error('❌ Error checking migration status:', error);
        return false;
    }
}

/**
 * Run migration safely with backup
 */
export async function runMigrationSafely(): Promise<void> {
    console.log('🔍 Checking if migration is needed...');

    const needed = await isMigrationNeeded();
    if (!needed) {
        console.log('✅ No migration needed - all tasks already have user context');
        return;
    }

    console.log('📦 Creating backup before migration...');

    const storageManager = new TaskStorageManager();
    await storageManager.initialize();

    // Create backup
    const backupFilename = await storageManager.createBackup();
    console.log(`💾 Backup created: ${backupFilename}`);

    // Run migration
    await migrateTasksToUserContext();

    console.log('✅ Migration completed successfully');
}

// Run migration if called directly
const isMainModule = process.argv[1] && process.argv[1].includes('add-user-context');
if (isMainModule) {
    runMigrationSafely()
        .then(() => {
            console.log('✅ Migration completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        });
} 