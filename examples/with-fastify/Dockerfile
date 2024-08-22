FROM node:lts

WORKDIR /app/website

EXPOSE 3000
COPY . /app/website
RUN yarn install

CMD ["yarn", "start"]
