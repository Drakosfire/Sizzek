import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { GaxiosError } from 'gaxios';
import { calendar_v3, google } from "googleapis";


export abstract class BaseToolHandler {
    private static calendarListCache: calendar_v3.Schema$CalendarListEntry[] | null = null;
    private static cacheExpiry: number = 0;
    private static readonly CACHE_DURATION = 300000; // 5 minutes

    abstract runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult>;

    /**
     * Resolves a calendar display name to actual calendar ID
     * Returns the original string if it's already a valid calendar ID
     */
    protected async resolveCalendarId(client: OAuth2Client, calendarIdOrName: string): Promise<string> {
        const calendars = await this.getCalendarList(client);

        // First, check if it's already a valid calendar ID
        const directMatch = calendars.find(cal => cal.id === calendarIdOrName);
        if (directMatch) {
            return calendarIdOrName;
        }

        // If not found, try to match by display name (summary)
        const nameMatch = calendars.find(cal =>
            cal.summary?.toLowerCase().trim() === calendarIdOrName.toLowerCase().trim()
        );

        if (nameMatch && nameMatch.id) {
            console.log(`[BaseToolHandler] Resolved calendar name "${calendarIdOrName}" to ID "${nameMatch.id}"`);
            return nameMatch.id;
        }

        // If no match found, keep original (will likely fail with helpful error)
        console.warn(`[BaseToolHandler] Could not resolve calendar identifier "${calendarIdOrName}"`);
        return calendarIdOrName;
    }

    /**
     * Resolves multiple calendar display names to actual calendar IDs
     */
    protected async resolveCalendarIds(client: OAuth2Client, calendarIds: string[]): Promise<string[]> {
        const resolved: string[] = [];
        for (const id of calendarIds) {
            resolved.push(await this.resolveCalendarId(client, id));
        }
        return resolved;
    }

    /**
     * Gets calendar list with caching (shared across all handlers)
     */
    private async getCalendarList(client: OAuth2Client): Promise<calendar_v3.Schema$CalendarListEntry[]> {
        const now = Date.now();

        if (BaseToolHandler.calendarListCache && now < BaseToolHandler.cacheExpiry) {
            return BaseToolHandler.calendarListCache;
        }

        try {
            const calendar = this.getCalendar(client);
            const response = await calendar.calendarList.list();
            BaseToolHandler.calendarListCache = response.data.items || [];
            BaseToolHandler.cacheExpiry = now + BaseToolHandler.CACHE_DURATION;
            return BaseToolHandler.calendarListCache;
        } catch (error) {
            throw this.handleGoogleApiError(error);
        }
    }

    protected handleGoogleApiError(error: unknown): void {
        console.error('[BaseToolHandler] Handling Google API error:', error);

        if (error instanceof GaxiosError) {
            console.error('[BaseToolHandler] GaxiosError details:', {
                status: error.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                headers: error.response?.headers,
                config: {
                    url: error.config?.url,
                    method: error.config?.method,
                    params: error.config?.params
                }
            });

            if (error.response?.data?.error === 'invalid_grant') {
                console.error('[BaseToolHandler] Authentication token is invalid or expired');
                throw new Error(
                    'Google API Error: Authentication token is invalid or expired. Please re-run the authentication process (e.g., `npm run auth`).'
                );
            }

            // Handle other common Google API errors
            if (error.response?.data?.error) {
                const apiError = error.response.data.error;
                console.error('[BaseToolHandler] Google API error details:', apiError);

                if (apiError.code) {
                    throw new Error(`Google API Error (${apiError.code}): ${apiError.message || 'Unknown error'}`);
                }
            }
        }

        console.error('[BaseToolHandler] Re-throwing original error');
        throw error;
    }

    protected getCalendar(auth: OAuth2Client): calendar_v3.Calendar {
        console.log('[BaseToolHandler] Creating Google Calendar client');

        // Log some basic auth info (without sensitive data)
        console.log('[BaseToolHandler] OAuth2Client credentials present:', {
            hasAccessToken: !!auth.credentials.access_token,
            hasRefreshToken: !!auth.credentials.refresh_token,
            tokenExpiry: auth.credentials.expiry_date ? new Date(auth.credentials.expiry_date).toISOString() : 'none',
            scopes: auth.credentials.scope
        });

        return google.calendar({ version: 'v3', auth });
    }
}
