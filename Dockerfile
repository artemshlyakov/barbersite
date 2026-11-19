FROM node:24-alpine AS build
WORKDIR /build
COPY . .
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 STATIC_DIR=/app/dist
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY server ./server
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
