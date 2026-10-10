FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production HOST=0.0.0.0 AI_PROVIDER=gemini MOCK=0
EXPOSE 3000
CMD ["node", "server.mjs"]
