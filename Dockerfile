FROM node:20-alpine AS builder
WORKDIR /app
RUN mkdir -p db
COPY package.json package-lock.json ./
COPY prisma ./prisma/
ENV DATABASE_URL="file:/app/db/custom.db"
RUN npm install
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/db/custom.db"
RUN mkdir -p db
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
EXPOSE 10000
CMD ["node", "server.js"]
