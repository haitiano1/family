FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "start"]
