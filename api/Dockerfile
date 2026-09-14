FROM node:18-alpine

WORKDIR /app

RUN npm init -y && npm install express cors body-parser sqlite3

RUN mkdir -p /app/data /music /playlists

COPY server.js .

EXPOSE 3000

CMD ["node", "server.js"]
