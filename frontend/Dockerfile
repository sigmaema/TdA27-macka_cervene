FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV PORT=3001
EXPOSE 3001
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT}"]
