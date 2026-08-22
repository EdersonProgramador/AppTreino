FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json .

RUN npm install 

COPY . .

RUN npx prisma generate \
  && npx prisma migrate deploy \
  && npm run build

RUN mkdir -p dist/public/
COPY src/public/ dist/public/

EXPOSE 8081

ENV PORT=8081

CMD [ "npm", "run", "start" ]
