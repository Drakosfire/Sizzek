# Configuring Ollama for Docker Container Access

## ⚠️ SECURITY WARNING
The default configuration exposes Ollama to your local network. If you're in a shared or public network environment, this could be a security risk. Always use the most restrictive configuration possible.

## Problem
When running LibreChat in Docker and trying to connect to a locally running Ollama instance, you might encounter connection errors like:

```
Failed to fetch models from Ollama API [...] connect ECONNREFUSED 172.17.0.1:11434
```

This occurs because by default, Ollama only listens on localhost (`127.0.0.1:11434`), making it inaccessible from Docker containers.

## Solution

### 1. Identify the Issue
Check Ollama's listening configuration:
```bash
ss -tulpn | grep 11434
```

If you see `127.0.0.1:11434`, Ollama is only listening on localhost.

### 2. Fix Ollama's Configuration
1. Stop the current Ollama process
2. Restart with the correct host configuration:
   ```bash
   # Most secure: Only allow Docker bridge network
   OLLAMA_HOST=172.17.0.1 ollama serve
   
   # Alternative: Listen on all local interfaces
   OLLAMA_HOST=0.0.0.0 ollama serve
   ```
3. Verify the new configuration:
   ```bash
   ss -tulpn | grep 11434
   ```
   You should see the configured interface, indicating Ollama is listening on the specified network.

### 3. Verify and Apply
1. Test connectivity from the LibreChat container:
   ```bash
   docker exec -it LibreChat wget -qO- http://172.17.0.1:11434/api/tags
   ```
2. Restart the LibreChat API service:
   ```bash
   docker compose restart api
   ```

## Security Considerations

### Recommended Configuration
1. **Use Docker Bridge Network**:
   ```bash
   OLLAMA_HOST=172.17.0.1 ollama serve
   ```
   This restricts Ollama to only accept connections from Docker containers.

2. **Add Firewall Rules**:
   ```bash
   # Allow only Docker bridge network
   sudo ufw allow from 172.17.0.0/16 to any port 11434
   sudo ufw deny 11434
   ```

3. **Use Docker Internal Network**:
   - Create a dedicated Docker network
   - Connect both LibreChat and Ollama to this network
   - This isolates the services from the host network

### Monitoring
Regularly check your system logs for suspicious activity:
```bash
# Check Ollama logs
journalctl -u ollama

# Check network connections
ss -tulpn | grep 11434
```

## Key Takeaway
When setting up Ollama to work with Docker containers:
1. Use the most restrictive network configuration possible
2. Implement proper firewall rules
3. Monitor for suspicious activity
4. Consider using Docker's internal networking for better isolation

## LibreChat Configuration
To properly configure LibreChat to work with Ollama, use the following configuration in your `librechat.yaml`:

```yaml
- name: "ollama"
  apiKey: "ollama"
  baseURL: "http://172.17.0.1:11434/v1/chat/completions"
  models:
    default: ["xLAM-2-8B"]
    fetch: true
  titleConvo: true
  titleModel: "current_model"
  summarize: false
  summaryModel: "current_model"
  forcePrompt: false
  modelDisplayLabel: "Ollama"
  directEndpoint: true
  addParams:
    stream: true
    stop: [
      "<|start_header_id|>",
      "<|end_header_id|>",
      "<|eot_id|>",
      "<|reserved_special_token"
    ]
```

Key points about this configuration:
1. The `baseURL` must include the `/v1/chat/completions` path
2. `stream: true` is required for proper communication
3. The `stop` parameters help prevent token generation issues
4. `directEndpoint: true` ensures direct communication with Ollama 