import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Extracted reminder properties definition for reusability
const remindersInputProperty = {
  type: "object",
  description: "Reminder settings for the event",
  properties: {
    useDefault: {
      type: "boolean",
      description: "Whether to use the default reminders",
    },
    overrides: {
      type: "array",
      description: "Custom reminders (uses popup notifications by default unless email is specified)",
      items: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["email", "popup"],
            description: "Reminder method (defaults to popup unless email is specified)",
            default: "popup"
          },
          minutes: {
            type: "number",
            description: "Minutes before the event to trigger the reminder",
          }
        },
        required: ["minutes"]
      }
    }
  },
  required: ["useDefault"]
};

export function getToolDefinitions() {
  return {
    tools: [
      {
        name: "list-calendars",
        description: "List all available calendars with their IDs and display names. Use this tool first to get the correct calendar IDs for other operations.",
        inputSchema: {
          type: "object",
          properties: {}, // No arguments needed
          required: [],
        },
      },
      {
        name: "list-events",
        description: "List events from one or more calendars",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              oneOf: [
                {
                  type: "string",
                  description: "Calendar ID (NOT display name) - use list-calendars tool to get valid IDs. Examples: 'primary', 'user@gmail.com', or 'abc123@group.calendar.google.com'"
                },
                {
                  type: "array",
                  description: "Array of calendar IDs (NOT display names) - use list-calendars tool to get valid IDs",
                  items: {
                    type: "string"
                  },
                  minItems: 1,
                  maxItems: 50
                }
              ],
              description: "IMPORTANT: Use the actual calendar ID from list-calendars tool, NOT the display name. Example: use 'u34c3smnb57oac2j4plhe4v5fk@group.calendar.google.com' NOT 'Stef and Al'",
            },
            timeMin: {
              type: "string",
              format: "date-time",
              description: "Lower bound (inclusive) for an event's end time to filter by. For events on a specific date, use 00:00:00 of that date. ISO format with timezone required (e.g., 2024-06-26T00:00:00-06:00 for start of June 26 in MDT, or 2024-01-01T00:00:00Z for UTC). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            timeMax: {
              type: "string",
              format: "date-time",
              description: "Upper bound (exclusive) for an event's start time to filter by. For events on a specific date, use 23:59:59 of that date. ISO format with timezone required (e.g., 2024-06-26T23:59:59-06:00 for end of June 26 in MDT, or 2024-12-31T23:59:59Z for UTC). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
          },
          required: ["calendarId"],
        },
      },
      {
        name: "search-events",
        description: "Search for events in a calendar by text query",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "Calendar ID (NOT display name) - use list-calendars tool to get valid IDs. Examples: 'primary', 'user@gmail.com', or 'abc123@group.calendar.google.com'",
            },
            query: {
              type: "string",
              description: "Free text search query (searches summary, description, location, attendees, etc.)",
            },
            timeMin: {
              type: "string",
              format: "date-time",
              description: "Lower bound (inclusive) for an event's end time to filter search results. For events on a specific date, use 00:00:00 of that date. ISO format with timezone required (e.g., 2024-06-26T00:00:00-06:00 for start of June 26 in MDT, or 2024-01-01T00:00:00Z for UTC). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            timeMax: {
              type: "string",
              format: "date-time",
              description: "Upper bound (exclusive) for an event's start time to filter search results. For events on a specific date, use 23:59:59 of that date. ISO format with timezone required (e.g., 2024-06-26T23:59:59-06:00 for end of June 26 in MDT, or 2024-12-31T23:59:59Z for UTC). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
          },
          required: ["calendarId", "query"],
        },
      },
      {
        name: "list-colors",
        description: "List available color IDs and their meanings for calendar events",
        inputSchema: {
          type: "object",
          properties: {}, // No arguments needed
          required: [],
        },
      },
      {
        name: "create-event",
        description: "Create a new calendar event",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "Calendar ID (NOT display name) - use list-calendars tool to get valid IDs. Examples: 'primary', 'user@gmail.com', or 'abc123@group.calendar.google.com'",
            },
            summary: {
              type: "string",
              description: "Title of the event",
            },
            description: {
              type: "string",
              description: "Description/notes for the event (optional)",
            },
            start: {
              type: "string",
              format: "date-time",
              description: "Start time in ISO format with timezone required (e.g., 2024-08-15T10:00:00Z or 2024-08-15T10:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            end: {
              type: "string",
              format: "date-time",
              description: "End time in ISO format with timezone required (e.g., 2024-08-15T11:00:00Z or 2024-08-15T11:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            timeZone: {
              type: "string",
              description:
                "Timezone of the event start/end times, formatted as an IANA Time Zone Database name (e.g., America/Los_Angeles). Required if start/end times are specified, especially for recurring events.",
            },
            location: {
              type: "string",
              description: "Location of the event (optional)",
            },
            attendees: {
              type: "array",
              description: "List of attendee email addresses (optional)",
              items: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    description: "Email address of the attendee",
                  },
                },
                required: ["email"],
              },
            },
            colorId: {
              type: "string",
              description: "Color ID for the event (optional, use list-colors to see available IDs)",
            },
            reminders: remindersInputProperty,
            recurrence: {
              type: "array",
              description:
                "List of recurrence rules (RRULE, EXRULE, RDATE, EXDATE) in RFC5545 format (optional). Example: [\"RRULE:FREQ=WEEKLY;COUNT=5\"]",
              items: {
                type: "string"
              }
            },
          },
          required: ["calendarId", "summary", "start", "end", "timeZone"],
        },
      },
      {
        name: "update-event",
        description: "Update an existing calendar event with recurring event modification scope support",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "Calendar ID (NOT display name) - use list-calendars tool to get valid IDs. Examples: 'primary', 'user@gmail.com', or 'abc123@group.calendar.google.com'",
            },
            eventId: {
              type: "string",
              description: "ID of the event to update",
            },
            summary: {
              type: "string",
              description: "New title for the event (optional)",
            },
            description: {
              type: "string",
              description: "New description for the event (optional)",
            },
            start: {
              type: "string",
              format: "date-time",
              description: "New start time in ISO format with timezone required (e.g., 2024-08-15T10:00:00Z or 2024-08-15T10:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            end: {
              type: "string",
              format: "date-time",
              description: "New end time in ISO format with timezone required (e.g., 2024-08-15T11:00:00Z or 2024-08-15T11:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            timeZone: {
              type: "string",
              description:
                "Timezone for the start/end times (IANA format, e.g., America/Los_Angeles). Required if modifying start/end, or for recurring events.",
            },
            location: {
              type: "string",
              description: "New location for the event (optional)",
            },
            colorId: {
              type: "string",
              description: "New color ID for the event (optional)",
            },
            attendees: {
              type: "array",
              description: "New list of attendee email addresses (optional, replaces existing attendees)",
              items: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    description: "Email address of the attendee",
                  },
                },
                required: ["email"],
              },
            },
            reminders: {
              ...remindersInputProperty,
              description: "New reminder settings for the event (optional)",
            },
            recurrence: {
              type: "array",
              description:
                "New list of recurrence rules (RFC5545 format, optional, replaces existing rules). Example: [\"RRULE:FREQ=DAILY;COUNT=10\"]",
              items: {
                type: "string"
              }
            },
            modificationScope: {
              type: "string",
              enum: ["single", "all", "future"],
              default: "all",
              description: "Scope of modification for recurring events: 'single' (one instance), 'all' (entire series), 'future' (this and future instances). Defaults to 'all' for backward compatibility."
            },
            originalStartTime: {
              type: "string",
              format: "date-time",
              description: "Required when modificationScope is 'single'. Original start time of the specific instance to modify in ISO format with timezone (e.g., 2024-08-15T10:00:00-07:00)."
            },
            futureStartDate: {
              type: "string",
              format: "date-time",
              description: "Required when modificationScope is 'future'. Start date for future modifications in ISO format with timezone (e.g., 2024-08-20T10:00:00-07:00). Must be a future date."
            }
          },
          required: ["calendarId", "eventId", "timeZone"], // timeZone is technically required for PATCH
          allOf: [
            {
              if: {
                properties: {
                  modificationScope: { const: "single" }
                }
              },
              then: {
                required: ["originalStartTime"]
              }
            },
            {
              if: {
                properties: {
                  modificationScope: { const: "future" }
                }
              },
              then: {
                required: ["futureStartDate"]
              }
            }
          ]
        },
      },
      {
        name: "delete-event",
        description: "Delete a calendar event",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "Calendar ID (NOT display name) - use list-calendars tool to get valid IDs. Examples: 'primary', 'user@gmail.com', or 'abc123@group.calendar.google.com'",
            },
            eventId: {
              type: "string",
              description: "ID of the event to delete",
            },
          },
          required: ["calendarId", "eventId"],
        },
      },
      {
        name: "get-freebusy",
        description: "Retrieve free/busy information for one or more calendars within a time range",
        inputSchema: {
          type: "object",
          properties: {
            timeMin: {
              type: "string",
              description: "Lower bound (inclusive) for the free/busy query interval in RFC3339 format with timezone (e.g., 2024-06-26T00:00:00-06:00 for start of June 26 in MDT, or 2024-01-01T00:00:00Z for UTC)",
            },
            timeMax: {
              type: "string",
              description: "Upper bound (exclusive) for the free/busy query interval in RFC3339 format with timezone (e.g., 2024-06-26T23:59:59-06:00 for end of June 26 in MDT, or 2024-12-31T23:59:59Z for UTC)",
            },
            timeZone: {
              type: "string",
              description: "Optional. Time zone used in the response (default is UTC)",
            },
            groupExpansionMax: {
              type: "integer",
              description: "Optional. Maximum number of calendar identifiers to expand per group (max 100)",
            },
            calendarExpansionMax: {
              type: "integer",
              description: "Optional. Maximum number of calendars to expand (max 50)",
            },
            items: {
              type: "array",
              description: "List of calendar or group identifiers to check for availability",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "The identifier of a calendar or group, it usually is a mail format",
                  },
                },
                required: ["id"],
              },
            },
          },
          required: ["timeMin", "timeMax", "items"],
        },
      }
    ],
  };
}