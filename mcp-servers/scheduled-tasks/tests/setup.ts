// Jest setup file for test environment configuration

// Extend Jest timeout for async operations
jest.setTimeout(30000);

// Global test configuration
global.console = {
    ...console,
    // Suppress console.log during tests unless DEBUG is set
    log: process.env.DEBUG ? console.log : jest.fn(),
    warn: console.warn,
    error: console.error,
};

// Mock environment variables if needed
process.env.NODE_ENV = 'test'; 