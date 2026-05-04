FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=20121

EXPOSE 20121

CMD ["npm", "start"]
