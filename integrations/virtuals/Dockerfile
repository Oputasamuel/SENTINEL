FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY provider.ts ./

ENV NODE_ENV=production
ENV VIRTUALS_NETWORK=production
EXPOSE 3000

CMD ["npm", "start"]
