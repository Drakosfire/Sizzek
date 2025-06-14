import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { GaxiosError } from 'gaxios';
import { calendar_v3, google } from "googleapis";


export abstract class BaseToolHandler {
    abstract runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult>;

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
