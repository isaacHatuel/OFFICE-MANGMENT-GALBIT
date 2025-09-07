# Dockerfile לשרת Node.js
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
ENV NODE_ENV=production
RUN npm install --omit=dev
COPY . .
EXPOSE 3001
CMD ["npm","run","start"]
