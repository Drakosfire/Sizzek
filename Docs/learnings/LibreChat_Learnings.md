# LibreChat Learnings

## Project Overview
This document captures key learnings from integrating various components with LibreChat, including:
- OpenAI API endpoint configuration
- Function calling with MCP server
- Zonos TTS integration
- Docker deployment and customization
- Custom LLM endpoint integration

## Key Accomplishments

### 1. OpenAI API Integration
- Successfully configured LibreChat to use OpenAI API endpoints
- Implemented proper authentication and request handling
- Established stable communication between LibreChat and OpenAI services

### 2. Function Calling & MCP Server
- Developed MCP server to serve tools for memory management
- Implemented a simple knowledge graph system
- Created efficient function calling mechanisms
- Established reliable server-client communication

### 3. Zonos TTS Integration
- Merged two Zonos forks:
  - Streaming audio implementation
  - Server API endpoint for voice generation
- Key technical achievements:
  - Optimized chunk overlap (3 tokens) for smoother audio
  - Improved voice quality through better sample preparation
  - Successfully integrated with LibreChat's existing streaming infrastructure

### 4. Docker Deployment
- Created `docker-compose.override.yaml` for custom modifications
- Learned to modify LibreChat's build process
- Implemented proper file mounting for development

## Technical Insights

### Custom LLM Endpoint Integration
- Successfully integrated llama.cpp as a custom endpoint
- Key configuration learnings:
  - `baseURL` should point to the root of the service (e.g., `http://host.docker.internal:8001`)
  - LibreChat automatically appends `/chat/completions` to the URL for chat endpoints
  - `forcePrompt: true` can be used to prevent chat completion behavior
  - `apiKey` field is required but can be any value if the service doesn't use authentication
  - `dropParams` is crucial for removing unsupported parameters
  - llama.cpp doesn't allow tool calling when streaming.
- Important considerations:
  - Endpoint must match the expected format of the LLM service
  - Model names in configuration must match the service's model identifiers
  - Docker networking requires proper host configuration (`host.docker.internal` for local services)

### Audio Streaming
- LibreChat's built-in streaming capabilities are robust and don't require modification
- Browser compatibility varies (Chrome works well, Firefox may have issues)
- Key parameters for optimal streaming:
  - Chunk overlap: 3+ tokens for smoother transitions
  - Voice sample quality significantly impacts output
  - Proper endpoint configuration in `librechat.yaml` is crucial

### Configuration
- `librechat.yaml` serves as the central configuration point
- LocalAI endpoint can be used as a proxy for custom TTS services
- Server API endpoints should be designed to match LibreChat's expectations

### Development Process
- Docker-based development requires override files for customization
- Error logging needs to be implemented at the service level
- Testing should be done across different browsers

## Lessons Learned

### What Worked Well
1. Using LibreChat's existing streaming infrastructure
2. Configuring services through YAML files
3. Docker override for development modifications
4. Increasing chunk overlap for smoother audio

### Challenges Overcome
1. Initial assumption about needing to modify LibreChat's streaming
2. Browser compatibility issues
3. Audio quality optimization
4. Docker deployment customization

### Best Practices
1. Leverage existing LibreChat functionality where possible
2. Use proper configuration files for service integration
3. Implement comprehensive error logging
4. Test across multiple browsers
5. Focus on service quality (voice samples, chunk processing) rather than infrastructure modification

## Future Considerations

### Audio Quality
- Further optimize chunk overlap
- Improve voice sample processing
- Enhance cross-fading between chunks

### Integration
- Explore emotion tensor handling
- Implement dynamic padding strategies
- Consider browser-specific optimizations

### Development
- Document Docker customization process
- Create testing framework for audio quality
- Establish monitoring for streaming performance

## Conclusion
The project successfully integrated multiple components with LibreChat while learning valuable lessons about:
- Working with existing infrastructure
- Audio streaming optimization
- Service configuration
- Development and deployment processes

These learnings provide a solid foundation for future integrations and improvements. 