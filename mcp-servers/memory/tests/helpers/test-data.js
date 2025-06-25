/**
 * Test Data Generators for Memory MCP Server
 * Provides realistic test datasets for comprehensive testing
 */

// Realistic Entity Types and Examples
export const ENTITY_TYPES = {
    PERSON: 'Person',
    PROJECT: 'Project',
    LOCATION: 'Location',
    PREFERENCE: 'Preference',
    EVENT: 'Event',
    SKILL: 'Skill',
    COMPANY: 'Company',
    DOCUMENT: 'Document'
};

export const RELATION_TYPES = {
    WORKS_ON: 'works_on',
    LOCATED_AT: 'located_at',
    PREFERS: 'prefers',
    RELATED_TO: 'related_to',
    PART_OF: 'part_of',
    KNOWS: 'knows',
    SKILLED_IN: 'skilled_in',
    ATTENDED: 'attended'
};

/**
 * Generate a basic user's knowledge graph
 */
export function generateBasicUserGraph(userId = 'test-user-123') {
    return {
        userId,
        entities: [
            {
                name: 'John Doe',
                entityType: ENTITY_TYPES.PERSON,
                observations: [
                    'Software engineer at TechCorp',
                    'Prefers working in the morning',
                    'Lives in San Francisco',
                    'Has 5 years of JavaScript experience'
                ]
            },
            {
                name: 'Website Redesign',
                entityType: ENTITY_TYPES.PROJECT,
                observations: [
                    'Due date is March 15th',
                    'Budget is $50,000',
                    'Requires mobile-first design',
                    'Client wants modern UI'
                ]
            },
            {
                name: 'Coffee Preference',
                entityType: ENTITY_TYPES.PREFERENCE,
                observations: [
                    'Prefers dark roast coffee',
                    'Drinks 3 cups per day',
                    'Likes local coffee shops'
                ]
            }
        ],
        relations: [
            {
                from: 'John Doe',
                to: 'Website Redesign',
                relationType: RELATION_TYPES.WORKS_ON
            },
            {
                from: 'John Doe',
                to: 'Coffee Preference',
                relationType: RELATION_TYPES.PREFERS
            }
        ]
    };
}

/**
 * Generate a complex user graph with many entities and relations
 */
export function generateComplexUserGraph(userId = 'complex-user-456') {
    return {
        userId,
        entities: [
            // People
            {
                name: 'Alice Johnson',
                entityType: ENTITY_TYPES.PERSON,
                observations: [
                    'Product manager at StartupInc',
                    'MBA from Stanford',
                    'Specializes in user experience',
                    'Leads cross-functional teams'
                ]
            },
            {
                name: 'Bob Smith',
                entityType: ENTITY_TYPES.PERSON,
                observations: [
                    'Senior developer',
                    'React and Node.js expert',
                    'Mentors junior developers',
                    'Open source contributor'
                ]
            },
            // Projects
            {
                name: 'Mobile App Launch',
                entityType: ENTITY_TYPES.PROJECT,
                observations: [
                    'Q2 2024 deadline',
                    'iOS and Android platforms',
                    'Social media integration required',
                    'Target 10k downloads in first month'
                ]
            },
            {
                name: 'API Redesign',
                entityType: ENTITY_TYPES.PROJECT,
                observations: [
                    'RESTful to GraphQL migration',
                    'Performance improvement goal: 50%',
                    'Backward compatibility required',
                    'Documentation overhaul needed'
                ]
            },
            // Locations
            {
                name: 'San Francisco Office',
                entityType: ENTITY_TYPES.LOCATION,
                observations: [
                    '123 Tech Street, SF, CA',
                    'Open floor plan',
                    'Capacity for 200 people',
                    'Near public transportation'
                ]
            },
            // Skills
            {
                name: 'Machine Learning',
                entityType: ENTITY_TYPES.SKILL,
                observations: [
                    'Python and TensorFlow',
                    'Data preprocessing',
                    'Model deployment experience',
                    'Computer vision projects'
                ]
            },
            // Events
            {
                name: 'Team Standup',
                entityType: ENTITY_TYPES.EVENT,
                observations: [
                    'Daily at 9:00 AM',
                    '15 minute duration',
                    'Virtual and in-person hybrid',
                    'Sprint progress updates'
                ]
            }
        ],
        relations: [
            // Work relationships
            {
                from: 'Alice Johnson',
                to: 'Mobile App Launch',
                relationType: RELATION_TYPES.WORKS_ON
            },
            {
                from: 'Bob Smith',
                to: 'API Redesign',
                relationType: RELATION_TYPES.WORKS_ON
            },
            // Location relationships
            {
                from: 'Alice Johnson',
                to: 'San Francisco Office',
                relationType: RELATION_TYPES.LOCATED_AT
            },
            {
                from: 'Bob Smith',
                to: 'San Francisco Office',
                relationType: RELATION_TYPES.LOCATED_AT
            },
            // Skill relationships
            {
                from: 'Bob Smith',
                to: 'Machine Learning',
                relationType: RELATION_TYPES.SKILLED_IN
            },
            // Event relationships
            {
                from: 'Alice Johnson',
                to: 'Team Standup',
                relationType: RELATION_TYPES.ATTENDED
            },
            {
                from: 'Bob Smith',
                to: 'Team Standup',
                relationType: RELATION_TYPES.ATTENDED
            },
            // Cross-project relationships
            {
                from: 'Mobile App Launch',
                to: 'API Redesign',
                relationType: RELATION_TYPES.RELATED_TO
            }
        ]
    };
}

/**
 * Generate SMS-style user data (phone number as userId)
 */
export function generateSMSUserGraph(phoneNumber = '+1234567890') {
    return {
        userId: phoneNumber,
        entities: [
            {
                name: 'Pizza Friday',
                entityType: ENTITY_TYPES.PREFERENCE,
                observations: [
                    'User loves pizza on Fridays',
                    'Prefers pepperoni and mushroom',
                    'Orders from Tony\'s Pizza',
                    'Usually orders around 6 PM'
                ]
            },
            {
                name: 'Gym Schedule',
                entityType: ENTITY_TYPES.EVENT,
                observations: [
                    'Workout Monday, Wednesday, Friday',
                    'Morning sessions at 7 AM',
                    'Focus on strength training',
                    'Uses FitLife Gym downtown'
                ]
            },
            {
                name: 'Work Project Alpha',
                entityType: ENTITY_TYPES.PROJECT,
                observations: [
                    'Deadline next Friday',
                    'Client presentation required',
                    'Budget tracking important',
                    'Team collaboration needed'
                ]
            }
        ],
        relations: [
            {
                from: 'Pizza Friday',
                to: 'Gym Schedule',
                relationType: RELATION_TYPES.RELATED_TO
            }
        ]
    };
}

/**
 * Generate large dataset for performance testing
 */
export function generateLargeUserGraph(userId = 'performance-test-user', entityCount = 1000) {
    const entities = [];
    const relations = [];

    // Generate entities
    for (let i = 0; i < entityCount; i++) {
        const entityTypes = Object.values(ENTITY_TYPES);
        const entityType = entityTypes[i % entityTypes.length];

        entities.push({
            name: `${entityType}-${i}`,
            entityType: entityType,
            observations: [
                `This is observation 1 for ${entityType} ${i}`,
                `This is observation 2 for ${entityType} ${i}`,
                `Created for performance testing`,
                `Entity index: ${i}`,
                `Type: ${entityType}`
            ]
        });
    }

    // Generate relations (connect roughly 30% of entities)
    const relationCount = Math.floor(entityCount * 0.3);
    const relationTypes = Object.values(RELATION_TYPES);

    for (let i = 0; i < relationCount; i++) {
        const fromIndex = Math.floor(Math.random() * entityCount);
        const toIndex = Math.floor(Math.random() * entityCount);

        if (fromIndex !== toIndex) {
            relations.push({
                from: `${entities[fromIndex].entityType}-${fromIndex}`,
                to: `${entities[toIndex].entityType}-${toIndex}`,
                relationType: relationTypes[i % relationTypes.length]
            });
        }
    }

    return { userId, entities, relations };
}

/**
 * Generate edge case test data
 */
export function generateEdgeCaseData() {
    return [
        // Empty entity
        {
            name: '',
            entityType: ENTITY_TYPES.PERSON,
            observations: []
        },
        // Very long observations
        {
            name: 'Long Observation Entity',
            entityType: ENTITY_TYPES.DOCUMENT,
            observations: [
                'A'.repeat(10000), // 10k character observation
                'This observation contains unicode: 🚀 🎯 ✨ 💡 🔧',
                'This has special characters: !@#$%^&*()[]{}|;:,.<>?'
            ]
        },
        // Unicode entity name
        {
            name: '用户名称测试 🚀',
            entityType: ENTITY_TYPES.PERSON,
            observations: [
                'Testing unicode support',
                'Mixed languages: English 中文 Español 日本語'
            ]
        },
        // Very long entity name
        {
            name: 'This-is-a-very-long-entity-name-that-might-cause-issues-in-some-systems-and-should-be-tested-thoroughly'.repeat(3),
            entityType: ENTITY_TYPES.DOCUMENT,
            observations: ['Testing long names']
        }
    ];
}

/**
 * Generate invalid test data for error testing
 */
export function generateInvalidData() {
    return [
        // Missing required fields
        { name: 'Incomplete Entity' }, // Missing entityType and observations

        // Wrong data types
        {
            name: 123, // Should be string
            entityType: ENTITY_TYPES.PERSON,
            observations: 'Should be array' // Should be array
        },

        // Null/undefined values
        {
            name: null,
            entityType: undefined,
            observations: [null, undefined, '']
        }
    ];
}

/**
 * Generate test users for multi-user scenarios
 */
export function generateMultiUserTestData() {
    return [
        generateBasicUserGraph('user-1-alice'),
        generateBasicUserGraph('user-2-bob'),
        generateSMSUserGraph('+1111111111'),
        generateSMSUserGraph('+2222222222'),
        generateComplexUserGraph('user-3-charlie')
    ];
}

/**
 * Generate realistic search test queries
 */
export function generateSearchQueries() {
    return [
        // Simple searches
        'John',
        'project',
        'coffee',

        // Multi-word searches
        'software engineer',
        'website redesign',
        'coffee preference',

        // Partial matches
        'tech',
        'design',
        'san francisco',

        // Type-specific searches
        'Person',
        'Project',
        'Preference',

        // Empty/edge cases
        '',
        '   ',
        '!@#$%^&*()',
        'nonexistent entity'
    ];
}

export default {
    ENTITY_TYPES,
    RELATION_TYPES,
    generateBasicUserGraph,
    generateComplexUserGraph,
    generateSMSUserGraph,
    generateLargeUserGraph,
    generateEdgeCaseData,
    generateInvalidData,
    generateMultiUserTestData,
    generateSearchQueries
}; 