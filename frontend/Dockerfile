# ---------------------------------------------------------------------------
# Stage 1: Build Astro static site
# PUBLIC_API_URL must be baked in at build time — Astro/Vite embeds it
# into the JS bundle during astro build.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

ARG PUBLIC_API_URL=http://localhost:8080
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV VITE_API_URL=$PUBLIC_API_URL

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Serve with nginx
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
