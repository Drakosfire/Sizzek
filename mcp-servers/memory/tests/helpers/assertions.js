/**
 * Custom Assertions for Memory MCP Server Testing
 * Provides specialized validation functions for knowledge graph data
 */

import assert from 'assert';

/**
 * Assert that an entity has the expected structure and properties
 */
export function assertValidEntity(entity, expectedProperties = {}) {
    assert(entity, 'Entity should exist');
    assert(typeof entity === 'object', 'Entity should be an object');

    // Required fields
    assert(typeof entity.name === 'string', 'Entity name should be a string');
    assert(entity.name.length > 0, 'Entity name should not be empty');
    assert(typeof entity.entityType === 'string', 'Entity type should be a string');
    assert(Array.isArray(entity.observations), 'Entity observations should be an array');

    // Check expected properties
    for (const [key, expectedValue] of Object.entries(expectedProperties)) {
        if (key === 'observations') {
            assertContainsObservations(entity.observations, expectedValue);
        } else {
            assert.strictEqual(entity[key], expectedValue, `Entity ${key} should match expected value`);
        }
    }
}

/**
 * Assert that a relation has the expected structure and properties
 */
export function assertValidRelation(relation, expectedProperties = {}) {
    assert(relation, 'Relation should exist');
    assert(typeof relation === 'object', 'Relation should be an object');

    // Required fields
    assert(typeof relation.from === 'string', 'Relation from should be a string');
    assert(relation.from.length > 0, 'Relation from should not be empty');
    assert(typeof relation.to === 'string', 'Relation to should be a string');
    assert(relation.to.length > 0, 'Relation to should not be empty');
    assert(typeof relation.relationType === 'string', 'Relation type should be a string');

    // Check expected properties
    for (const [key, expectedValue] of Object.entries(expectedProperties)) {
        assert.strictEqual(relation[key], expectedValue, `Relation ${key} should match expected value`);
    }
}

/**
 * Assert that a knowledge graph has the expected structure
 */
export function assertValidKnowledgeGraph(graph, expectedCounts = {}) {
    assert(graph, 'Knowledge graph should exist');
    assert(typeof graph === 'object', 'Knowledge graph should be an object');

    // Check structure
    assert(Array.isArray(graph.entities), 'Graph entities should be an array');
    assert(Array.isArray(graph.relations), 'Graph relations should be an array');

    // Validate each entity
    graph.entities.forEach((entity, index) => {
        try {
            assertValidEntity(entity);
        } catch (error) {
            throw new Error(`Entity at index ${index} is invalid: ${error.message}`);
        }
    });

    // Validate each relation
    graph.relations.forEach((relation, index) => {
        try {
            assertValidRelation(relation);
        } catch (error) {
            throw new Error(`Relation at index ${index} is invalid: ${error.message}`);
        }
    });

    // Check expected counts
    if (expectedCounts.entities !== undefined) {
        assert.strictEqual(graph.entities.length, expectedCounts.entities,
            `Expected ${expectedCounts.entities} entities, got ${graph.entities.length}`);
    }

    if (expectedCounts.relations !== undefined) {
        assert.strictEqual(graph.relations.length, expectedCounts.relations,
            `Expected ${expectedCounts.relations} relations, got ${graph.relations.length}`);
    }
}

/**
 * Assert that observations contain expected content
 */
export function assertContainsObservations(observations, expectedObservations) {
    assert(Array.isArray(observations), 'Observations should be an array');
    assert(Array.isArray(expectedObservations), 'Expected observations should be an array');

    for (const expectedObs of expectedObservations) {
        const found = observations.some(obs => obs.includes(expectedObs) || obs === expectedObs);
        assert(found, `Expected observation "${expectedObs}" not found in ${JSON.stringify(observations)}`);
    }
}

/**
 * Assert that entity exists in graph with specific properties
 */
export function assertEntityExists(graph, entityName, expectedProperties = {}) {
    const entity = graph.entities.find(e => e.name === entityName);
    assert(entity, `Entity "${entityName}" should exist in graph`);
    assertValidEntity(entity, expectedProperties);
    return entity;
}

/**
 * Assert that relation exists between two entities
 */
export function assertRelationExists(graph, fromEntity, toEntity, relationType) {
    const relation = graph.relations.find(r =>
        r.from === fromEntity && r.to === toEntity && r.relationType === relationType
    );
    assert(relation, `Relation "${fromEntity}" --[${relationType}]--> "${toEntity}" should exist in graph`);
    return relation;
}

/**
 * Assert that entity does not exist in graph
 */
export function assertEntityNotExists(graph, entityName) {
    const entity = graph.entities.find(e => e.name === entityName);
    assert(!entity, `Entity "${entityName}" should not exist in graph`);
}

/**
 * Assert that relation does not exist
 */
export function assertRelationNotExists(graph, fromEntity, toEntity, relationType) {
    const relation = graph.relations.find(r =>
        r.from === fromEntity && r.to === toEntity && r.relationType === relationType
    );
    assert(!relation, `Relation "${fromEntity}" --[${relationType}]--> "${toEntity}" should not exist in graph`);
}

/**
 * Assert user isolation - no data contamination between users
 */
export function assertUserIsolation(user1Graph, user2Graph) {
    assertValidKnowledgeGraph(user1Graph);
    assertValidKnowledgeGraph(user2Graph);

    // Check entity isolation
    const user1EntityNames = user1Graph.entities.map(e => e.name);
    const user2EntityNames = user2Graph.entities.map(e => e.name);

    const entityOverlap = user1EntityNames.filter(name => user2EntityNames.includes(name));
    assert.strictEqual(entityOverlap.length, 0,
        `Users should not share entities. Found overlap: ${entityOverlap.join(', ')}`);

    // Check relation isolation  
    const user1Relations = user1Graph.relations.map(r => `${r.from}-${r.relationType}-${r.to}`);
    const user2Relations = user2Graph.relations.map(r => `${r.from}-${r.relationType}-${r.to}`);

    const relationOverlap = user1Relations.filter(rel => user2Relations.includes(rel));
    assert.strictEqual(relationOverlap.length, 0,
        `Users should not share relations. Found overlap: ${relationOverlap.join(', ')}`);
}

/**
 * Assert MCP tool response format
 */
export function assertValidMCPResponse(response, expectedType = 'text') {
    assert(response, 'MCP response should exist');
    assert(Array.isArray(response.content), 'MCP response should have content array');
    assert(response.content.length > 0, 'MCP response content should not be empty');

    const content = response.content[0];
    assert.strictEqual(content.type, expectedType, `Content type should be ${expectedType}`);

    if (expectedType === 'text') {
        assert(typeof content.text === 'string', 'Text content should be a string');
    }
}

/**
 * Assert MCP tool response contains valid JSON data
 */
export function assertValidMCPJSONResponse(response) {
    assertValidMCPResponse(response, 'text');

    const content = response.content[0];
    let jsonData;

    try {
        jsonData = JSON.parse(content.text);
    } catch (error) {
        throw new Error(`MCP response should contain valid JSON: ${error.message}`);
    }

    return jsonData;
}

/**
 * Assert search results are relevant to query
 */
export function assertSearchResults(results, query, minRelevance = 1) {
    assertValidKnowledgeGraph(results);

    assert(results.entities.length >= minRelevance,
        `Search should return at least ${minRelevance} relevant entities for query "${query}"`);

    // Check that at least some results are relevant (contain query terms)
    const queryTerms = query.toLowerCase().split(/\s+/);
    const relevantEntities = results.entities.filter(entity => {
        const searchText = [
            entity.name,
            entity.entityType,
            ...entity.observations
        ].join(' ').toLowerCase();

        return queryTerms.some(term => searchText.includes(term));
    });

    assert(relevantEntities.length > 0,
        `At least one entity should be relevant to query "${query}"`);
}

/**
 * Assert that an operation was idempotent
 */
export function assertIdempotent(graph1, graph2) {
    assert.strictEqual(graph1.entities.length, graph2.entities.length,
        'Idempotent operations should not change entity count');
    assert.strictEqual(graph1.relations.length, graph2.relations.length,
        'Idempotent operations should not change relation count');

    // Check entities are the same
    for (const entity1 of graph1.entities) {
        const entity2 = graph2.entities.find(e => e.name === entity1.name);
        assert(entity2, `Entity "${entity1.name}" should exist in both graphs`);
        assert.deepStrictEqual(entity1.observations.sort(), entity2.observations.sort(),
            `Entity "${entity1.name}" observations should be identical`);
    }
}

/**
 * Assert performance within acceptable bounds
 */
export function assertPerformance(operationName, executionTime, maxTimeMs) {
    assert(executionTime <= maxTimeMs,
        `${operationName} took ${executionTime}ms, expected <= ${maxTimeMs}ms`);
}

/**
 * Assert memory usage is reasonable
 */
export function assertMemoryUsage(beforeMem, afterMem, maxIncreaseBytes = 50 * 1024 * 1024) {
    const increase = afterMem.heapUsed - beforeMem.heapUsed;
    assert(increase <= maxIncreaseBytes,
        `Memory usage increased by ${increase} bytes, expected <= ${maxIncreaseBytes} bytes`);
}

/**
 * Assert error response structure
 */
export function assertErrorResponse(response, expectedErrorPattern = null) {
    assert(response, 'Error response should exist');
    assert(response.isError || response.error, 'Response should indicate an error');

    if (expectedErrorPattern) {
        const errorMessage = response.error?.message || response.content?.[0]?.text || '';
        assert(errorMessage.includes(expectedErrorPattern),
            `Error message should contain "${expectedErrorPattern}", got: ${errorMessage}`);
    }
}

/**
 * Custom assertion for graph connectivity
 */
export function assertGraphConnectivity(graph, expectedConnectedComponents = 1) {
    // Build adjacency list
    const adjacencyList = new Map();

    graph.entities.forEach(entity => {
        adjacencyList.set(entity.name, new Set());
    });

    graph.relations.forEach(relation => {
        if (adjacencyList.has(relation.from) && adjacencyList.has(relation.to)) {
            adjacencyList.get(relation.from).add(relation.to);
            adjacencyList.get(relation.to).add(relation.from);
        }
    });

    // Count connected components using DFS
    const visited = new Set();
    let components = 0;

    for (const [entityName] of adjacencyList) {
        if (!visited.has(entityName)) {
            components++;
            // DFS
            const stack = [entityName];
            while (stack.length > 0) {
                const current = stack.pop();
                if (!visited.has(current)) {
                    visited.add(current);
                    for (const neighbor of adjacencyList.get(current) || []) {
                        if (!visited.has(neighbor)) {
                            stack.push(neighbor);
                        }
                    }
                }
            }
        }
    }

    assert.strictEqual(components, expectedConnectedComponents,
        `Expected ${expectedConnectedComponents} connected components, found ${components}`);
}

// Export all assertions
export default {
    assertValidEntity,
    assertValidRelation,
    assertValidKnowledgeGraph,
    assertContainsObservations,
    assertEntityExists,
    assertRelationExists,
    assertEntityNotExists,
    assertRelationNotExists,
    assertUserIsolation,
    assertValidMCPResponse,
    assertValidMCPJSONResponse,
    assertSearchResults,
    assertIdempotent,
    assertPerformance,
    assertMemoryUsage,
    assertErrorResponse,
    assertGraphConnectivity
}; 