FROM node:20-slim AS builder
WORKDIR /app
RUN mkdir -p db
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY tsconfig.json postcss.config.mjs tailwind.config.ts components.json next.config.ts ./
ENV DATABASE_URL="file:/app/db/custom.db"
RUN npm install
RUN npx prisma generate
RUN npx prisma db push --skip-generate
COPY src ./src
COPY public ./public
RUN npx next build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/db/custom.db"
ENV PORT=10000
ENV HOSTNAME="0.0.0.0"
RUN mkdir -p db
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
EXPOSE 10000
CMD ["sh", "-c", "npx prisma db push --skip-generate 2>/dev/null && node server.js"]
