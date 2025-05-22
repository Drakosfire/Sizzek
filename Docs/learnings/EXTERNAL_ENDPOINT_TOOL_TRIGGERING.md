# External Endpoint Tool Triggering - Investigation Plan

## Overview

This document outlines the investigation plan for modifying the external message injection endpoint to trigger LLM processing, similar to how normal user messages are handled. Currently, external messages are injected as responses, but we want to route them through the LLM processing pipeline.

## Current State

### External Message Injection
- Messages are injected with `role: 'external'` and `isCreatedByUser: false`
- Messages are saved directly to the database
- No LLM processing occurs
- Messages appear as responses in the conversation

## Investigation Plan

### 1. Message Flow Analysis

#### Current External Message Flow
- Entry point: `POST /api/messages/:conversationId/external`
- Direct database storage
- No LLM processing
- Broadcast via SSE for real-time updates

#### Normal User Message Flow (To Investigate)
- Entry point: `POST /api/messages/:conversationId`
- Message processing through `BaseClient.sendMessage()`
- LLM client handling (OpenAI, Google, etc.)
- Response handling and storage

### 2. Key Components to Investigate

#### a. Message Creation & Processing
- How user messages are formatted before LLM processing
- Message structure and required fields
- Role handling and message type conversion

#### b. LLM Client Integration
- How different LLM clients handle messages
- Message formatting for different providers
- Response handling and streaming

#### c. Database & State Management
- Message storage flow
- Conversation state management
- Parent-child message relationships

### 3. Investigation Steps

#### a. Step 1: Message Entry Point
- Examine `POST /api/messages/:conversationId` endpoint
- Understand message validation and initial processing
- Identify required fields and message structure

#### b. Step 2: Client Processing
- Study `BaseClient.sendMessage()` implementation
- Understand message formatting and preparation
- Identify how messages are queued for LLM processing

#### c. Step 3: LLM Integration
- Review how messages are formatted for different LLM providers
- Understand response handling and streaming
- Identify any provider-specific requirements

#### d. Step 4: Response Processing
- Examine how LLM responses are processed
- Understand message storage and state updates
- Review real-time updates and SSE implementation

### 4. Implementation Considerations

- Message role conversion (external → user)
- Proper message threading and parent-child relationships
- LLM client selection and configuration
- Response handling and storage
- Real-time updates via SSE

### 5. Testing Strategy

- Unit tests for message conversion
- Integration tests for LLM processing
- End-to-end tests for the complete flow
- SSE and real-time update testing

## Next Steps

1. First, we should examine the normal user message flow in detail by:
   - Looking at the message creation endpoint
   - Understanding how messages are processed through the LLM client
   - Examining the response handling

2. Then, we can plan the modifications needed to:
   - Convert external messages to user messages
   - Route them through the LLM processing pipeline
   - Handle responses appropriately

## Notes

- This investigation will help us understand how to properly integrate external messages into the LLM processing pipeline
- We need to ensure proper message threading and state management
- Real-time updates via SSE must be maintained
- Security and authentication must be preserved 