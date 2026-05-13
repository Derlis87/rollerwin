FROM node:20-alpine AS builder
WORKDIR /app
RUN mkdir -p db
COPY package.json package-lock.json ./
COPY prisma ./prisma/
ENV DATABASE_URL="file:/app/db/custom.db"
RUN npm install
RUN npx prisma generate
COPY . .

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/db/custom.db"
ENV PORT=10000
RUN mkdir -p db
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 10000
CMD ["node", "server.js"]
