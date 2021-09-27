FROM node:16.3-alpine3.12

WORKDIR /home/node/app

COPY package.json ./
COPY .env ./

RUN npm install

COPY . .