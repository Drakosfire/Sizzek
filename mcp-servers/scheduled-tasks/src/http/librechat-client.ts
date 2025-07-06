import { Task } from '../types/index.js';
import { UserLookupService } from './user-lookup.js';

export interface LibreChatConfig {
    endpoint: string;
    apiKey: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    userLookupService?: UserLookupService;
    agentName?: string;
}

export interface TriggerRequest {
    message: string;
    description: string;
    metadata: Record<string, any> | undefined;
}

export class LibreChatClient {
    private config: LibreChatConfig;
    private cachedUser: any = null; // Cache the full user object

    constructor(config: LibreChatConfig) {
        this.config = config;
    }

    async triggerTask(task: Task): Promise<void> {
        // Get the full user object (includes phone number)
        const user = await this.getUser();

        if (!user) {
            throw new Error('Unable to find agent user. Please check agent configuration.');
        }

        if (!user.phoneNumber) {
            throw new Error(`Agent user ${user._id} does not have a phone number. Cannot send scheduled message.`);
        }

        const request: TriggerRequest = {
            message: task.message,
            description: task.description || task.name,
            metadata: {
                source: 'scheduled',
                taskId: task.id,
                taskName: task.name,
                schedule: task.schedule,
                triggeredAt: new Date().toISOString(),
                userId: user._id.toString(),
                agentName: this.config.agentName,
                // Agent-specific metadata for proper routing
                endpoint: 'agents',
                agent_id: process.env.LIBRECHAT_AGENT_ID || 'default',
                model: process.env.LIBRECHAT_AGENT_MODEL || 'gpt-4o'
            }
        };

        await this.sendWithRetry(() => this.sendTriggerRequest(request, user.phoneNumber));
    }

    private async getUser(): Promise<any> {
        // Return cached user if available
        if (this.cachedUser) {
            return this.cachedUser;
        }

        // Try to get user from user lookup service
        if (this.config.userLookupService && this.config.agentName) {
            try {
                const userId = await this.config.userLookupService.lookupUserIdByAgentName(this.config.agentName);
                if (userId) {
                    // Get the full user object (includes phone number)
                    const user = await this.config.userLookupService.lookupUserById(userId);
                    if (user) {
                        this.cachedUser = user;
                        console.log(`✅ Found agent user "${this.config.agentName}":`, {
                            userId: user._id.toString(),
                            hasPhoneNumber: !!user.phoneNumber,
                            phoneNumber: user.phoneNumber ? '[PRESENT]' : '[MISSING]'
                        });
                        return user;
                    }
                }
            } catch (error) {
                console.error(`❌ Error looking up agent user "${this.config.agentName}":`, error);
            }
        }

        // Fallback: warn and return null
        console.warn(`⚠️  No user found for agent "${this.config.agentName}". Tasks will not be delivered.`);
        return null;
    }

    private async sendTriggerRequest(request: TriggerRequest, phoneNumber: string): Promise<void> {
        // Use SMS conversation endpoint - treat like regular SMS message
        const url = `${this.config.endpoint}/api/messages/sms-conversation`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.error(`HTTP request timeout after ${this.config.timeout}ms for task: ${request.metadata?.taskName}`);
            controller.abort();
        }, this.config.timeout);

        try {
            console.log('Sending scheduled task as SMS message:', {
                url,
                taskName: request.metadata?.taskName,
                message: request.message.substring(0, 100) + '...',
                timeout: this.config.timeout,
                phoneNumber: phoneNumber,
                agentName: this.config.agentName
            });

            // Format message with scheduled task context
            const taskName = request.metadata?.taskName || 'Scheduled Task';
            const contentWithContext = `[Scheduled Task: ${taskName}]: ${request.description} \n\n ${request.message}`;

            // Prepare payload as regular SMS message
            // This will flow through normal SMS validation and conversation discovery
            const payload = {
                role: "external",
                content: contentWithContext,
                from: phoneNumber, // Use agent's actual phone number
                metadata: {
                    phoneNumber: phoneNumber, // Also include in metadata
                    // Agent-specific metadata for proper routing
                    endpoint: "agents",
                    agent_id: process.env.LIBRECHAT_AGENT_ID || "default",
                    model: process.env.LIBRECHAT_AGENT_MODEL || "gpt-4o",
                    // Scheduled task metadata
                    source: 'scheduled',
                    taskName: taskName,
                    title: `Scheduled Task: ${taskName}`,
                    taskId: request.metadata?.taskId,
                    schedule: request.metadata?.schedule,
                    triggeredAt: request.metadata?.triggeredAt,
                    agentName: this.config.agentName,
                    // Instructions for the agent
                    additional_instructions: `SCHEDULED TASK CONTEXT: This is a scheduled reminder/message that was set up previously. You should respond appropriately to the task content.`,
                    // Conversation metadata for new conversation creation
                    conversationMetadata: {
                        title: `Scheduled Task: ${taskName}`,
                        endpoint: "agents",
                        agent_id: process.env.LIBRECHAT_AGENT_ID || "default",
                        model: process.env.LIBRECHAT_AGENT_MODEL || "gpt-4o",
                        source: 'scheduled'
                    }
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey,
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'scheduled-tasks-mcp/1.0.0'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            console.log('✅ Successfully sent scheduled task as SMS message');
        } catch (error) {
            console.error('❌ Error sending scheduled task:', error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async sendWithRetry(operation: () => Promise<void>): Promise<void> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                await operation();
                return; // Success
            } catch (error) {
                lastError = error as Error;
                console.warn(`Attempt ${attempt}/${this.config.retryAttempts} failed:`, error);

                if (attempt < this.config.retryAttempts) {
                    const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
                    console.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }
} 