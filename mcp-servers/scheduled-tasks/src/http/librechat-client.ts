import { Task } from '../types/index.js';

export interface LibreChatConfig {
    endpoint: string;
    apiKey: string;
    conversationId: string | undefined;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
}

export interface TriggerRequest {
    message: string;
    conversationId: string | undefined;
    metadata: Record<string, any> | undefined;
}

export class LibreChatClient {
    private config: LibreChatConfig;

    constructor(config: LibreChatConfig) {
        this.config = config;
    }

    async triggerTask(task: Task): Promise<void> {
        const request: TriggerRequest = {
            message: task.message,
            conversationId: this.config.conversationId,
            metadata: {
                source: 'scheduled-task',
                taskId: task.id,
                taskName: task.name,
                schedule: task.schedule,
                triggeredAt: new Date().toISOString()
            }
        };

        await this.sendWithRetry(() => this.sendTriggerRequest(request));
    }

    private async sendTriggerRequest(request: TriggerRequest): Promise<void> {
        if (!request.conversationId) {
            throw new Error('conversationId is required for LibreChat integration');
        }

        const url = `${this.config.endpoint}/api/messages/${request.conversationId}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            console.error('Sending scheduled task trigger to LibreChat:', {
                url,
                taskName: request.metadata?.taskName,
                message: request.message.substring(0, 100) + '...'
            });

            // Format message with scheduled task context
            const taskName = request.metadata?.taskName || 'Scheduled Task';
            const contentWithContext = `[Scheduled Task: ${taskName}]: ${request.message}`;

            // Prepare payload that matches the working SMS implementation format
            const payload = {
                role: "external",
                content: contentWithContext,
                from: "scheduled-task",
                metadata: {
                    endpoint: "agents",
                    agent_id: process.env.LIBRECHAT_AGENT_ID || "default",
                    model: process.env.LIBRECHAT_AGENT_MODEL || "gpt-4o",
                    source: 'scheduled-task',
                    title: `Scheduled Task: ${taskName}`,
                    taskId: request.metadata?.taskId,
                    schedule: request.metadata?.schedule,
                    triggeredAt: request.metadata?.triggeredAt,
                    additional_instructions: `SCHEDULED TASK CONTEXT: This is a scheduled reminder/message that was set up previously. You should respond appropriately to the task content.`,
                    conversationMetadata: {
                        title: `Scheduled Task: ${taskName}`,
                        endpoint: "agents",
                        agent_id: process.env.LIBRECHAT_AGENT_ID || "default",
                        model: process.env.LIBRECHAT_AGENT_MODEL || "gpt-4o"
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

            console.error(`✅ Successfully triggered LibreChat for task: ${request.metadata?.taskName}`);
            console.error(`💬 Message sent to conversation: ${request.conversationId}`);

        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async sendWithRetry<T>(operation: () => Promise<T>): Promise<T> {
        let lastError: Error;

        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt === this.config.retryAttempts) {
                    throw lastError;
                }

                if (!this.isRetryableError(lastError)) {
                    throw lastError;
                }

                const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
                console.error(`Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError!;
    }

    private isRetryableError(error: Error): boolean {
        // Network errors are retryable
        if (error.message.includes('fetch failed') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT')) {
            return true;
        }

        // HTTP 5xx errors are retryable
        if (error.message.includes('HTTP 5')) {
            return true;
        }

        // Timeout errors are retryable
        if (error.name === 'AbortError') {
            return true;
        }

        return false;
    }
} 