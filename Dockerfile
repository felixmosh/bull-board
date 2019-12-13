###############################################################################
# Step 1 : Builder image for UI

FROM node:12 as builder

ARG DEBUG
ARG NODE_ENV=production

RUN npm set progress=false && npm config set depth 0 && npm cache clean --force

# Define working directory and copy source
WORKDIR /tmp

COPY ./package*.json webpack.*.js ./

# Install deps (ran separately for caching)
RUN npm install --only=prod
RUN npm install --only=dev

# Copy source
COPY ./ui ./ui

RUN npm run build

###############################################################################
# Step 2 : Run image

FROM node:12-alpine

WORKDIR /app/

RUN chown node:node /app/

# set our node environment, either development or production
# defaults to production, compose overrides this to development on build and run
ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV

# default to port 3000 for node, and 9229 and 9230 (tests) for debug
ARG PORT=3000
ENV PORT $PORT
EXPOSE $PORT 9229 9230

# Set up Intl data support for Luxon
ENV REDIS_HOST localhost
ENV REDIS_PORT 6379
ENV REDIS_USE_TLS false

# check every 30s to ensure this service returns HTTP 200
#HEALTHCHECK --interval=30s CMD node api/healthcheck.js # TODO fix this? throws port 3000 binding error

ENV PATH /app/node_modules/.bin:$PATH

# if you want to use npm start instead, then use `docker run --init in production`
# so that signals are passed properly. Note the code in index.js is needed to catch Docker signals
# using node here is still more graceful stopping then npm with --init afaik
# I still can't come up with a good production way to run with npm and graceful shutdown
CMD [ "node", "/app/standalone.js" ]

#Get node_modules
COPY --from=builder /tmp/node_modules /app/node_modules/

# copy in our dep files
COPY package*.json /app/

RUN cd /app && npm install --only=production

# Get built code from builder image.
COPY --from=builder /tmp/static /app/static

COPY standalone.js index.js /app/

COPY ui/index* ui/xcode.css /app/ui/

COPY ./routes/ /app/routes

# the official node image provides an unprivileged user as a security best practice
# https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md#non-root-user
USER node
