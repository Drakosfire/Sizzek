/**
 * Test Data Generators for Todoodles MCP Server
 * Provides sample data for testing all scenarios
 */

/**
 * Generate basic test todoodles
 */
export function generateBasicTodoodles() {
    return [
        {
            id: "1",
            text: "Buy groceries",
            createdAt: "2024-01-01T10:00:00.000Z",
            completed: false,
            category: "personal",
            priority: "medium"
        },
        {
            id: "2",
            text: "Finish project report",
            createdAt: "2024-01-01T11:00:00.000Z",
            completed: true,
            completedAt: "2024-01-01T15:00:00.000Z",
            timeToComplete: 14400000, // 4 hours
            category: "work",
            priority: "high"
        },
        {
            id: "3",
            text: "Exercise for 30 minutes",
            createdAt: "2024-01-01T12:00:00.000Z",
            completed: false,
            category: "health",
            priority: "low",
            dueDate: "2024-01-02"
        }
    ];
}

/**
 * Generate todoodles with all priority levels
 */
export function generatePriorityTodoodles() {
    return [
        {
            id: "1",
            text: "Critical system maintenance",
            createdAt: "2024-01-01T09:00:00.000Z",
            completed: false,
            priority: "urgent",
            category: "work"
        },
        {
            id: "2",
            text: "Important client meeting",
            createdAt: "2024-01-01T10:00:00.000Z",
            completed: false,
            priority: "high",
            category: "work"
        },
        {
            id: "3",
            text: "Regular team standup",
            createdAt: "2024-01-01T11:00:00.000Z",
            completed: false,
            priority: "medium",
            category: "work"
        },
        {
            id: "4",
            text: "Read industry news",
            createdAt: "2024-01-01T12:00:00.000Z",
            completed: false,
            priority: "low",
            category: "work"
        }
    ];
}

/**
 * Generate todoodles with different categories
 */
export function generateCategoryTodoodles() {
    return [
        {
            id: "1",
            text: "Team meeting",
            createdAt: "2024-01-01T09:00:00.000Z",
            completed: false,
            category: "work",
            priority: "medium"
        },
        {
            id: "2",
            text: "Buy birthday gift",
            createdAt: "2024-01-01T10:00:00.000Z",
            completed: false,
            category: "personal",
            priority: "medium"
        },
        {
            id: "3",
            text: "Grocery shopping",
            createdAt: "2024-01-01T11:00:00.000Z",
            completed: false,
            category: "shopping",
            priority: "low"
        },
        {
            id: "4",
            text: "Visit doctor",
            createdAt: "2024-01-01T12:00:00.000Z",
            completed: false,
            category: "health",
            priority: "high"
        },
        {
            id: "5",
            text: "Uncategorized task",
            createdAt: "2024-01-01T13:00:00.000Z",
            completed: false,
            priority: "medium"
        }
    ];
}

/**
 * Generate todoodles with various due dates
 */
export function generateDueDateTodoodles() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    return [
        {
            id: "1",
            text: "Overdue task",
            createdAt: "2024-01-01T09:00:00.000Z",
            completed: false,
            priority: "urgent",
            category: "work",
            dueDate: yesterday.toISOString().split('T')[0]
        },
        {
            id: "2",
            text: "Due today",
            createdAt: "2024-01-01T10:00:00.000Z",
            completed: false,
            priority: "high",
            category: "work",
            dueDate: today.toISOString().split('T')[0]
        },
        {
            id: "3",
            text: "Due tomorrow",
            createdAt: "2024-01-01T11:00:00.000Z",
            completed: false,
            priority: "medium",
            category: "personal",
            dueDate: tomorrow.toISOString().split('T')[0]
        },
        {
            id: "4",
            text: "Due next week",
            createdAt: "2024-01-01T12:00:00.000Z",
            completed: false,
            priority: "low",
            category: "personal",
            dueDate: nextWeek.toISOString().split('T')[0]
        },
        {
            id: "5",
            text: "No due date",
            createdAt: "2024-01-01T13:00:00.000Z",
            completed: false,
            priority: "medium",
            category: "work"
        }
    ];
}

/**
 * Generate completed and incomplete todoodles
 */
export function generateCompletionStatusTodoodles() {
    return [
        {
            id: "1",
            text: "Completed task 1",
            createdAt: "2024-01-01T09:00:00.000Z",
            completed: true,
            completedAt: "2024-01-01T10:00:00.000Z",
            timeToComplete: 3600000, // 1 hour
            priority: "medium",
            category: "work"
        },
        {
            id: "2",
            text: "Completed task 2",
            createdAt: "2024-01-01T11:00:00.000Z",
            completed: true,
            completedAt: "2024-01-01T13:00:00.000Z",
            timeToComplete: 7200000, // 2 hours
            priority: "high",
            category: "personal"
        },
        {
            id: "3",
            text: "Incomplete task 1",
            createdAt: "2024-01-01T14:00:00.000Z",
            completed: false,
            priority: "low",
            category: "work"
        },
        {
            id: "4",
            text: "Incomplete task 2",
            createdAt: "2024-01-01T15:00:00.000Z",
            completed: false,
            priority: "urgent",
            category: "health"
        }
    ];
}

/**
 * Generate large dataset for performance testing
 */
export function generateLargeDataset(count = 100) {
    const categories = ["work", "personal", "shopping", "health", "education", "finance"];
    const priorities = ["low", "medium", "high", "urgent"];
    const texts = [
        "Complete project",
        "Schedule meeting",
        "Buy supplies",
        "Review documents",
        "Call client",
        "Update database",
        "Test application",
        "Write report",
        "Send email",
        "Create presentation"
    ];

    const todoodles = [];
    for (let i = 1; i <= count; i++) {
        const createdDate = new Date(2024, 0, 1, 9 + (i % 8), i % 60, 0);
        const isCompleted = Math.random() < 0.3; // 30% completed

        const todoodle = {
            id: i.toString(),
            text: `${texts[i % texts.length]} ${i}`,
            createdAt: createdDate.toISOString(),
            completed: isCompleted,
            priority: priorities[i % priorities.length],
            category: categories[i % categories.length]
        };

        if (isCompleted) {
            const completedDate = new Date(createdDate.getTime() + Math.random() * 86400000); // Within 24 hours
            todoodle.completedAt = completedDate.toISOString();
            todoodle.timeToComplete = completedDate.getTime() - createdDate.getTime();
        }

        // Add due dates to some tasks
        if (Math.random() < 0.4) { // 40% have due dates
            const dueDate = new Date(createdDate);
            dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14)); // Due within 2 weeks
            todoodle.dueDate = dueDate.toISOString().split('T')[0];
        }

        todoodles.push(todoodle);
    }

    return todoodles;
}

/**
 * Generate edge case data for testing
 */
export function generateEdgeCaseData() {
    return [
        {
            id: "1",
            text: "", // Empty text
            createdAt: "2024-01-01T09:00:00.000Z",
            completed: false,
            priority: "medium"
        },
        {
            id: "2",
            text: "A".repeat(1000), // Very long text
            createdAt: "2024-01-01T10:00:00.000Z",
            completed: false,
            priority: "low"
        },
        {
            id: "3",
            text: "Special chars: !@#$%^&*()_+-=[]{}|;':\",./<>?",
            createdAt: "2024-01-01T11:00:00.000Z",
            completed: false,
            priority: "high"
        },
        {
            id: "4",
            text: "Unicode: 🎯📝✅❌⭐️🔥💯🚀",
            createdAt: "2024-01-01T12:00:00.000Z",
            completed: false,
            priority: "urgent"
        },
        {
            id: "5",
            text: "Task with null completion time",
            createdAt: "2024-01-01T13:00:00.000Z",
            completed: true,
            completedAt: "2024-01-01T14:00:00.000Z",
            timeToComplete: null,
            priority: "medium"
        }
    ];
}

/**
 * Generate invalid data for error testing
 */
export function generateInvalidData() {
    return [
        {
            // Missing required fields
            text: "Invalid task 1"
        },
        {
            id: "invalid",
            text: "Invalid task 2",
            completed: "not_boolean", // Invalid type
            priority: "invalid_priority", // Invalid priority
            category: null
        },
        {
            id: "3",
            text: "Invalid task 3",
            createdAt: "invalid_date",
            completed: false,
            priority: "medium",
            dueDate: "invalid_date"
        }
    ];
}

/**
 * Generate TodoodleData structure with metadata
 */
export function generateTodoData(items = null, lastId = null) {
    const todoItems = items || generateBasicTodoodles();
    const maxId = lastId || Math.max(...todoItems.map(item => parseInt(item.id))) || 0;

    return {
        items: todoItems,
        metadata: {
            lastId: maxId,
            version: "2.1.0",
            updatedAt: new Date().toISOString(),
            totalItems: todoItems.length,
            completedItems: todoItems.filter(item => item.completed).length
        }
    };
}

/**
 * Generate test users for multi-user testing
 */
export function generateTestUsers() {
    return [
        {
            userId: "user1",
            displayName: "Alice",
            todos: generateBasicTodoodles()
        },
        {
            userId: "user2",
            displayName: "Bob",
            todos: generatePriorityTodoodles()
        },
        {
            userId: "+1234567890",
            displayName: "SMS User 1",
            todos: generateCategoryTodoodles()
        },
        {
            userId: "+0987654321",
            displayName: "SMS User 2",
            todos: generateDueDateTodoodles()
        },
        {
            userId: "test-user",
            displayName: "Test User",
            todos: generateCompletionStatusTodoodles()
        }
    ];
}

/**
 * Generate MCP request format for testing
 */
export function generateMCPRequest(toolName, arguments_, userId = "test-user") {
    return {
        params: {
            name: toolName,
            arguments: arguments_
        },
        meta: {
            user_id: userId,
            phone_number: userId.startsWith('+') ? userId : undefined
        }
    };
}

/**
 * Generate expected MCP response format
 */
export function generateMCPResponse(content, isError = false) {
    return {
        content: [
            {
                type: "text",
                text: content
            }
        ],
        isError
    };
} 