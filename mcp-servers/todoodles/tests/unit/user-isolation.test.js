/**
 * User Isolation Unit Tests
 */

import { expect } from 'chai';
import { getTestDatabase } from '../helpers/test-database.js';
import { generateMCPRequest } from '../helpers/test-data.js';
import { assertMCPSuccess } from '../helpers/test-assertions.js';

let UserAwareTodoodlesManager;

describe('User Isolation', function () {
    this.timeout(30000);

    let manager1, manager2, testDb;
    const user1Id = 'user1';
    const user2Id = 'user2';

    before(async function () {
        const module = await import('../../dist/index.js');
        UserAwareTodoodlesManager = module.UserAwareTodoodlesManager;

        testDb = getTestDatabase('user-isolation');
        await testDb.connect();
    });

    beforeEach(async function () {
        await testDb.clearAllData();

        testDb.applyTestEnvironment('json', user1Id);
        manager1 = new UserAwareTodoodlesManager();
        await manager1.initialize();

        testDb.applyTestEnvironment('json', user2Id);
        manager2 = new UserAwareTodoodlesManager();
        await manager2.initialize();
    });

    after(async function () {
        await testDb.cleanup();
    });

    it('should maintain separate todoodles for different users', async function () {
        // Add task for user 1
        await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
            text: 'User 1 task',
            category: 'work'
        }, user1Id));

        // Add task for user 2
        await manager2.handleToolCall(generateMCPRequest('add_todoodle', {
            text: 'User 2 task',
            category: 'personal'
        }, user2Id));

        // Get todoodles for each user
        const user1Response = await manager1.handleToolCall(
            generateMCPRequest('get_todoodles', {}, user1Id)
        );
        const user2Response = await manager2.handleToolCall(
            generateMCPRequest('get_todoodles', {}, user2Id)
        );

        const user1Todos = JSON.parse(user1Response.content[0].text);
        const user2Todos = JSON.parse(user2Response.content[0].text);

        // Verify isolation
        expect(user1Todos).to.have.lengthOf(1);
        expect(user2Todos).to.have.lengthOf(1);
        expect(user1Todos[0].text).to.equal('User 1 task');
        expect(user2Todos[0].text).to.equal('User 2 task');
        expect(user1Todos[0].category).to.equal('work');
        expect(user2Todos[0].category).to.equal('personal');
    });

    it('should support SMS phone number user IDs', async function () {
        const phone1 = '+1234567890';
        const phone2 = '+0987654321';

        // Add tasks with phone number user IDs
        await manager1.handleToolCall(generateMCPRequest('add_todoodle', {
            text: 'SMS task 1',
            priority: 'high'
        }, phone1));

        await manager2.handleToolCall(generateMCPRequest('add_todoodle', {
            text: 'SMS task 2',
            priority: 'low'
        }, phone2));

        const phone1Response = await manager1.handleToolCall(
            generateMCPRequest('get_todoodles', {}, phone1)
        );
        const phone2Response = await manager2.handleToolCall(
            generateMCPRequest('get_todoodles', {}, phone2)
        );

        const phone1Todos = JSON.parse(phone1Response.content[0].text);
        const phone2Todos = JSON.parse(phone2Response.content[0].text);

        expect(phone1Todos).to.have.lengthOf(1);
        expect(phone2Todos).to.have.lengthOf(1);
        expect(phone1Todos[0].priority).to.equal('high');
        expect(phone2Todos[0].priority).to.equal('low');
    });
}); 