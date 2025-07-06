#!/usr/bin/env node

console.log('🧪 Testing Grocery List Backend...\n');

async function test() {
    try {
        const { GroceryListManager } = require('./dist/index.js');
        const manager = new GroceryListManager();
        await manager.initialize();
        console.log('✅ Backend initialized');
        
        // Test add
        const item = await manager.addGroceryItem('Test Item', 2, 'produce', 'test-user');
        console.log('✅ Item added:', item.name);
        
        // Test list
        const items = await manager.getGroceryItems('test-user');
        console.log('✅ Items retrieved:', items.length);
        
        // Test toggle
        await manager.purchaseItem(item.id, 'test-user');
        console.log('✅ Item purchased');
        
        await manager.unpurchaseItem(item.id, 'test-user');
        console.log('✅ Item unpurchased');
        
        // Cleanup
        await manager.deleteGroceryItem(item.id, 'test-user');
        console.log('✅ Item deleted');
        
        console.log('\n🎉 All backend functionality working!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

test();
