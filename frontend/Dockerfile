# frontend/Dockerfile
FROM node:18-alpine

# Установим curl (и сохранём небольшой размер)
RUN apk add --no-cache curl

# Копируем зависимости и проект для dev запуска (в development вы монтируете исходники)
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
