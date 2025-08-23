#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { StorageFactory } from 'mcp-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
function loadEnv() {
    const candidates = [];
    if (process.env.ENV_PATH) candidates.push(process.env.ENV_PATH);

    // Add shared .env.sizzek file from config directory
    const sharedEnvPath = path.resolve(__dirname, '..', 'config', '.env.sizzek');
    candidates.push(sharedEnvPath);

    const dirCandidates = [path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..')];
    const fileCandidates = ['.env.local', '.env', process.env.NODE_ENV === 'production' ? '.env.production' : undefined].filter(Boolean);
    for (const dir of dirCandidates) {
        for (const file of fileCandidates) {
            candidates.push(path.join(dir, file));
        }
    }

    let used;
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            dotenv.config({ path: p, override: true });
            used = used || p;
        }
    }
    if (!used) dotenv.config();

    // Normalize Mongo env vars for cross-compat
    if (!process.env.MONGO_URI && process.env.MONGODB_URI) {
        process.env.MONGO_URI = process.env.MONGODB_URI;
    }
    if (!process.env.MONGODB_URI && process.env.MONGO_URI) {
        process.env.MONGODB_URI = process.env.MONGO_URI;
    }
}

loadEnv();

console.log('🔧 MCP Servers Data Migration Script');
console.log('=====================================');
console.log(`Environment loaded from: ${process.env.ENV_PATH || 'default'}`);
console.log(`MongoDB URI: ${process.env.MONGODB_URI ? '[SET]' : '[NOT_SET]'}`);
console.log(`MongoDB Database: ${process.env.MONGODB_DATABASE || 'LibreChat'}`);
console.log('');

// Migration configuration
const MIGRATIONS = [
    {
        name: 'twilio-contacts',
        sourceFile: '../memory_files/contacts.json',
        collectionName: 'twilio_contacts',
        transform: (data) => {
            return {
                contacts: Array.from((data.contacts || []).map(contact => [
                    contact.phoneNumber,
                    {
                        phoneNumber: contact.phoneNumber,
                        name: contact.name,
                        agentId: contact.agentId,
                        conversationId: contact.conversationId,
                        lastInteraction: contact.lastInteraction,
                        metadata: contact.metadata || {}
                    }
                ])),
                lastUpdated: data.lastUpdated || new Date().toISOString()
            };
        }
    },

    {
        name: 'memory-entities',
        sourceFile: '../memory_files/memory.json',
        collectionName: 'user_memory_data',
        transform: (data) => {
            // Parse the line-delimited JSON format
            const lines = data.split('\n').filter(line => line.trim());
            const entities = [];
            const relations = [];

            for (const line of lines) {
                try {
                    const item = JSON.parse(line);
                    if (item.type === 'entity') {
                        entities.push(item);
                    } else if (item.type === 'relation') {
                        relations.push(item);
                    }
                } catch (e) {
                    console.log(`   ⚠️  Skipping invalid JSON line: ${line.substring(0, 50)}...`);
                }
            }

            return {
                entities: entities,
                relations: relations,
                metadata: {
                    version: '1.0.0',
                    lastModified: new Date().toISOString(),
                    totalEntities: entities.length,
                    totalRelations: relations.length
                }
            };
        }
    }
];

async function createStorage(collectionName) {
    const storageType = process.env.MCP_STORAGE_TYPE || 'mongodb';

    const config = {
        type: storageType,
        mongodb: storageType === 'mongodb' ? {
            connectionString: process.env.MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mcp_data',
            databaseName: process.env.MONGODB_DATABASE || 'mcp_data',
            collectionName: collectionName,
            connectionTimeout: parseInt(process.env.MCP_MONGODB_TIMEOUT || '10000'),
            maxRetries: parseInt(process.env.MCP_MONGODB_RETRIES || '3'),
            encryptionKey: process.env.CREDS_KEY
        } : undefined,
        json: storageType === 'json' ? {
            baseDir: path.dirname(`./migration-backup-${collectionName}.json`),
            createDirIfNotExists: true,
            backupEnabled: true
        } : undefined
    };

    return StorageFactory.createUserStorage(config, {});
}

async function migrateData(migration) {
    console.log(`📦 Migrating ${migration.name}...`);

    try {
        // Check if source file exists
        const sourcePath = path.resolve(__dirname, migration.sourceFile);
        if (!fs.existsSync(sourcePath)) {
            console.log(`   ⚠️  Source file not found: ${sourcePath}`);
            return { success: false, reason: 'Source file not found' };
        }

        // Read source data
        const fileContent = fs.readFileSync(sourcePath, 'utf-8');
        console.log(`   📖 Read ${fileContent.length} bytes from source file`);

        let sourceData;
        if (migration.name === 'memory-entities') {
            // For memory files, pass the raw content to the transform function
            sourceData = fileContent;
        } else {
            // For other files, parse as JSON
            sourceData = JSON.parse(fileContent);
        }

        // Transform data
        const transformedData = migration.transform(sourceData);
        console.log(`   🔄 Transformed data structure`);

        // Create storage instance
        const storage = await createStorage(migration.collectionName);
        console.log(`   💾 Created storage for collection: ${migration.collectionName}`);

        // Save to MongoDB
        await storage.save(transformedData);
        console.log(`   ✅ Successfully migrated to MongoDB`);

        // Create backup of original file
        const backupPath = `${sourcePath}.migration-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        fs.copyFileSync(sourcePath, backupPath);
        console.log(`   💾 Created backup: ${backupPath}`);

        return { success: true, dataSize: JSON.stringify(transformedData).length };
    } catch (error) {
        console.error(`   ❌ Migration failed: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

async function main() {
    console.log('🚀 Starting data migration...\n');

    const results = [];

    for (const migration of MIGRATIONS) {
        const result = await migrateData(migration);
        results.push({ ...migration, ...result });
        console.log('');
    }

    // Summary
    console.log('📊 Migration Summary');
    console.log('===================');

    let successCount = 0;
    let totalDataSize = 0;

    for (const result of results) {
        const status = result.success ? '✅' : '❌';
        const reason = result.reason ? ` (${result.reason})` : '';
        const dataSize = result.dataSize ? ` - ${result.dataSize} bytes` : '';

        console.log(`${status} ${result.name}${reason}${dataSize}`);

        if (result.success) {
            successCount++;
            totalDataSize += result.dataSize || 0;
        }
    }

    console.log('');
    console.log(`📈 Results: ${successCount}/${results.length} migrations successful`);
    console.log(`💾 Total data migrated: ${totalDataSize} bytes`);

    if (successCount === results.length) {
        console.log('🎉 All migrations completed successfully!');
    } else {
        console.log('⚠️  Some migrations failed. Check the logs above for details.');
    }

    console.log('');
    console.log('🔧 Next steps:');
    console.log('1. Test each MCP server to ensure data is accessible');
    console.log('2. Verify that the migrated data appears correctly in LibreChat');
    console.log('3. Once confirmed working, you can remove the backup files');
    console.log('4. Continue with the remaining MCP server migrations');
}

// Run the migration
main().catch(error => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
});
