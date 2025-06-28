import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { DeleteEventArgumentsSchema } from "../../schemas/validators.js";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { z } from 'zod';

export class DeleteEventHandler extends BaseToolHandler {
    async runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult> {
        const validArgs = DeleteEventArgumentsSchema.parse(args);

        // Resolve calendar display name to actual calendar ID
        const resolvedCalendarId = await this.resolveCalendarId(oauth2Client, validArgs.calendarId);
        const argsWithResolvedCalendar = { ...validArgs, calendarId: resolvedCalendarId };

        await this.deleteEvent(oauth2Client, argsWithResolvedCalendar);
        return {
            content: [{
                type: "text",
                text: "Event deleted successfully",
            }],
        };
    }

    private async deleteEvent(
        client: OAuth2Client,
        args: z.infer<typeof DeleteEventArgumentsSchema>
    ): Promise<void> {
        try {
            const calendar = this.getCalendar(client);
            await calendar.events.delete({
                calendarId: args.calendarId,
                eventId: args.eventId,
            });
        } catch (error) {
            throw this.handleGoogleApiError(error);
        }
    }
}
