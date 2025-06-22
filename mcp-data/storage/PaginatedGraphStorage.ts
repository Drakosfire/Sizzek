/**
 * Paginated Graph Storage Implementation
 * Stores entities and relations as individual documents for scalability
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { UserStorageInterface, StorageHealthInterface, StorageStats } from './StorageInterface.js';

export interface Entity {
    entityId: string;
    name: string;
    entityType: string;
    observations: string[];
    metadata?: {
        createdAt: Date;
        updatedAt: Date;
        relationCount?: number;
        source?: string;
    };
    tags?: string[];
    searchText?: string; // Computed field for text search
}

export interface Relation {
    relationId: string;
    fromEntityId: string;
    toEntityId: string;
    relationType: string;
    strength?: number;
    metadata?: {
        createdAt: Date;
        source?: string;
        confidence?: number;
    };
}

export interface KnowledgeGraph {
    entities: Entity[];
    relations: Relation[];
}

export interface GraphSummary {
    totalEntities: number;
    totalRelations: number;
    entityTypes: Record<string, number>;
    recentEntities: string[];
    searchIndex: {
        frequent_terms: string[];
        entity_names: string[];
    };
    updatedAt: Date;
}

export class PaginatedGraphStorage implements UserStorageInterface<KnowledgeGraph>, StorageHealthInterface {
    private client: MongoClient;
    private db: Db;
    private entitiesCollection: Collection;
    private relationsCollection: Collection;
    private indexCollection: Collection;
    private isConnected: boolean = false;

    constructor(
        connectionString: string,
        databaseName: string = 'LibreChat',
        collectionPrefix: string = 'mcp_memory'
    ) {
        this.client = new MongoClient(connectionString);
        this.db = this.client.db(databaseName);
        this.entitiesCollection = this.db.collection(`${collectionPrefix}_entities`);
        this.relationsCollection = this.db.collection(`${collectionPrefix}_relations`);
        this.indexCollection = this.db.collection(`${collectionPrefix}_index`);
    }

    async connect(): Promise<void> {
        if (!this.isConnected) {
            console.log('[PaginatedGraphStorage] Attempting to connect to MongoDB...');
            try {
                await this.client.connect();
                console.log('[PaginatedGraphStorage] MongoDB client connected successfully');
                this.isConnected = true;
                console.log('[PaginatedGraphStorage] About to create indexes...');
                await this.createIndexes();
                console.log('[PaginatedGraphStorage] Indexes created successfully');
                console.log('[PaginatedGraphStorage] Connected to MongoDB');
            } catch (error) {
                console.error('[PaginatedGraphStorage] Failed to connect to MongoDB:', error);
                throw error;
            }
        } else {
            console.log('[PaginatedGraphStorage] Already connected to MongoDB');
        }
    }

    private async createIndexes(): Promise<void> {
        try {
            // Entity indexes
            await Promise.all([
                this.entitiesCollection.createIndex({ "userId": 1, "entityId": 1 }, { unique: true }),
                this.entitiesCollection.createIndex({ "userId": 1, "entityType": 1 }),
                this.entitiesCollection.createIndex({ "userId": 1, "searchText": "text" }),
                this.entitiesCollection.createIndex({ "userId": 1, "metadata.updatedAt": -1 })
            ]);

            // Relation indexes  
            await Promise.all([
                this.relationsCollection.createIndex({ "userId": 1, "fromEntityId": 1 }),
                this.relationsCollection.createIndex({ "userId": 1, "toEntityId": 1 }),
                this.relationsCollection.createIndex({ "userId": 1, "relationType": 1 }),
                this.relationsCollection.createIndex({ "fromEntityId": 1, "toEntityId": 1 }, { unique: true })
            ]);

            // Index collection
            await this.indexCollection.createIndex({ "userId": 1 }, { unique: true });

        } catch (error) {
            console.warn('[PaginatedGraphStorage] Failed to create indexes:', error);
        }
    }

    // Individual Entity Operations
    async saveEntity(userId: string, entity: Entity): Promise<void> {
        console.log(`[PaginatedGraphStorage] saveEntity called for userId: ${userId}, entityId: ${entity.entityId}`);

        console.log(`[PaginatedGraphStorage] About to connect to MongoDB...`);
        await this.connect();
        console.log(`[PaginatedGraphStorage] MongoDB connection confirmed`);

        const now = new Date();
        const document = {
            userId,
            entityId: entity.entityId,
            name: entity.name,
            entityType: entity.entityType,
            observations: entity.observations,
            metadata: {
                ...entity.metadata,
                updatedAt: now,
                createdAt: entity.metadata?.createdAt || now
            },
            tags: entity.tags || [],
            searchText: this.generateSearchText(entity)
        };

        console.log(`[PaginatedGraphStorage] About to execute replaceOne operation for entityId: ${entity.entityId}`);
        try {
            const result = await this.entitiesCollection.replaceOne(
                { userId, entityId: entity.entityId },
                document,
                { upsert: true }
            );
            console.log(`[PaginatedGraphStorage] replaceOne completed successfully, matched: ${result.matchedCount}, modified: ${result.modifiedCount}, upserted: ${result.upsertedCount}`);
        } catch (error) {
            console.error(`[PaginatedGraphStorage] replaceOne failed for entityId: ${entity.entityId}`, error);
            throw error;
        }

        console.log(`[PaginatedGraphStorage] About to update summary index asynchronously...`);
        // Update summary index asynchronously (don't block the response)
        this.updateSummaryIndex(userId);
        console.log(`[PaginatedGraphStorage] saveEntity completed for entityId: ${entity.entityId}`);
    }

    async getEntity(userId: string, entityId: string): Promise<Entity | null> {
        console.log(`[PaginatedGraphStorage] getEntity called for userId: ${userId}, entityId: ${entityId}`);

        console.log(`[PaginatedGraphStorage] About to connect to MongoDB...`);
        await this.connect();
        console.log(`[PaginatedGraphStorage] MongoDB connection confirmed`);

        console.log(`[PaginatedGraphStorage] About to execute findOne operation for entityId: ${entityId}`);
        try {
            const document = await this.entitiesCollection.findOne({
                userId,
                entityId
            });
            console.log(`[PaginatedGraphStorage] findOne completed, result: ${document ? 'Document found' : 'No document found'}`);

            const result = document ? this.documentToEntity(document) : null;
            console.log(`[PaginatedGraphStorage] getEntity completed for entityId: ${entityId}`);
            return result;
        } catch (error) {
            console.error(`[PaginatedGraphStorage] findOne failed for entityId: ${entityId}`, error);
            throw error;
        }
    }

    async searchEntities(userId: string, query: string, limit: number = 20): Promise<Entity[]> {
        console.log(`[PaginatedGraphStorage] searchEntities called with userId: ${userId}, query: "${query}", limit: ${limit}`);

        await this.connect();
        console.log(`[PaginatedGraphStorage] MongoDB connection confirmed for search`);

        // Debug: Show collection name being used
        console.log(`[PaginatedGraphStorage] Using collection: ${this.entitiesCollection.collectionName}`);

        // Debug: Show the exact query being executed
        const searchQuery = {
            userId,
            $text: { $search: query }
        };
        console.log(`[PaginatedGraphStorage] Executing query: ${JSON.stringify(searchQuery, null, 2)}`);

        try {
            const documents = await this.entitiesCollection.find(searchQuery)
                .sort({ score: { $meta: "textScore" } })
                .limit(limit)
                .toArray();

            console.log(`[PaginatedGraphStorage] Raw MongoDB results: ${documents.length} documents found`);

            if (documents.length > 0) {
                console.log(`[PaginatedGraphStorage] First result sample:`, {
                    name: documents[0].name,
                    entityType: documents[0].entityType,
                    userId: documents[0].userId,
                    searchText: documents[0].searchText?.substring(0, 100) + '...'
                });
            }

            const entities = documents.map(doc => this.documentToEntity(doc));
            console.log(`[PaginatedGraphStorage] Converted to ${entities.length} entities`);

            return entities;
        } catch (error) {
            console.error(`[PaginatedGraphStorage] searchEntities failed for userId: ${userId}, query: "${query}"`, error);
            throw error;
        }
    }

    async deleteEntity(userId: string, entityId: string): Promise<void> {
        await this.connect();

        // Delete entity
        await this.entitiesCollection.deleteOne({ userId, entityId });

        // Delete related relations
        await this.relationsCollection.deleteMany({
            userId,
            $or: [
                { fromEntityId: entityId },
                { toEntityId: entityId }
            ]
        });

        this.updateSummaryIndex(userId);
    }

    // Individual Relation Operations
    async saveRelation(userId: string, relation: Relation): Promise<void> {
        await this.connect();

        const now = new Date();
        const document = {
            userId,
            relationId: relation.relationId,
            fromEntityId: relation.fromEntityId,
            toEntityId: relation.toEntityId,
            relationType: relation.relationType,
            strength: relation.strength || 1.0,
            metadata: {
                ...relation.metadata,
                createdAt: relation.metadata?.createdAt || now
            }
        };

        await this.relationsCollection.replaceOne(
            { fromEntityId: relation.fromEntityId, toEntityId: relation.toEntityId },
            document,
            { upsert: true }
        );

        this.updateSummaryIndex(userId);
    }

    async getRelations(userId: string, entityId: string): Promise<Relation[]> {
        await this.connect();

        const documents = await this.relationsCollection.find({
            userId,
            $or: [
                { fromEntityId: entityId },
                { toEntityId: entityId }
            ]
        }).toArray();

        return documents.map(doc => this.documentToRelation(doc));
    }

    async deleteRelation(userId: string, fromEntityId: string, toEntityId: string): Promise<void> {
        await this.connect();

        await this.relationsCollection.deleteOne({
            userId,
            fromEntityId,
            toEntityId
        });

        this.updateSummaryIndex(userId);
    }

    // Batch Operations for Performance
    async saveEntitiesBatch(userId: string, entities: Entity[]): Promise<void> {
        await this.connect();

        if (entities.length === 0) return;

        const now = new Date();
        const operations = entities.map(entity => ({
            replaceOne: {
                filter: { userId, entityId: entity.entityId },
                replacement: {
                    userId,
                    entityId: entity.entityId,
                    name: entity.name,
                    entityType: entity.entityType,
                    observations: entity.observations,
                    metadata: {
                        ...entity.metadata,
                        updatedAt: now,
                        createdAt: entity.metadata?.createdAt || now
                    },
                    tags: entity.tags || [],
                    searchText: this.generateSearchText(entity)
                },
                upsert: true
            }
        }));

        await this.entitiesCollection.bulkWrite(operations);
        this.updateSummaryIndex(userId);
    }

    async getEntitiesBatch(userId: string, entityIds: string[]): Promise<Entity[]> {
        await this.connect();

        const documents = await this.entitiesCollection.find({
            userId,
            entityId: { $in: entityIds }
        }).toArray();

        return documents.map(doc => this.documentToEntity(doc));
    }

    // Graph Query Operations
    async getConnectedEntities(userId: string, entityId: string, depth: number = 1): Promise<KnowledgeGraph> {
        await this.connect();

        const visited = new Set<string>();
        const entities: Entity[] = [];
        const relations: Relation[] = [];
        const queue: Array<{ entityId: string, currentDepth: number }> = [{ entityId, currentDepth: 0 }];

        while (queue.length > 0) {
            const { entityId: currentEntityId, currentDepth } = queue.shift()!;

            if (visited.has(currentEntityId) || currentDepth > depth) continue;
            visited.add(currentEntityId);

            // Get the entity
            const entity = await this.getEntity(userId, currentEntityId);
            if (entity) entities.push(entity);

            // Get relations if we haven't reached max depth
            if (currentDepth < depth) {
                const entityRelations = await this.getRelations(userId, currentEntityId);
                relations.push(...entityRelations);

                // Add connected entities to queue
                for (const relation of entityRelations) {
                    const nextEntityId = relation.fromEntityId === currentEntityId
                        ? relation.toEntityId
                        : relation.fromEntityId;

                    if (!visited.has(nextEntityId)) {
                        queue.push({ entityId: nextEntityId, currentDepth: currentDepth + 1 });
                    }
                }
            }
        }

        return { entities, relations };
    }

    async getUserSummary(userId: string): Promise<GraphSummary> {
        await this.connect();

        const summary = await this.indexCollection.findOne({ userId });

        if (summary) {
            return {
                totalEntities: summary.summary.totalEntities,
                totalRelations: summary.summary.totalRelations,
                entityTypes: summary.summary.entityTypes,
                recentEntities: summary.recentEntities,
                searchIndex: summary.searchIndex,
                updatedAt: summary.updatedAt
            };
        }

        // Generate fresh summary if none exists
        return await this.generateSummary(userId);
    }

    // UserStorageInterface Implementation
    async saveForUser(userId: string, graph: KnowledgeGraph): Promise<void> {
        await this.saveEntitiesBatch(userId, graph.entities);

        for (const relation of graph.relations) {
            await this.saveRelation(userId, {
                ...relation,
                relationId: this.generateRelationId(relation)
            });
        }
    }

    async loadForUser(userId: string): Promise<KnowledgeGraph> {
        await this.connect();

        const entities = await this.entitiesCollection.find({ userId }).toArray();
        const relations = await this.relationsCollection.find({ userId }).toArray();

        return {
            entities: entities.map(doc => this.documentToEntity(doc)),
            relations: relations.map(doc => this.documentToRelation(doc))
        };
    }

    async existsForUser(userId: string): Promise<boolean> {
        await this.connect();

        const entityCount = await this.entitiesCollection.countDocuments({ userId });
        return entityCount > 0;
    }

    async clearForUser(userId: string): Promise<void> {
        await this.connect();

        await Promise.all([
            this.entitiesCollection.deleteMany({ userId }),
            this.relationsCollection.deleteMany({ userId }),
            this.indexCollection.deleteMany({ userId })
        ]);
    }

    async listUsers(): Promise<string[]> {
        await this.connect();

        const users = await this.entitiesCollection.distinct('userId');
        return users;
    }

    // Legacy StorageInterface support methods
    async save(data: KnowledgeGraph): Promise<void> {
        await this.saveForUser('default', data);
    }

    async load(): Promise<KnowledgeGraph> {
        return await this.loadForUser('default');
    }

    async exists(): Promise<boolean> {
        return await this.existsForUser('default');
    }

    async clear(): Promise<void> {
        await this.clearForUser('default');
    }

    // StorageHealthInterface Implementation
    async healthCheck(): Promise<boolean> {
        try {
            await this.connect();
            await this.db.admin().ping();
            return true;
        } catch (error) {
            console.error('[PaginatedGraphStorage] Health check failed:', error);
            return false;
        }
    }

    async getStats(): Promise<StorageStats> {
        await this.connect();

        const users = await this.listUsers();

        // Use approximate document count instead of collection stats
        const [entitiesCount, relationsCount, indexCount] = await Promise.all([
            this.entitiesCollection.estimatedDocumentCount(),
            this.relationsCollection.estimatedDocumentCount(),
            this.indexCollection.estimatedDocumentCount()
        ]);

        return {
            totalUsers: users.length,
            totalSize: entitiesCount + relationsCount + indexCount, // Document count as proxy for size
            lastAccessed: new Date(),
            collections: [
                this.entitiesCollection.collectionName,
                this.relationsCollection.collectionName,
                this.indexCollection.collectionName
            ]
        };
    }

    async cleanup(): Promise<void> {
        await this.connect();

        // Remove orphaned relations (relations pointing to non-existent entities)
        const entities = await this.entitiesCollection.distinct('entityId');
        await this.relationsCollection.deleteMany({
            $or: [
                { fromEntityId: { $nin: entities } },
                { toEntityId: { $nin: entities } }
            ]
        });

        // Update summary indexes for all users
        const users = await this.listUsers();
        for (const userId of users) {
            this.updateSummaryIndex(userId);
        }
    }

    // Helper Methods
    private generateSearchText(entity: Entity): string {
        return [
            entity.name,
            entity.entityType,
            ...(entity.observations || []),
            ...(entity.tags || [])
        ].join(' ').toLowerCase();
    }

    private generateRelationId(relation: Relation): string {
        return `${relation.fromEntityId}-${relation.relationType}-${relation.toEntityId}`;
    }

    private documentToEntity(doc: any): Entity {
        return {
            entityId: doc.entityId,
            name: doc.name,
            entityType: doc.entityType,
            observations: doc.observations || [],
            metadata: doc.metadata,
            tags: doc.tags,
            searchText: doc.searchText
        };
    }

    private documentToRelation(doc: any): Relation {
        return {
            relationId: doc.relationId,
            fromEntityId: doc.fromEntityId,
            toEntityId: doc.toEntityId,
            relationType: doc.relationType,
            strength: doc.strength,
            metadata: doc.metadata
        };
    }

    private updateSummaryIndex(userId: string): void {
        // Make summary updates asynchronous to avoid blocking operations
        setImmediate(async () => {
            try {
                const summary = await this.generateSummary(userId);

                await this.indexCollection.replaceOne(
                    { userId },
                    {
                        userId,
                        summary: {
                            totalEntities: summary.totalEntities,
                            totalRelations: summary.totalRelations,
                            entityTypes: summary.entityTypes
                        },
                        recentEntities: summary.recentEntities,
                        searchIndex: summary.searchIndex,
                        updatedAt: new Date()
                    },
                    { upsert: true }
                );
            } catch (error) {
                console.error(`[PaginatedGraphStorage] Failed to update summary for user ${userId}:`, error);
                // Don't throw - summary updates are non-critical
            }
        });
    }

    private async generateSummary(userId: string): Promise<GraphSummary> {
        // Use faster estimated counts for better performance
        const [entityCount, relationCount, entityTypesAndRecent] = await Promise.all([
            this.entitiesCollection.countDocuments({ userId }),
            this.relationsCollection.countDocuments({ userId }),
            // Combined aggregation to reduce query count
            this.entitiesCollection.aggregate([
                { $match: { userId } },
                {
                    $facet: {
                        entityTypes: [
                            { $group: { _id: "$entityType", count: { $sum: 1 } } }
                        ],
                        recentEntities: [
                            { $sort: { "metadata.updatedAt": -1 } },
                            { $limit: 10 },
                            { $project: { entityId: 1 } }
                        ]
                    }
                }
            ]).toArray()
        ]);

        const facetResult = entityTypesAndRecent[0] || { entityTypes: [], recentEntities: [] };

        const entityTypeCounts = facetResult.entityTypes.reduce((acc: Record<string, number>, type: any) => {
            acc[type._id] = type.count;
            return acc;
        }, {});

        return {
            totalEntities: entityCount,
            totalRelations: relationCount,
            entityTypes: entityTypeCounts,
            recentEntities: facetResult.recentEntities.map((e: any) => e.entityId),
            searchIndex: {
                frequent_terms: [], // Could be populated with text analysis
                entity_names: facetResult.recentEntities.map((e: any) => e.entityId)
            },
            updatedAt: new Date()
        };
    }

    async disconnect(): Promise<void> {
        if (this.isConnected) {
            await this.client.close();
            this.isConnected = false;
        }
    }
} 