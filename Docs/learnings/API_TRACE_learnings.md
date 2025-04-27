 # LibreChat Streaming Configuration Investigation

## Overview
This document summarizes findings from investigating streaming configuration issues in LibreChat, specifically focusing on the interaction between LibreChat's configuration and llama.cpp endpoint behavior.

## Configuration Flow Analysis
### Initial Setup
- Configuration set in `librechat.yaml` with `stream: false`
- Verbose logs revealed requests to llama.cpp still showing `stream: true`
- Indicates potential configuration override in the processing chain

### Code Structure
Key files involved in configuration handling:
- `LibreChat/api/server/services/Endpoints/custom/initialize.js`
- `LibreChat/api/server/services/Config/loadConfigEndpoints.js`

### Configuration Parameters
Multiple points of streaming configuration:
1. Default configuration in `getLLMConfig` function (`streaming: true`)
2. Custom endpoint configuration via `librechat.yaml`
3. Base endpoint schema's `streamRate` parameter

## Key Findings

### Configuration Override
- Stream parameter gets overridden between config loading and API call
- Dual parameter system (`stream` and `streamRate`) may cause confusion
- Different handling between `OpenAIClient` and custom endpoints

### Llama.cpp Specific Constraints
1. Cannot use tools while streaming is enabled
2. `oaicompat_completion_params_parse` function enforces this limitation
3. Requires `--jinja` flag for tools functionality

## Potential Solutions

### Configuration Approaches
1. Explicit `stream: false` in requests
2. Use `--props` endpoint for default generation settings
3. Investigation of configuration override chain
4. Refactor custom endpoint initialization streaming handling

### Implementation Options
- Trace complete configuration flow
- Study `streamRate` and `stream` parameter interaction
- Compare streaming configuration across different endpoints
- Modify code for stricter yaml configuration adherence

## Next Steps
1. Complete configuration flow tracing
2. Analyze parameter interaction
3. Cross-endpoint comparison
4. Code modification planning

## Technical Considerations
- Configuration precedence needs clarification
- Parameter naming consistency could be improved
- Better documentation of streaming behavior needed
- Consider standardizing streaming configuration across endpoints