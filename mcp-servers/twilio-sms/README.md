# Twilio SMS MCP Server

A Model Context Protocol (MCP) server for sending SMS messages using Twilio. This server integrates with LibreChat to enable SMS messaging capabilities.

## Features

- Send SMS messages to any phone number
- E.164 phone number format validation
- Detailed error handling and logging
- Integration with LibreChat

## Prerequisites

- Node.js (v16 or higher)
- A Twilio account with:
  - Account SID
  - Auth Token
  - A Twilio phone number for sending messages

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd twilio-sms
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

### Environment Variables

The server requires the following environment variables to be set in your LibreChat `.env` file:

```env
# Twilio Credentials
TWILIO_ACCOUNT_SID=your_account_sid_here      # Starts with 'AC'
TWILIO_AUTH_TOKEN=your_auth_token_here        # Your Twilio auth token
TWILIO_PHONE_NUMBER=your_phone_number_here    # Your Twilio phone number (e.g., +1234567890)
```

You can find these credentials in your Twilio Console:
1. Go to https://console.twilio.com/
2. Click on "Account" in the left sidebar
3. Look for "Account SID" and "Auth Token" in the "Account Info" section
4. For the phone number, go to "Phone Numbers" → "Active numbers" in the left sidebar

### Important Notes

1. **Environment Variables Location**: 
   - The environment variables must be set in LibreChat's `.env` file, not in the MCP server's directory
   - This is because LibreChat manages the environment for all MCP servers

2. **Phone Number Format**:
   - All phone numbers must be in E.164 format (e.g., +1234567890)
   - The '+' prefix is required
   - Country code must be included

3. **Account SID**:
   - Make sure to include the complete Account SID, including any trailing characters
   - The Account SID typically starts with 'AC'

## Usage

1. Start the server:
```bash
npm start
```

2. The server will be available to LibreChat for sending SMS messages.

## Error Handling

The server provides detailed error messages for common issues:

- Authentication errors: Check your Account SID and Auth Token
- Invalid phone numbers: Ensure numbers are in E.164 format
- Missing credentials: Verify all environment variables are set in LibreChat's `.env` file

## Debugging

The server includes detailed logging to help diagnose issues:

- Environment variable loading status
- Twilio client initialization
- Message sending attempts and results
- Detailed error information

## Security Considerations

1. Never commit your Twilio credentials to version control
2. Keep your Auth Token secure and rotate it if compromised
3. Use environment variables for all sensitive information
4. Consider using Twilio's test credentials for development

## Troubleshooting

Common issues and solutions:

1. **Authentication Error - invalid username**
   - Verify your Account SID is complete (including trailing characters)
   - Check that your Auth Token is correct
   - Ensure environment variables are set in LibreChat's `.env` file

2. **Invalid phone number format**
   - Ensure phone numbers include the '+' prefix
   - Include the country code
   - Remove any spaces or special characters

3. **Environment variables not loading**
   - Verify variables are set in LibreChat's `.env` file
   - Check for any typos in variable names
   - Ensure the server has been restarted after updating variables

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Your chosen license]

## Prompt Engineering Best Practices

When integrating this SMS server with LLMs, it's crucial to prevent looping behavior where the model might attempt to resend messages. Here are the key prompt engineering strategies we've implemented:

### 1. Tool Description Clarity
The tool description explicitly emphasizes the single-use nature of the SMS function:
```
"Send a SINGLE SMS message to a specified phone number. IMPORTANT: This function should ONLY be called ONCE per message. Do not attempt to resend or retry the same message. The function will automatically handle delivery status checking and provide a final result."
```

Key elements that help prevent looping:
- Use of "SINGLE" and "ONCE" in capital letters for emphasis
- Explicit instruction about not resending or retrying
- Clear statement about automatic status handling

### 2. Response Format Design
The response format is designed to reinforce the finality of the action:
- All responses are prefixed with `[FINAL]` to indicate terminal state
- Success responses include "Do not attempt to resend this message"
- Failure responses explicitly state not to retry
- Status checking is handled internally by the function

### 3. Best Practices for LLM Integration
When integrating with LLMs:
1. Always emphasize the single-use nature of the SMS function
2. Make it clear that status checking is handled automatically
3. Use explicit language about not retrying failed messages
4. Consider implementing rate limiting if needed
5. Add message tracking if the LLM needs to maintain conversation context

These prompt engineering techniques help ensure that LLMs understand the one-time nature of SMS sending and prevent unnecessary message loops.

## Receiving SMS Messages

### Architecture Overview

To handle incoming SMS messages, we propose a multi-component architecture:

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Twilio  │────▶│ Webhook      │────▶│ Message      │────▶│ LibreChat│
│          │     │ Server       │     │ Queue/Store  │     │          │
└──────────┘     └──────────────┘     └──────────────┘     └──────────┘
```

### Components

1. **Webhook Server**
   - Receives incoming SMS messages from Twilio
   - Validates and processes messages
   - Stores messages in the queue/store
   - Can be implemented as a separate service or integrated into the MCP server

2. **Message Queue/Store**
   - Stores incoming messages
   - Provides message retrieval interface
   - Can be implemented using:
     - Redis for real-time messaging
     - Database for persistent storage
     - WebSocket server for real-time updates

3. **LibreChat Integration**
   - Polls or subscribes to the message queue/store
   - Presents messages to the user
   - Maintains conversation context

### Implementation Considerations

1. **Message Storage**
   - Store message metadata (timestamp, sender, etc.)
   - Implement message status tracking
   - Consider message expiration policies

2. **Security**
   - Validate Twilio webhook signatures
   - Implement rate limiting
   - Secure message storage

3. **Scalability**
   - Design for horizontal scaling
   - Consider message volume
   - Implement proper error handling

4. **User Experience**
   - Real-time message delivery
   - Message threading
   - Conversation history

### Next Steps

1. Implement webhook endpoint for Twilio
2. Set up message storage solution
3. Create message retrieval interface
4. Integrate with LibreChat's conversation flow

This architecture allows for:
- Asynchronous message handling
- Scalable message storage
- Real-time message delivery
- Proper separation of concerns

## Twilio Integration Details

### Twilio Webhook Setup

1. **Configure Twilio Webhook**
   ```bash
   # Using Twilio CLI
   twilio phone-numbers:update +1234567890 \
     --sms-url https://your-domain.com/webhook/sms \
     --sms-method POST
   ```

2. **Webhook Payload Structure**
   ```json
   {
     "MessageSid": "SM...",
     "From": "+1234567890",
     "To": "+0987654321",
     "Body": "Message content",
     "NumMedia": "0"
   }
   ```

### LibreChat Integration

1. **MCP Tool Structure**
   ```typescript
   {
     name: "receive_sms",
     description: "Check for new SMS messages in the current conversation thread",
     inputSchema: {
       type: "object",
       properties: {
         conversationId: {
           type: "string",
           description: "The Twilio conversation ID to check for new messages"
         }
       }
     }
   }
   ```

2. **Message Flow**
   ```
   Twilio Webhook → Database → MCP Tool → LibreChat
   ```

3. **Implementation Steps**:
   - Set up Twilio webhook endpoint in your MCP server
   - Store incoming messages in a database with conversation context
   - Create an MCP tool that checks for new messages
   - Integrate with LibreChat's conversation system

### Database Schema

```sql
CREATE TABLE sms_messages (
    id SERIAL PRIMARY KEY,
    message_sid VARCHAR(255),
    conversation_id VARCHAR(255),
    from_number VARCHAR(20),
    to_number VARCHAR(20),
    body TEXT,
    received_at TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE
);

CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    twilio_conversation_id VARCHAR(255),
    librechat_conversation_id VARCHAR(255),
    created_at TIMESTAMP,
    last_message_at TIMESTAMP
);
```

### Security Considerations

1. **Webhook Security**
   - Validate Twilio signatures
   - Use HTTPS endpoints
   - Implement rate limiting

2. **Data Protection**
   - Encrypt sensitive data
   - Implement message retention policies
   - Follow privacy regulations

### Next Steps

1. **Initial Setup**
   - Configure Twilio webhook
   - Set up database
   - Create webhook endpoint

2. **MCP Integration**
   - Implement message storage
   - Create message retrieval tool
   - Add conversation management

3. **LibreChat Integration**
   - Add conversation context
   - Implement message display
   - Handle message threading

This implementation leverages Twilio's built-in features while maintaining compatibility with LibreChat's architecture.
