# Zonos TTS Integration with LibreChat

## Key Learnings

### 1. Docker Network Communication
- When LibreChat runs in Docker but Zonos API runs on the host machine, `localhost` won't work
- Use `host.docker.internal` to allow Docker containers to access services running on the host machine
- Example configuration in `librechat.yaml`:
```yaml
speech:
  tts:
    localai:
      url: "http://host.docker.internal:8001/v1/audio/speech/stream"
      voices: ["test_voice"]
      backend: 'zonos'
      apiKey: ''  # Zonos API doesn't require authentication
```

### 2. Port Configuration
- Ensure Zonos API runs on a different port than other services (e.g., RAG API)
- Default port in Zonos API is 8001
- Port conflicts can prevent services from starting properly

### 3. Request Format
- Zonos API expects a specific request format:
  - `model`: "Zyphra/Zonos-v0.1-transformer"
  - `input`: Text to synthesize
  - `voice`: Voice ID or name
  - `speed`: Speaking speed (default: 1.0)
  - `language`: Language code (default: "en-us")
  - `response_format`: Audio format (default: "mp3")

### 4. Error Handling
- Empty error messages often indicate connection issues rather than API format problems
- Check network connectivity between containers and host services
- Verify service URLs and ports are correctly configured

### 5. Debugging Tips
- Use `curl` to test API endpoints directly:
```bash
curl -X POST http://localhost:8001/v1/audio/speech/stream \
  -H "Content-Type: application/json" \
  -d '{"input": "test", "voice": "test_voice", "model": "Zyphra/Zonos-v0.1-transformer"}'
```
- Check Docker logs for connection errors
- Verify service names and ports in Docker Compose files

## Future Improvements
1. Consider adding Zonos API to Docker Compose for production deployment
2. Implement proper error handling and logging
3. Add support for more Zonos API features (emotion, speed, etc.)
4. Create a dedicated Zonos TTS provider in LibreChat instead of using localai backend

## Troubleshooting Checklist
- [ ] Verify Zonos API is running on the correct port
- [ ] Check Docker network configuration
- [ ] Verify URL in librechat.yaml uses correct host/port
- [ ] Test API endpoint directly with curl
- [ ] Check Docker logs for connection errors
- [ ] Verify request format matches Zonos API expectations 