#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StorageFactory } from 'mcp-data';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from inherited environment variables
function loadEnv(serverLabel: string) {
  // Check if we have inherited environment variables from parent process
  const envVarsPresent = process.env.LIBRECHAT_API_KEY || process.env.MONGO_URI;
  const usedPath = envVarsPresent ? '(inherited env vars)' : '(default)';

  if (!envVarsPresent) {
    console.error(`[${serverLabel}] Warning: No environment variables found. Check LibreChat configuration.`);
  }

  // Back-compat for URI naming
  if (!process.env.MONGO_URI && process.env.MONGODB_URI) {
    process.env.MONGO_URI = process.env.MONGODB_URI;
  }
  if (!process.env.MONGODB_URI && process.env.MONGO_URI) {
    process.env.MONGODB_URI = process.env.MONGO_URI;
  }

  console.error(`[${serverLabel}] Env loaded: ${usedPath}`);
}

loadEnv('Memory');

// Enhanced logging function
function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}][${level}][Memory MCP] ${message}`;
  console.error(logMessage);

  // Actually log the data if provided
  if (data) {
    console.error(JSON.stringify(data, null, 2));
  }
}

// Legacy interfaces for MCP tool compatibility
interface LegacyEntity {
  name: string;
  entityType: string;
  observations: string[];
}

interface LegacyRelation {
  from: string;
  to: string;
  relationType: string;
}

interface LegacyKnowledgeGraph {
  entities: LegacyEntity[];
  relations: LegacyRelation[];
}

// User-aware Knowledge Graph Manager using shared storage
class UserAwareKnowledgeGraphManager {
  private storage: ReturnType<typeof StorageFactory.createGraphStorageFromEnvironment>;
  private defaultUserId = 'default';

  constructor() {
    // Debug ALL environment variables
    log('DEBUG', 'Environment variables', process.env);

    // Debug specific variables we care about
    log('DEBUG', 'MCP Storage Config', {
      MCP_STORAGE_TYPE: process.env.MCP_STORAGE_TYPE,
      MONGO_URI: process.env.MONGO_URI,
      MONGODB_DATABASE: process.env.MONGODB_DATABASE,
      MONGODB_COLLECTION_PREFIX: process.env.MONGODB_COLLECTION_PREFIX,
      MCP_USER_ID: process.env.MCP_USER_ID,
      MCP_USER_BASED: process.env.MCP_USER_BASED
    });

    this.storage = StorageFactory.createGraphStorageFromEnvironment();

    // Debug what type of storage was actually created
    log('DEBUG', 'Storage instance created', {
      storageType: this.storage.constructor.name,
      storageClass: typeof this.storage
    });

    log('INFO', 'UserAwareKnowledgeGraphManager initialized with storage');
  }

  async createEntities(entities: LegacyEntity[], userId?: string): Promise<LegacyEntity[]> {
    const effectiveUserId = userId || this.defaultUserId;
    log('INFO', `Creating ${entities.length} entities for user: ${effectiveUserId}`);

    try {
      const entitiesWithIds = entities.map(entity => ({
        entityId: `${entity.entityType}-${entity.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: entity.name,
        entityType: entity.entityType,
        observations: entity.observations,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          source: 'mcp-memory-server'
        }
      }));

      await this.storage.saveEntitiesBatch(effectiveUserId, entitiesWithIds);
      log('INFO', `Successfully created ${entitiesWithIds.length} entities for user: ${effectiveUserId}`);
      return entities;
    } catch (error: any) {
      log('ERROR', `Failed to create entities for user: ${effectiveUserId}`, { error: error.message });
      throw error;
    }
  }

  async createRelations(relations: LegacyRelation[], userId?: string): Promise<LegacyRelation[]> {
    const effectiveUserId = userId || this.defaultUserId;
    log('INFO', `Creating ${relations.length} relations for user: ${effectiveUserId}`);

    try {
      for (const relation of relations) {
        // Find the actual entity IDs for the from and to entities
        const fromEntities = await this.storage.searchEntities(effectiveUserId, relation.from);
        const toEntities = await this.storage.searchEntities(effectiveUserId, relation.to);

        // Find exact matches by name
        const fromEntity = fromEntities.find((e: any) => e.name === relation.from);
        const toEntity = toEntities.find((e: any) => e.name === relation.to);

        if (!fromEntity) {
          log('WARN', `From entity not found: ${relation.from}. Skipping relation.`);
          continue;
        }

        if (!toEntity) {
          log('WARN', `To entity not found: ${relation.to}. Skipping relation.`);
          continue;
        }

        const newRelation = {
          relationId: `${fromEntity.entityId}-${relation.relationType}-${toEntity.entityId}`,
          fromEntityId: fromEntity.entityId,
          toEntityId: toEntity.entityId,
          relationType: relation.relationType,
          strength: 1.0,
          metadata: {
            createdAt: new Date(),
            source: 'mcp-memory-server'
          }
        };
        await this.storage.saveRelation(effectiveUserId, newRelation);
        log('DEBUG', `Created relation: ${fromEntity.name} (${fromEntity.entityId}) -> ${toEntity.name} (${toEntity.entityId})`);
      }

      log('INFO', `Successfully created ${relations.length} relations for user: ${effectiveUserId}`);
      return relations;
    } catch (error: any) {
      log('ERROR', `Failed to create relations for user: ${effectiveUserId}`, { error: error.message });
      throw error;
    }
  }

  async addObservations(observations: { entityName: string; contents: string[]; entityType: string }[], userId?: string): Promise<{ entityName: string; addedObservations: string[]; entityCreated: boolean }[]> {
    const effectiveUserId = userId || this.defaultUserId;
    log('INFO', `Adding observations to ${observations.length} entities for user: ${effectiveUserId}`);

    try {
      const results = [];

      for (let i = 0; i < observations.length; i++) {
        const obs = observations[i];
        log('DEBUG', `Processing observation ${i + 1}/${observations.length}: ${obs.entityName} (${obs.entityType})`);

        const entityId = `${obs.entityType}-${obs.entityName.toLowerCase().replace(/\s+/g, '-')}`;
        log('DEBUG', `Generated entityId: ${entityId}`);

        log('DEBUG', `About to call storage.getEntity for user: ${effectiveUserId}, entityId: ${entityId}`);
        let entity;
        try {
          entity = await this.storage.getEntity(effectiveUserId, entityId);
          log('DEBUG', `getEntity completed, result: ${entity ? 'Found existing entity' : 'No existing entity'}`);
        } catch (error: any) {
          log('ERROR', `getEntity failed for entityId: ${entityId}`, { error: error.message, stack: error.stack });
          throw error;
        }

        let entityCreated = false;

        if (!entity) {
          log('DEBUG', `Creating new entity for: ${obs.entityName}`);
          entity = {
            entityId,
            name: obs.entityName,
            entityType: obs.entityType,
            observations: obs.contents,
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              source: 'mcp-memory-server'
            }
          };

          log('DEBUG', `About to call storage.saveEntity for new entity: ${entityId}`);
          try {
            await this.storage.saveEntity(effectiveUserId, entity);
            log('DEBUG', `saveEntity completed successfully for new entity: ${entityId}`);
            entityCreated = true;
          } catch (error: any) {
            log('ERROR', `saveEntity failed for new entity: ${entityId}`, { error: error.message, stack: error.stack });
            throw error;
          }
        } else {
          log('DEBUG', `Updating existing entity: ${entityId}, current observations: ${entity.observations.length}`);
          const newObservations = obs.contents.filter(content => !entity!.observations.includes(content));
          log('DEBUG', `Adding ${newObservations.length} new observations to existing entity`);

          entity.observations.push(...newObservations);
          entity.metadata = {
            ...entity.metadata!,
            updatedAt: new Date(),
            createdAt: entity.metadata?.createdAt || new Date()
          };

          log('DEBUG', `About to call storage.saveEntity for updated entity: ${entityId}`);
          try {
            await this.storage.saveEntity(effectiveUserId, entity);
            log('DEBUG', `saveEntity completed successfully for updated entity: ${entityId}`);
          } catch (error: any) {
            log('ERROR', `saveEntity failed for updated entity: ${entityId}`, { error: error.message, stack: error.stack });
            throw error;
          }
        }

        results.push({
          entityName: obs.entityName,
          addedObservations: obs.contents,
          entityCreated
        });

        log('DEBUG', `Completed processing observation ${i + 1}/${observations.length}`);
      }

      log('INFO', `Successfully added observations for user: ${effectiveUserId}`);
      return results;
    } catch (error: any) {
      log('ERROR', `Failed to add observations for user: ${effectiveUserId}`, { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async deleteEntities(entityNames: string[], userId?: string): Promise<void> {
    const effectiveUserId = userId || this.defaultUserId;
    log('INFO', `Deleting ${entityNames.length} entities for user: ${effectiveUserId}`);

    try {
      for (const entityName of entityNames) {
        const entities = await this.storage.searchEntities(effectiveUserId, entityName);

        for (const entity of entities) {
          if (entity.name === entityName) {
            await this.storage.deleteEntity(effectiveUserId, entity.entityId);
          }
        }
      }

      log('INFO', `Successfully deleted entities for user: ${effectiveUserId}`);
    } catch (error: any) {
      log('ERROR', `Failed to delete entities for user: ${effectiveUserId}`, { error: error.message });
      throw error;
    }
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[], userId?: string): Promise<void> {
    const effectiveUserId = userId || this.defaultUserId;
    log('INFO', `Deleting observations for user: ${effectiveUserId}`);

    try {
      for (const deletion of deletions) {
        const entities = await this.storage.searchEntities(effectiveUserId, deletion.entityName);

        for (const entity of entities) {
          if (entity.name === deletion.entityName) {
            entity.observations = entity.observations.filter((obs: string) => !deletion.observations.includes(obs));
            entity.metadata = {
              ...entity.metadata!,
              updatedAt: new Date(),
              createdAt: entity.metadata?.createdAt || new Date()
            };
            await this.storage.saveEntity(effectiveUserId, entity);
          }
        }
      }

      log('INFO', `Successfully deleted observations for user: ${effectiveUserId}`);
    } catch (error: any) {
      log('ERROR', `Failed to delete observations for user: ${effectiveUserId}`, { error: error.message });
      throw error;
    }
  }

  async deleteRelations(relations: LegacyRelation[], userId?: string): Promise<void> {
    const effectiveUserId = userId || this.defaultUserId;
    log('INFO', `Deleting ${relations.length} relations for user: ${effectiveUserId}`);

    try {
      for (const relation of relations) {
        await this.storage.deleteRelation(effectiveUserId, relation.from, relation.to);
      }

      log('INFO', `Successfully deleted relations for user: ${effectiveUserId}`);
    } catch (error: any) {
      log('ERROR', `Failed to delete relations for user: ${effectiveUserId}`, { error: error.message });
      throw error;
    }
  }

  async readGraph(userId?: string): Promise<LegacyKnowledgeGraph> {
    const effectiveUserId = userId || this.defaultUserId;
    log('DEBUG', `Reading graph for user: ${effectiveUserId}`);

    try {
      const result = await this.storage.loadForUser(effectiveUserId);

      const legacyGraph: LegacyKnowledgeGraph = {
        entities: result.entities.map((entity: any) => ({
          name: entity.name,
          entityType: entity.entityType,
          observations: entity.observations
        })),
        relations: result.relations.map((relation: any) => ({
          from: relation.fromEntityId,
          to: relation.toEntityId,
          relationType: relation.relationType
        }))
      };

      log('INFO', `Successfully read graph for user: ${effectiveUserId}`, {
        entities: legacyGraph.entities.length,
        relations: legacyGraph.relations.length
      });
      return legacyGraph;
    } catch (error: any) {
      log('ERROR', `Failed to read graph for user: ${effectiveUserId}`, { error: error.message });
      throw error;
    }
  }

  async searchNodes(query: string, userId?: string): Promise<LegacyKnowledgeGraph> {
    const effectiveUserId = userId || this.defaultUserId;
    log('DEBUG', `Searching nodes for user: ${effectiveUserId}, query: "${query}"`);

    try {
      const entities = await this.storage.searchEntities(effectiveUserId, query, 50);

      const relations = [];
      for (const entity of entities) {
        const entityRelations = await this.storage.getRelations(effectiveUserId, entity.entityId);
        relations.push(...entityRelations);
      }

      const result: LegacyKnowledgeGraph = {
        entities: entities.map((entity: any) => ({
          name: entity.name,
          entityType: entity.entityType,
          observations: entity.observations
        })),
        relations: relations.map((relation: any) => ({
          from: relation.fromEntityId,
          to: relation.toEntityId,
          relationType: relation.relationType
        }))
      };

      log('INFO', `Successfully searched nodes for user: ${effectiveUserId}`, {
        query,
        foundEntities: result.entities.length,
        foundRelations: result.relations.length
      });
      return result;
    } catch (error: any) {
      log('ERROR', `Failed to search nodes for user: ${effectiveUserId}`, { error: error.message, query });
      throw error;
    }
  }

  async openNodes(names: string[], userId?: string): Promise<LegacyKnowledgeGraph> {
    const effectiveUserId = userId || this.defaultUserId;
    log('DEBUG', `Opening ${names.length} nodes for user: ${effectiveUserId}`);

    try {
      const entities = [];
      const relations = [];

      for (const name of names) {
        const foundEntities = await this.storage.searchEntities(effectiveUserId, name);

        for (const entity of foundEntities) {
          if (entity.name === name) {
            entities.push(entity);

            const entityRelations = await this.storage.getRelations(effectiveUserId, entity.entityId);
            relations.push(...entityRelations);
          }
        }
      }

      const result: LegacyKnowledgeGraph = {
        entities: entities.map(entity => ({
          name: entity.name,
          entityType: entity.entityType,
          observations: entity.observations
        })),
        relations: relations.map(relation => ({
          from: relation.fromEntityId,
          to: relation.toEntityId,
          relationType: relation.relationType
        }))
      };

      log('INFO', `Successfully opened nodes for user: ${effectiveUserId}`, {
        requestedNodes: names.length,
        foundEntities: result.entities.length,
        foundRelations: result.relations.length
      });
      return result;
    } catch (error: any) {
      log('ERROR', `Failed to open nodes for user: ${effectiveUserId}`, { error: error.message });
      throw error;
    }
  }

  async getUserStats(userId?: string): Promise<any> {
    const effectiveUserId = userId || this.defaultUserId;
    log('DEBUG', `Getting user stats for: ${effectiveUserId}`);

    try {
      const summary = await this.storage.getUserSummary(effectiveUserId);
      const stats = {
        userId: effectiveUserId,
        storageType: 'paginated-graph',
        entityCount: summary.totalEntities,
        relationCount: summary.totalRelations,
        totalObservations: Object.values(summary.entityTypes as Record<string, number>).reduce((sum: number, count: number) => sum + count, 0)
      };
      log('INFO', `Retrieved user stats for: ${effectiveUserId}`, stats);
      return stats;
    } catch (error: any) {
      log('ERROR', `Failed to get user stats for: ${effectiveUserId}`, { error: error.message });
      throw error;
    }
  }
}

// Extract user ID from request
function extractUserId(request: any): string | undefined {
  // Try various sources for user identification
  const sources = [
    request.params?.userId,
    request.params?.userContext?.userId,
    request.params?.metadata?.userId,
    request.userId,
    request.userContext?.userId,
    request.metadata?.userId,
    process.env.MCP_USER_ID
  ];

  return sources.find(id => id && typeof id === 'string');
}

log('INFO', 'Initializing Enhanced Memory MCP Server with PaginatedGraphStorage');

const knowledgeGraphManager = new UserAwareKnowledgeGraphManager();

const server = new Server({
  name: "memory-server",
  version: "0.6.3",
}, {
  capabilities: {
    tools: {},
  },
},);

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  return {
    tools: [
      {
        name: "create_entities",
        description: "Create multiple new entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "The name of the entity" },
                  entityType: { type: "string", description: "The type of the entity" },
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "A list of observations about the entity"
                  }
                },
                required: ["name", "entityType", "observations"]
              }
            }
          },
          required: ["entities"]
        }
      },
      {
        name: "create_relations",
        description: "Create multiple relations between entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The entity the relation starts from" },
                  to: { type: "string", description: "The entity the relation goes to" },
                  relationType: { type: "string", description: "The type of the relation" }
                },
                required: ["from", "to", "relationType"]
              }
            }
          },
          required: ["relations"]
        }
      },
      {
        name: "add_observations",
        description: "Add observations to existing entities or create new ones",
        inputSchema: {
          type: "object",
          properties: {
            observations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity" },
                  entityType: { type: "string", description: "The type of the entity" },
                  contents: {
                    type: "array",
                    items: { type: "string" },
                    description: "The observations to add"
                  }
                },
                required: ["entityName", "entityType", "contents"]
              }
            }
          },
          required: ["observations"]
        }
      },
      {
        name: "delete_entities",
        description: "Delete entities from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entityNames: {
              type: "array",
              items: { type: "string" },
              description: "The names of the entities to delete"
            }
          },
          required: ["entityNames"]
        }
      },
      {
        name: "delete_observations",
        description: "Delete specific observations from entities",
        inputSchema: {
          type: "object",
          properties: {
            deletions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity" },
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "The observations to delete"
                  }
                },
                required: ["entityName", "observations"]
              }
            }
          },
          required: ["deletions"]
        }
      },
      {
        name: "delete_relations",
        description: "Delete relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The entity the relation starts from" },
                  to: { type: "string", description: "The entity the relation goes to" },
                  relationType: { type: "string", description: "The type of the relation" }
                },
                required: ["from", "to", "relationType"]
              }
            }
          },
          required: ["relations"]
        }
      },
      {
        name: "read_graph",
        description: "Read the entire knowledge graph",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" }
          },
          required: ["query"]
        }
      },
      {
        name: "open_nodes",
        description: "Open specific nodes and their connections",
        inputSchema: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              description: "The names of the nodes to open"
            }
          },
          required: ["names"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const userId = extractUserId(request);

  try {
    switch (name) {
      case "create_entities":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await knowledgeGraphManager.createEntities(args?.entities as LegacyEntity[], userId))
            }
          ]
        };

      case "create_relations":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await knowledgeGraphManager.createRelations(args?.relations as LegacyRelation[], userId))
            }
          ]
        };

      case "add_observations":
        const result = await knowledgeGraphManager.addObservations(args?.observations as { entityName: string; contents: string[]; entityType: string }[], userId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };

      case "delete_entities":
        await knowledgeGraphManager.deleteEntities(args?.entityNames as string[], userId);
        return {
          content: [
            {
              type: "text",
              text: "Entities deleted successfully"
            }
          ]
        };

      case "delete_observations":
        await knowledgeGraphManager.deleteObservations(args?.deletions as { entityName: string; observations: string[] }[], userId);
        return {
          content: [
            {
              type: "text",
              text: "Observations deleted successfully"
            }
          ]
        };

      case "delete_relations":
        await knowledgeGraphManager.deleteRelations(args?.relations as LegacyRelation[], userId);
        return {
          content: [
            {
              type: "text",
              text: "Relations deleted successfully"
            }
          ]
        };

      case "read_graph":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await knowledgeGraphManager.readGraph(userId))
            }
          ]
        };

      case "search_nodes":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await knowledgeGraphManager.searchNodes(args?.query as string, userId))
            }
          ]
        };

      case "open_nodes":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await knowledgeGraphManager.openNodes(args?.names as string[], userId))
            }
          ]
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    log('ERROR', `Tool ${name} failed`, { error: error.message, args });
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('INFO', 'Memory MCP Server connected and ready');
}

main().catch((error) => {
  log('ERROR', 'Server failed to start', { error: error.message });
  process.exit(1);
}); 