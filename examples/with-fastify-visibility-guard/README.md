# Fastify example with queue visibility per user (visibilityGuard)

This example shows how to use [Fastify.js](https://www.fastify.io/) as a server for bull-board.
And how to control queue visibility per user using the `visibilityGuard` feature.

### Notes
1. It will work with any **cookie** based auth, since the browser will attach
   the `session` cookie / basic auth header automatically to **each** request.
2. The `visibilityGuard` is a function that is executed for every queue,
   it should return `true` if the current user is allowed to view the queue, and `false` otherwise.
   In this example, we are using a JWT cookie to store the user's allowed queues.
   And the guard is checking if the queue name is present in the user's allowed queues.

### Usage with Cookie Auth
1. Navigate to `/cookie/login`
2. Fill in username: `user1` / `user2` & password: `bullboard`
   - `user1` can see `BullMQ1`
   - `user2` can see `BullMQ2`

