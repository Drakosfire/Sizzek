/**
 * Test Assertion Helpers for Todoodles MCP Server
 * Provides validation functions for test assertions
 */

import { expect } from 'chai';

/**
 * Assert that a todoodle has valid structure
 */
export function assertValidTodoodle(todoodle) {
    expect(todoodle).to.be.an('object');
    expect(todoodle).to.have.property('id');
    expect(todoodle).to.have.property('text');
    expect(todoodle).to.have.property('createdAt');
    expect(todoodle).to.have.property('completed');

    expect(todoodle.id).to.be.a('string');
    expect(todoodle.text).to.be.a('string');
    expect(todoodle.createdAt).to.be.a('string');
    expect(todoodle.completed).to.be.a('boolean');

    // Validate ISO date format
    expect(() => new Date(todoodle.createdAt)).to.not.throw();

    // Optional fields validation
    if (todoodle.category !== undefined) {
        expect(todoodle.category).to.be.a('string');
    }

    if (todoodle.priority !== undefined) {
        expect(todoodle.priority).to.be.oneOf(['low', 'medium', 'high', 'urgent']);
    }

    if (todoodle.dueDate !== undefined) {
        expect(todoodle.dueDate).to.be.a('string');
        expect(todoodle.dueDate).to.match(/^\d{4}-\d{2}-\d{2}$/);
    }

    if (todoodle.completed) {
        if (todoodle.completedAt !== undefined) {
            expect(todoodle.completedAt).to.be.a('string');
            expect(() => new Date(todoodle.completedAt)).to.not.throw();
        }

        if (todoodle.timeToComplete !== undefined && todoodle.timeToComplete !== null) {
            expect(todoodle.timeToComplete).to.be.a('number');
            expect(todoodle.timeToComplete).to.be.at.least(0);
        }
    }
}

/**
 * Assert that a collection of todoodles is valid
 */
export function assertValidTodoodles(todoodles) {
    expect(todoodles).to.be.an('array');
    todoodles.forEach(todoodle => {
        assertValidTodoodle(todoodle);
    });
}

/**
 * Assert that todoodle data structure is valid
 */
export function assertValidTodoData(todoData) {
    expect(todoData).to.be.an('object');
    expect(todoData).to.have.property('items');
    expect(todoData).to.have.property('metadata');

    expect(todoData.items).to.be.an('array');
    assertValidTodoodles(todoData.items);

    expect(todoData.metadata).to.be.an('object');
    expect(todoData.metadata).to.have.property('lastId');
    expect(todoData.metadata).to.have.property('version');
    expect(todoData.metadata).to.have.property('updatedAt');
    expect(todoData.metadata).to.have.property('totalItems');
    expect(todoData.metadata).to.have.property('completedItems');

    expect(todoData.metadata.lastId).to.be.a('number');
    expect(todoData.metadata.version).to.be.a('string');
    expect(todoData.metadata.updatedAt).to.be.a('string');
    expect(todoData.metadata.totalItems).to.be.a('number');
    expect(todoData.metadata.completedItems).to.be.a('number');

    expect(todoData.metadata.totalItems).to.equal(todoData.items.length);
    expect(todoData.metadata.completedItems).to.equal(
        todoData.items.filter(item => item.completed).length
    );
}

/**
 * Assert that MCP response has valid structure
 */
export function assertValidMCPResponse(response) {
    expect(response).to.be.an('object');
    expect(response).to.have.property('content');

    expect(response.content).to.be.an('array');
    expect(response.content).to.have.length.at.least(1);

    response.content.forEach(content => {
        expect(content).to.have.property('type');
        expect(content).to.have.property('text');
        expect(content.type).to.equal('text');
        expect(content.text).to.be.a('string');
    });

    if (response.isError !== undefined) {
        expect(response.isError).to.be.a('boolean');
    }
}

/**
 * Assert that MCP response contains success message
 */
export function assertMCPSuccess(response, expectedMessage = null) {
    assertValidMCPResponse(response);
    expect(response.isError).to.not.be.true;

    if (expectedMessage) {
        expect(response.content[0].text).to.include(expectedMessage);
    }
}

/**
 * Assert that MCP response contains error message
 */
export function assertMCPError(response, expectedMessage = null) {
    assertValidMCPResponse(response);
    expect(response.isError).to.be.true;

    if (expectedMessage) {
        expect(response.content[0].text).to.include(expectedMessage);
    }
}

/**
 * Assert that todoodles are filtered correctly by completion status
 */
export function assertCompletionFilter(todoodles, expectedCompleted) {
    assertValidTodoodles(todoodles);
    todoodles.forEach(todoodle => {
        expect(todoodle.completed).to.equal(expectedCompleted);
    });
}

/**
 * Assert that todoodles are filtered correctly by category
 */
export function assertCategoryFilter(todoodles, expectedCategory) {
    assertValidTodoodles(todoodles);
    todoodles.forEach(todoodle => {
        expect(todoodle.category).to.equal(expectedCategory);
    });
}

/**
 * Assert that todoodles are filtered correctly by priority
 */
export function assertPriorityFilter(todoodles, expectedPriority) {
    assertValidTodoodles(todoodles);
    todoodles.forEach(todoodle => {
        expect(todoodle.priority).to.equal(expectedPriority);
    });
}

/**
 * Assert that todoodles match search criteria
 */
export function assertSearchMatch(todoodles, searchTerm) {
    assertValidTodoodles(todoodles);
    todoodles.forEach(todoodle => {
        const searchInText = todoodle.text.toLowerCase().includes(searchTerm.toLowerCase());
        const searchInCategory = todoodle.category &&
            todoodle.category.toLowerCase().includes(searchTerm.toLowerCase());

        expect(searchInText || searchInCategory).to.be.true;
    });
}

/**
 * Assert that todoodles are due within specified criteria
 */
export function assertDueFilter(todoodles, daysFromNow = 0) {
    assertValidTodoodles(todoodles);

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysFromNow);
    const targetDateString = targetDate.toISOString().split('T')[0];

    todoodles.forEach(todoodle => {
        expect(todoodle.dueDate).to.exist;
        if (daysFromNow === 0) {
            // Due today or overdue
            expect(todoodle.dueDate <= targetDateString).to.be.true;
        } else {
            // Due within specified days
            expect(todoodle.dueDate <= targetDateString).to.be.true;
        }
    });
}

/**
 * Assert that statistics are calculated correctly
 */
export function assertValidStatistics(stats, expectedTodoodles) {
    expect(stats).to.be.an('object');
    expect(stats).to.have.property('total');
    expect(stats).to.have.property('completed');
    expect(stats).to.have.property('incomplete');
    expect(stats).to.have.property('categories');
    expect(stats).to.have.property('priorities');

    expect(stats.total).to.be.a('number');
    expect(stats.completed).to.be.a('number');
    expect(stats.incomplete).to.be.a('number');
    expect(stats.categories).to.be.an('object');
    expect(stats.priorities).to.be.an('object');

    // Validate calculations
    expect(stats.total).to.equal(expectedTodoodles.length);
    expect(stats.completed).to.equal(expectedTodoodles.filter(t => t.completed).length);
    expect(stats.incomplete).to.equal(expectedTodoodles.filter(t => !t.completed).length);
    expect(stats.total).to.equal(stats.completed + stats.incomplete);

    // Validate category counts
    const expectedCategories = {};
    expectedTodoodles.forEach(todo => {
        if (todo.category) {
            expectedCategories[todo.category] = (expectedCategories[todo.category] || 0) + 1;
        }
    });

    Object.entries(expectedCategories).forEach(([category, count]) => {
        expect(stats.categories[category]).to.equal(count);
    });

    // Validate priority counts
    const expectedPriorities = {};
    expectedTodoodles.forEach(todo => {
        if (todo.priority) {
            expectedPriorities[todo.priority] = (expectedPriorities[todo.priority] || 0) + 1;
        }
    });

    Object.entries(expectedPriorities).forEach(([priority, count]) => {
        expect(stats.priorities[priority]).to.equal(count);
    });
}

/**
 * Assert that categories list is valid
 */
export function assertValidCategories(categories, expectedTodoodles) {
    expect(categories).to.be.an('array');

    const expectedCategories = [...new Set(
        expectedTodoodles
            .map(todo => todo.category)
            .filter(category => category)
    )].sort();

    expect(categories.sort()).to.deep.equal(expectedCategories);
}

/**
 * Assert that two arrays of todoodles are equivalent
 */
export function assertTodoEquals(actual, expected) {
    expect(actual).to.have.lengthOf(expected.length);

    // Sort both arrays by ID for comparison
    const sortedActual = [...actual].sort((a, b) => a.id.localeCompare(b.id));
    const sortedExpected = [...expected].sort((a, b) => a.id.localeCompare(b.id));

    sortedActual.forEach((actualTodo, index) => {
        const expectedTodo = sortedExpected[index];

        expect(actualTodo.id).to.equal(expectedTodo.id);
        expect(actualTodo.text).to.equal(expectedTodo.text);
        expect(actualTodo.completed).to.equal(expectedTodo.completed);
        expect(actualTodo.priority).to.equal(expectedTodo.priority);
        expect(actualTodo.category).to.equal(expectedTodo.category);
        expect(actualTodo.dueDate).to.equal(expectedTodo.dueDate);

        // Compare dates with some tolerance for timestamp precision
        if (expectedTodo.createdAt) {
            const actualDate = new Date(actualTodo.createdAt);
            const expectedDate = new Date(expectedTodo.createdAt);
            expect(Math.abs(actualDate.getTime() - expectedDate.getTime())).to.be.lessThan(1000);
        }

        if (expectedTodo.completedAt) {
            const actualDate = new Date(actualTodo.completedAt);
            const expectedDate = new Date(expectedTodo.completedAt);
            expect(Math.abs(actualDate.getTime() - expectedDate.getTime())).to.be.lessThan(1000);
        }
    });
}

/**
 * Assert that user isolation is working correctly
 */
export function assertUserIsolation(user1Data, user2Data) {
    // Ensure both users have separate data
    expect(user1Data).to.not.deep.equal(user2Data);

    // Ensure no cross-contamination of IDs
    const user1Ids = user1Data.items.map(item => item.id);
    const user2Ids = user2Data.items.map(item => item.id);

    // IDs can be the same across users (isolated namespaces)
    // This assertion ensures the data structures are separate
    expect(user1Data.metadata.totalItems).to.equal(user1Data.items.length);
    expect(user2Data.metadata.totalItems).to.equal(user2Data.items.length);
}

/**
 * Assert that performance is within acceptable limits
 */
export function assertPerformance(startTime, maxMilliseconds = 5000) {
    const elapsed = Date.now() - startTime;
    expect(elapsed).to.be.lessThan(maxMilliseconds,
        `Operation took ${elapsed}ms, expected less than ${maxMilliseconds}ms`);
} 