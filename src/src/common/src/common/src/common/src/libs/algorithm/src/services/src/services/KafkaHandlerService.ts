FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./
RUN npm install
RUN npx prisma generate
COPY . .
RUN npm run build
CMD ["npm", "start"]
