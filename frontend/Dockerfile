FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CDN_URL
ARG NEXT_PUBLIC_SITE_NAME
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_CDN_URL=${NEXT_PUBLIC_CDN_URL} \
    NEXT_PUBLIC_SITE_NAME=${NEXT_PUBLIC_SITE_NAME}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=4310 HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 4310
CMD ["node","server.js"]
