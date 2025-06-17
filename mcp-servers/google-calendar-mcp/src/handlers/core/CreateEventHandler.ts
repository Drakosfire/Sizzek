import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { CreateEventArgumentsSchema } from "../../schemas/validators.js";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { calendar_v3, google } from 'googleapis';
import { z } from 'zod';

export class CreateEventHandler extends BaseToolHandler {
    async runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult> {
        console.log('[CreateEventHandler] Starting event creation with args:', JSON.stringify(args, null, 2));

        try {
            const validArgs = CreateEventArgumentsSchema.parse(args);
            console.log('[CreateEventHandler] Arguments validated successfully:', JSON.stringify(validArgs, null, 2));

            const event = await this.createEvent(oauth2Client, validArgs);

            console.log('[CreateEventHandler] Event created successfully:', {
                id: event.id,
                summary: event.summary,
                htmlLink: event.htmlLink,
                status: event.status,
                created: event.created,
                updated: event.updated
            });

            return {
                content: [{
                    type: "text",
                    text: `Event created successfully: ${event.summary} (ID: ${event.id})\nEvent link: ${event.htmlLink}\nStatus: ${event.status}`,
                }],
            };
        } catch (error) {
            console.error('[CreateEventHandler] Error during event creation:', error);
            console.error('[CreateEventHandler] Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
            throw error;
        }
    }

    private async createEvent(
        client: OAuth2Client,
        args: z.infer<typeof CreateEventArgumentsSchema>
    ): Promise<calendar_v3.Schema$Event> {
        try {
            console.log('[CreateEventHandler] Initializing Google Calendar client...');
            const calendar = this.getCalendar(client);

            const requestBody: calendar_v3.Schema$Event = {
                summary: args.summary,
                description: args.description,
                start: { dateTime: args.start, timeZone: args.timeZone },
                end: { dateTime: args.end, timeZone: args.timeZone },
                attendees: args.attendees,
                location: args.location,
                colorId: args.colorId,
                reminders: args.reminders,
                recurrence: args.recurrence,
            };

            console.log('[CreateEventHandler] Preparing to call Google Calendar API with:', {
                calendarId: args.calendarId,
                requestBody: JSON.stringify(requestBody, null, 2)
            });

            console.log('[CreateEventHandler] Making API call to calendar.events.insert...');
            const response = await calendar.events.insert({
                calendarId: args.calendarId,
                requestBody: requestBody,
            });

            console.log('[CreateEventHandler] API call completed. Response status:', response.status);
            console.log('[CreateEventHandler] API response headers:', JSON.stringify(response.headers, null, 2));
            console.log('[CreateEventHandler] API response data:', JSON.stringify(response.data, null, 2));

            if (!response.data) {
                console.error('[CreateEventHandler] No data returned from API response');
                throw new Error('Failed to create event, no data returned');
            }

            return response.data;
        } catch (error) {
            console.error('[CreateEventHandler] Error in createEvent method:', error);
            if (error && typeof error === 'object' && 'response' in error) {
                const apiError = error as any;
                console.error('[CreateEventHandler] API Error details:', {
                    status: apiError.response?.status,
                    statusText: apiError.response?.statusText,
                    data: JSON.stringify(apiError.response?.data, null, 2),
                    headers: JSON.stringify(apiError.response?.headers, null, 2)
                });
            }
            throw this.handleGoogleApiError(error);
        }
    }
}
