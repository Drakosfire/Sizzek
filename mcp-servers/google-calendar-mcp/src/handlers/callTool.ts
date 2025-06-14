import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from 'google-auth-library';
import { BaseToolHandler } from "./core/BaseToolHandler.js";
import { ListCalendarsHandler } from "./core/ListCalendarsHandler.js";
import { ListEventsHandler } from "./core/ListEventsHandler.js";
import { SearchEventsHandler } from "./core/SearchEventsHandler.js";
import { ListColorsHandler } from "./core/ListColorsHandler.js";
import { CreateEventHandler } from "./core/CreateEventHandler.js";
import { UpdateEventHandler } from "./core/UpdateEventHandler.js";
import { DeleteEventHandler } from "./core/DeleteEventHandler.js";
import { FreeBusyEventHandler } from "./core/FreeBusyEventHandler.js";

/**
 * Handles incoming tool calls, validates arguments, calls the appropriate service,
 * and formats the response.
 *
 * @param request The CallToolRequest containing tool name and arguments.
 * @param oauth2Client The authenticated OAuth2 client instance.
 * @returns A Promise resolving to the CallToolResponse.
 */
export async function handleCallTool(request: typeof CallToolRequestSchema._type, oauth2Client: OAuth2Client) {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    console.log(`[CallTool] Received tool call: ${name}`);
    console.log(`[CallTool] Tool arguments:`, JSON.stringify(args, null, 2));

    try {
        const handler = getHandler(name);
        console.log(`[CallTool] Found handler for tool: ${name}`);

        const result = await handler.runTool(args, oauth2Client);
        const duration = Date.now() - startTime;

        console.log(`[CallTool] Tool '${name}' completed successfully in ${duration}ms`);
        console.log(`[CallTool] Tool result:`, JSON.stringify(result, null, 2));

        return result;
    } catch (error: unknown) {
        const duration = Date.now() - startTime;
        console.error(`[CallTool] Error executing tool '${name}' after ${duration}ms:`, error);
        console.error(`[CallTool] Error type:`, typeof error);
        console.error(`[CallTool] Error constructor:`, error?.constructor?.name);
        if (error instanceof Error) {
            console.error(`[CallTool] Error message:`, error.message);
            console.error(`[CallTool] Error stack:`, error.stack);
        }
        // Re-throw the error to be handled by the main server logic or error handler
        throw error;
    }
}

const handlerMap: Record<string, BaseToolHandler> = {
    "list-calendars": new ListCalendarsHandler(),
    "list-events": new ListEventsHandler(),
    "search-events": new SearchEventsHandler(),
    "list-colors": new ListColorsHandler(),
    "create-event": new CreateEventHandler(),
    "update-event": new UpdateEventHandler(),
    "delete-event": new DeleteEventHandler(),
    "get-freebusy": new FreeBusyEventHandler(),
};

function getHandler(toolName: string): BaseToolHandler {
    const handler = handlerMap[toolName];
    if (!handler) {
        throw new Error(`Unknown tool: ${toolName}`);
    }
    return handler;
}
