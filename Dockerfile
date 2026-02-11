FROM node:lts

WORKDIR /app/website

EXPOSE 3005 35729
COPY ./docs /app/docs
COPY ./website /app/website
RUN yarn install

CMD ["yarn", "start"]
