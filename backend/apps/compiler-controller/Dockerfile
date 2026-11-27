FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY apps/compiler-controller/*.mjs /opt/controller/
USER node
WORKDIR /jobs
HEALTHCHECK --interval=5s --timeout=3s --retries=6 \
 CMD ["node", "-e", "const s=require('fs').statSync('/tmp/controller-alive');process.exit(Date.now()-s.mtimeMs<15000?0:1)"]
CMD ["node", "--disallow-code-generation-from-strings", "/opt/controller/main.mjs"]
