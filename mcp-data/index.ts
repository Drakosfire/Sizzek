/**
 * Sizzek MCP Data Storage
 * Independent storage abstraction layer for MCP servers
 * 
 * Compatible with LibreChat and other MCP hosts
 * Supports user isolation, encryption, and multiple storage backends
 */

// Core interfaces
export type {
    StorageInterface,
    UserStorageInterface,
    EncryptedStorageInterface,
    StorageStats,
    StorageHealthInterface
} from './storage/StorageInterface.js';

// Storage implementations
export { JsonUserStorage } from './storage/JsonStorage.js';
export type { JsonStorageConfig } from './storage/JsonStorage.js';

export { MongodbUserStorage } from './storage/MongodbStorage.js';
export type { MongoStorageConfig } from './storage/MongodbStorage.js';

export { PaginatedGraphStorage } from './storage/PaginatedGraphStorage.js';
export type { Entity, Relation, KnowledgeGraph, GraphSummary } from './storage/PaginatedGraphStorage.js';

// Factory and utilities
export {
    StorageFactory,
    StorageConfigUtils
} from './storage/StorageFactory.js';
export type { UnifiedStorageConfig } from './storage/StorageFactory.js';

// Version and metadata
export const VERSION = '1.0.0';
export const SUPPORTED_HOSTS = ['LibreChat', 'Generic MCP Host'];
export const SUPPORTED_STORAGE_TYPES = ['json', 'mongodb', 'paginated-graph'] as const; 