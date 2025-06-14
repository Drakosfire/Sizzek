# Architecture Overview

## BaseToolHandler

The `BaseToolHandler` class provides a foundation for all tool handlers in this project. It encapsulates common functionality such as:

- **Error Handling:**  A centralized `handleGoogleApiError` method to gracefully handle errors returned by the Google Calendar API, specifically addressing authentication issues.
- **Authentication:** Receives an OAuth2Client instance for authenticated API calls.
- **Abstraction:**  Defines the `runTool` abstract method that all handlers must implement to execute their specific logic.

By extending `BaseToolHandler`, each tool handler benefits from consistent error handling and a standardized structure, promoting code reusability and maintainability.  This approach ensures that all handlers adhere to a common pattern for interacting with the Google Calendar API and managing authentication.

## BatchRequestHandler

The `BatchRequestHandler` class provides efficient multi-calendar support through Google's batch API:

- **Batch Processing:** Combines multiple API requests into a single HTTP request for improved performance
- **Multipart Handling:** Creates and parses multipart/mixed request and response bodies 
- **Error Resilience:** Implements retry logic with exponential backoff for rate limiting and network errors
- **Response Processing:** Handles mixed success/failure responses from batch requests
- **Validation:** Enforces Google's 50-request batch limit and proper request formatting

This approach significantly reduces API calls when querying multiple calendars, improving both performance and reliability.

## RecurringEventHelpers

The `RecurringEventHelpers` class provides specialized functionality for managing recurring calendar events:

- **Event Type Detection:** Identifies whether an event is recurring or single-occurrence
- **Instance ID Formatting:** Generates proper Google Calendar instance IDs for single occurrence modifications
- **Series Splitting:** Implements the complex logic for splitting recurring series with UNTIL clauses
- **Duration Preservation:** Maintains event duration across timezone changes and modifications
- **RRULE Processing:** Handles recurrence rule updates while preserving EXDATE and RDATE patterns

The `UpdateEventHandler` has been enhanced to support three modification scopes:
- **Single Instance:** Modifies one occurrence using instance IDs
- **All Instances:** Updates the master event (default behavior for backward compatibility)  
- **Future Instances:** Splits the series and creates a new recurring event from a specified date forward

This architecture maintains full backward compatibility while providing advanced recurring event management capabilities.

### How ListEventsHandler Uses BaseToolHandler

The `ListEventsHandler` extends the `BaseToolHandler` to inherit its common functionalities and implements multi-calendar support:

```typescript
export class ListEventsHandler extends BaseToolHandler {
    async runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult> {
        const validArgs = ListEventsArgumentsSchema.parse(args);
        
        // Normalize calendarId to always be an array for consistent processing
        const calendarIds = Array.isArray(validArgs.calendarId) 
            ? validArgs.calendarId 
            : [validArgs.calendarId];
        
        const allEvents = await this.fetchEvents(oauth2Client, calendarIds, {
            timeMin: validArgs.timeMin,
            timeMax: validArgs.timeMax
        });
        
        return {
            content: [{
                type: "text",
                text: this.formatEventList(allEvents, calendarIds),
            }],
        };
    }

    // Additional helper methods for single vs batch processing...
}
```

The handler automatically chooses between single API calls and batch processing based on the number of calendars requested, providing optimal performance for both scenarios.

### Registration with handlerMap

Finally, add the tool name (as defined in `ToolDefinitions`) and a new instance of the corresponding handler (e.g., `ListEventsHandler`) to the `handlerMap` in `callTool.ts`. This map enables the tool invocation system to automatically route incoming tool calls to the correct handler implementation.

```typescript
const handlerMap: Record<string, BaseToolHandler> = {
    "list-calendars": new ListCalendarsHandler(),
    "list-events": new ListEventsHandler(),
    "search-events": new SearchEventsHandler(),
    "list-colors": new ListColorsHandler(),
    "create-event": new CreateEventHandler(),
    "update-event": new UpdateEventHandler(),
    "delete-event": new DeleteEventHandler(),
};
```