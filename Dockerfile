FROM ghcr.io/ggml-org/llama.cpp:server-cuda

# Create a directory for models
RUN mkdir -p /models

# Set the working directory
WORKDIR /models

# Expose the server port
EXPOSE 8001

# Default command to run the server
CMD ["--host", "0.0.0.0", "--port", "8001", "--model", "/models/llama-2-7b-chat.Q4_K_M.gguf"]
