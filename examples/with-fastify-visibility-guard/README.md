# Fastify example

This example shows how to use [Fastify.js](https://www.fastify.io/) as a server for bull-board.

### Notes
1. It will work with any **cookie** / **basic auth** based auth, since the browser will attach
   the `session` cookie / basic auth header automatically to **each** request.


### Usage with Basic Auth
1. Navigate to `/basic/login`
2. Fill in username: `bull` & password: `board`

*Based on: https://github.com/fastify/fastify-basic-auth*

### Usage with Cookie Auth
1. Navigate to `/cookie/login`
2. Fill in username: `bull` & password: `board`

