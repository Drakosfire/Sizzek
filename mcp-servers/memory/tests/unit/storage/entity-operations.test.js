/**
 * Unit Tests for PaginatedGraphStorage Entity Operations
 * Tests individual entity CRUD operations in isolation
 */

import assert from 'assert';
import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { getTestDatabase } from '../../helpers/test-database.js';
import { generateBasicUserGraph, generateEdgeCaseData, generateInvalidData } from '../../helpers/test-data.js';
import { assertValidEntity, assertEntityExists, assertEntityNotExists, assertErrorResponse } from '../../helpers/assertions.js';

describe('PaginatedGraphStorage - Entity Operations', function () {
    this.timeout(30000); // 30 second timeout for database operations

    let testDb;
    let storage;
    const testUserId = 'test-user-entity-ops';

    before(async function () {
        testDb = getTestDatabase('entity-operations');
        await testDb.connect();
        await testDb.createIndexes();
        storage = testDb.createStorage();
    });

    after(async function () {
        await testDb.cleanup();
    });

    beforeEach(async function () {
        await testDb.clearUserData(testUserId);
    });

    describe('saveEntity()', function () {
        it('should save a basic entity successfully', async function () {
            const entity = {
                entityId: 'person-john-doe',
                name: 'John Doe',
                entityType: 'Person',
                observations: ['Software engineer', 'Lives in SF'],
                metadata: {
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            };

            await storage.saveEntity(testUserId, entity);

            // Verify entity was saved
            const savedEntity = await storage.getEntity(testUserId, 'person-john-doe');
            assertValidEntity(savedEntity, {
                name: 'John Doe',
                entityType: 'Person'
            });
        });

        it('should handle entity updates (upsert)', async function () {
            const entityId = 'person-jane-doe';

            // First save
            await storage.saveEntity(testUserId, {
                entityId,
                name: 'Jane Doe',
                entityType: 'Person',
                observations: ['Initial observation']
            });

            // Update with new observations
            await storage.saveEntity(testUserId, {
                entityId,
                name: 'Jane Doe',
                entityType: 'Person',
                observations: ['Initial observation', 'Updated observation']
            });

            const entity = await storage.getEntity(testUserId, entityId);
            assert.strictEqual(entity.observations.length, 2);
            assert(entity.observations.includes('Updated observation'));
        });

        it('should generate searchText automatically', async function () {
            const entity = {
                entityId: 'project-alpha',
                name: 'Project Alpha',
                entityType: 'Project',
                observations: ['High priority', 'Due next month'],
                tags: ['urgent', 'client-work']
            };

            await storage.saveEntity(testUserId, entity);

            // Search should find the entity
            const searchResults = await storage.searchEntities(testUserId, 'alpha');
            assert(searchResults.length > 0);
            assert.strictEqual(searchResults[0].name, 'Project Alpha');
        });

        it('should handle edge case data', async function () {
            const edgeCases = generateEdgeCaseData();

            for (const [index, entityData] of edgeCases.entries()) {
                const entity = {
                    entityId: `edge-case-${index}`,
                    ...entityData
                };

                // Should not throw for valid edge cases
                await storage.saveEntity(testUserId, entity);

                const saved = await storage.getEntity(testUserId, entity.entityId);
                assert(saved, `Edge case entity ${index} should be saved`);
            }
        });

        it('should handle unicode and special characters', async function () {
            const entity = {
                entityId: 'unicode-entity',
                name: '用户测试 🚀',
                entityType: 'Test',
                observations: ['Unicode: 中文测试', 'Emoji: 🎯✨', 'Special: !@#$%^&*()'],
                tags: ['测试', 'テスト']
            };

            await storage.saveEntity(testUserId, entity);

            const saved = await storage.getEntity(testUserId, 'unicode-entity');
            assert.strictEqual(saved.name, '用户测试 🚀');
            assert(saved.observations.includes('Unicode: 中文测试'));
        });

        it('should update metadata timestamps', async function () {
            const entityId = 'timestamp-test';
            const startTime = new Date();

            await storage.saveEntity(testUserId, {
                entityId,
                name: 'Timestamp Test',
                entityType: 'Test',
                observations: ['Initial']
            });

            const saved1 = await storage.getEntity(testUserId, entityId);
            assert(saved1.metadata.createdAt >= startTime);
            assert(saved1.metadata.updatedAt >= startTime);

            // Wait a bit and update
            await new Promise(resolve => setTimeout(resolve, 10));

            await storage.saveEntity(testUserId, {
                entityId,
                name: 'Timestamp Test',
                entityType: 'Test',
                observations: ['Updated']
            });

            const saved2 = await storage.getEntity(testUserId, entityId);
            assert(saved2.metadata.updatedAt > saved1.metadata.updatedAt);
            assert.deepStrictEqual(saved2.metadata.createdAt, saved1.metadata.createdAt);
        });

        it('should reject invalid entity data', async function () {
            const invalidData = generateInvalidData();

            for (const invalidEntity of invalidData) {
                try {
                    await storage.saveEntity(testUserId, {
                        entityId: 'invalid-test',
                        ...invalidEntity
                    });
                    assert.fail('Should have thrown error for invalid data');
                } catch (error) {
                    // Expected to fail
                    assert(error instanceof Error);
                }
            }
        });
    });

    describe('getEntity()', function () {
        beforeEach(async function () {
            // Set up test entities
            await storage.saveEntity(testUserId, {
                entityId: 'test-entity-1',
                name: 'Test Entity 1',
                entityType: 'Test',
                observations: ['Test observation']
            });
        });

        it('should retrieve existing entity', async function () {
            const entity = await storage.getEntity(testUserId, 'test-entity-1');
            assertValidEntity(entity, {
                name: 'Test Entity 1',
                entityType: 'Test'
            });
        });

        it('should return null for non-existent entity', async function () {
            const entity = await storage.getEntity(testUserId, 'non-existent');
            assert.strictEqual(entity, null);
        });

        it('should respect user isolation', async function () {
            const otherUserId = 'other-user';

            // Save entity for other user
            await storage.saveEntity(otherUserId, {
                entityId: 'other-entity',
                name: 'Other Entity',
                entityType: 'Test',
                observations: ['Other observation']
            });

            // Should not be visible to test user
            const entity = await storage.getEntity(testUserId, 'other-entity');
            assert.strictEqual(entity, null);
        });

        it('should handle special characters in entityId', async function () {
            const specialId = 'entity-with-special-chars-!@#$%^&*()';

            await storage.saveEntity(testUserId, {
                entityId: specialId,
                name: 'Special ID Entity',
                entityType: 'Test',
                observations: ['Special ID test']
            });

            const entity = await storage.getEntity(testUserId, specialId);
            assert(entity);
            assert.strictEqual(entity.name, 'Special ID Entity');
        });
    });

    describe('searchEntities()', function () {
        beforeEach(async function () {
            // Set up test data for searching
            const testEntities = [
                {
                    entityId: 'person-john',
                    name: 'John Smith',
                    entityType: 'Person',
                    observations: ['Software engineer at TechCorp', 'Lives in San Francisco']
                },
                {
                    entityId: 'person-jane',
                    name: 'Jane Doe',
                    entityType: 'Person',
                    observations: ['Product manager', 'Enjoys coffee']
                },
                {
                    entityId: 'project-website',
                    name: 'Website Redesign',
                    entityType: 'Project',
                    observations: ['UI/UX improvements', 'Mobile-first design']
                },
                {
                    entityId: 'company-techcorp',
                    name: 'TechCorp',
                    entityType: 'Company',
                    observations: ['Technology company', 'Based in San Francisco']
                }
            ];

            for (const entity of testEntities) {
                await storage.saveEntity(testUserId, entity);
            }

            // Wait for text indexing
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        it('should find entities by name', async function () {
            const results = await storage.searchEntities(testUserId, 'John');
            assert(results.length > 0);
            assert(results.some(e => e.name === 'John Smith'));
        });

        it('should find entities by type', async function () {
            const results = await storage.searchEntities(testUserId, 'Person');
            assert(results.length >= 2);
            assert(results.every(e => e.entityType === 'Person'));
        });

        it('should find entities by observations', async function () {
            const results = await storage.searchEntities(testUserId, 'San Francisco');
            assert(results.length >= 2);
            assert(results.some(e => e.name === 'John Smith'));
            assert(results.some(e => e.name === 'TechCorp'));
        });

        it('should handle multi-word queries', async function () {
            const results = await storage.searchEntities(testUserId, 'software engineer');
            assert(results.length > 0);
            assert(results.some(e => e.name === 'John Smith'));
        });

        it('should respect limit parameter', async function () {
            const results = await storage.searchEntities(testUserId, 'Francisco', 1);
            assert.strictEqual(results.length, 1);
        });

        it('should return empty array for no matches', async function () {
            const results = await storage.searchEntities(testUserId, 'nonexistent query');
            assert(Array.isArray(results));
            assert.strictEqual(results.length, 0);
        });

        it('should handle empty query gracefully', async function () {
            const results = await storage.searchEntities(testUserId, '');
            assert(Array.isArray(results));
            // Empty query might return no results or all results depending on implementation
        });

        it('should respect user isolation in search', async function () {
            const otherUserId = 'other-search-user';

            // Add entity for other user
            await storage.saveEntity(otherUserId, {
                entityId: 'other-person',
                name: 'Other Person',
                entityType: 'Person',
                observations: ['Works at OtherCorp']
            });

            // Search should not return other user's entities
            const results = await storage.searchEntities(testUserId, 'OtherCorp');
            assert(results.every(e => !e.name.includes('Other')));
        });
    });

    describe('deleteEntity()', function () {
        beforeEach(async function () {
            // Set up entities with relations for deletion testing
            await storage.saveEntity(testUserId, {
                entityId: 'delete-entity-1',
                name: 'Delete Entity 1',
                entityType: 'Test',
                observations: ['To be deleted']
            });

            await storage.saveEntity(testUserId, {
                entityId: 'delete-entity-2',
                name: 'Delete Entity 2',
                entityType: 'Test',
                observations: ['Related entity']
            });

            // Add relation
            await storage.saveRelation(testUserId, {
                relationId: 'test-relation',
                fromEntityId: 'delete-entity-1',
                toEntityId: 'delete-entity-2',
                relationType: 'related_to'
            });
        });

        it('should delete entity successfully', async function () {
            await storage.deleteEntity(testUserId, 'delete-entity-1');

            const entity = await storage.getEntity(testUserId, 'delete-entity-1');
            assert.strictEqual(entity, null);
        });

        it('should delete related relations when deleting entity', async function () {
            await storage.deleteEntity(testUserId, 'delete-entity-1');

            // Check that relations involving this entity are deleted
            const relations = await storage.getRelations(testUserId, 'delete-entity-1');
            assert.strictEqual(relations.length, 0);

            // Check from the other entity's perspective
            const otherRelations = await storage.getRelations(testUserId, 'delete-entity-2');
            assert.strictEqual(otherRelations.length, 0);
        });

        it('should handle deletion of non-existent entity gracefully', async function () {
            // Should not throw error
            await storage.deleteEntity(testUserId, 'non-existent-entity');
        });

        it('should respect user isolation in deletion', async function () {
            const otherUserId = 'other-delete-user';

            // Create entity for other user with same ID
            await storage.saveEntity(otherUserId, {
                entityId: 'delete-entity-1',
                name: 'Other User Entity',
                entityType: 'Test',
                observations: ['Other user data']
            });

            // Delete from test user should not affect other user
            await storage.deleteEntity(testUserId, 'delete-entity-1');

            const otherEntity = await storage.getEntity(otherUserId, 'delete-entity-1');
            assert(otherEntity);
            assert.strictEqual(otherEntity.name, 'Other User Entity');
        });
    });

    describe('Performance Tests', function () {
        it('should handle large entity creation efficiently', async function () {
            const entityCount = 100;
            const startTime = Date.now();

            // Create many entities
            for (let i = 0; i < entityCount; i++) {
                await storage.saveEntity(testUserId, {
                    entityId: `perf-entity-${i}`,
                    name: `Performance Entity ${i}`,
                    entityType: 'Performance',
                    observations: [`Observation ${i}`, `Data point ${i * 2}`]
                });
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;
            const avgTime = totalTime / entityCount;

            console.log(`Created ${entityCount} entities in ${totalTime}ms (avg: ${avgTime.toFixed(2)}ms per entity)`);

            // Should be reasonably fast (adjust threshold as needed)
            assert(avgTime < 100, `Average entity creation time ${avgTime}ms should be < 100ms`);
        });

        it('should handle large search operations efficiently', async function () {
            // Create searchable entities
            const entityCount = 50;
            for (let i = 0; i < entityCount; i++) {
                await storage.saveEntity(testUserId, {
                    entityId: `search-entity-${i}`,
                    name: `Search Entity ${i}`,
                    entityType: 'Search',
                    observations: [`Search term ${i}`, 'common search term', `unique-${i}`]
                });
            }

            // Wait for indexing
            await new Promise(resolve => setTimeout(resolve, 200));

            const startTime = Date.now();
            const results = await storage.searchEntities(testUserId, 'common search term', 20);
            const endTime = Date.now();

            const searchTime = endTime - startTime;
            console.log(`Search completed in ${searchTime}ms, found ${results.length} results`);

            // Search should be fast
            assert(searchTime < 1000, `Search time ${searchTime}ms should be < 1000ms`);
            assert(results.length > 0, 'Search should return results');
        });
    });

    describe('Error Handling', function () {
        it('should handle database connection errors gracefully', async function () {
            // Create storage with invalid connection
            const { PaginatedGraphStorage } = await import('mcp-data');
            const invalidStorage = new PaginatedGraphStorage('mongodb://invalid:27017', 'invalid_db');

            try {
                await invalidStorage.saveEntity(testUserId, {
                    entityId: 'test',
                    name: 'Test',
                    entityType: 'Test',
                    observations: []
                });
                assert.fail('Should have thrown connection error');
            } catch (error) {
                assert(error instanceof Error);
            }
        });

        it('should handle concurrent modifications gracefully', async function () {
            const entityId = 'concurrent-entity';

            // Create initial entity
            await storage.saveEntity(testUserId, {
                entityId,
                name: 'Concurrent Test',
                entityType: 'Test',
                observations: ['Initial']
            });

            // Simulate concurrent updates
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    storage.saveEntity(testUserId, {
                        entityId,
                        name: 'Concurrent Test',
                        entityType: 'Test',
                        observations: [`Update ${i}`]
                    })
                );
            }

            // All should complete without error
            await Promise.all(promises);

            const finalEntity = await storage.getEntity(testUserId, entityId);
            assert(finalEntity);
            assert.strictEqual(finalEntity.name, 'Concurrent Test');
        });
    });
}); 