const { FastifyAdapter } = require('@bull-board/fastify');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const pointOfView = require('@fastify/view');
const path = require('path');

const users = [
  { username: 'user1', password: 'bullboard', allowedQueues: ['BullMQ1'] },
  { username: 'user2', password: 'bullboard', allowedQueues: ['BullMQ2'] },
];

module.exports.cookieAuth = function cookieAuth(fastify, { queues }, next) {
  fastify.register(require('@fastify/cookie'), {
    secret: 'my-secret-key', // for cookies signature
  });

  fastify.register(require('@fastify/jwt'), {
    secret: 'super-secret',
    cookie: {
      cookieName: 'token',
    },
  });

  fastify.after(() => {
    const serverAdapter = new FastifyAdapter();
    function visibilityGuard(req) {
      if (req.headers.cookie) {
        const cookies = fastify.parseCookie(req.headers.cookie);
        try {
          if (cookies.token) {
            const decodedToken = fastify.jwt.verify(cookies.token);

            if (decodedToken.allowedQueues?.includes(this.queue.name)) {
              return true;
            }
          }
        } catch (error) {
          console.error(error);
          return false;
        }
      }

      return false;
    }
    createBullBoard({
      queues: queues.map((queue) => {
        const adapter = new BullMQAdapter(queue);
        adapter.setVisibilityGuard(visibilityGuard);
        return adapter;
      }),
      serverAdapter,
    });

    serverAdapter.setBasePath('/cookie/ui');
    fastify.register(serverAdapter.registerPlugin(), { prefix: '/cookie/ui' });

    fastify.register(pointOfView, {
      engine: {
        ejs: require('ejs'),
      },
      root: path.resolve('./views'),
    });

    fastify.route({
      method: 'GET',
      url: '/cookie/login',
      handler: (req, reply) => {
        reply.view('login.ejs');
      },
    });

    fastify.route({
      method: 'POST',
      url: '/cookie/login',
      handler: async (req, reply) => {
        const { username = '', password = '' } = req.body;
        const user = users.find((u) => u.username === username);
        if (!!user && password === user.password) {
          const token = await reply.jwtSign({
            name: user.username,
            allowedQueues: user.allowedQueues,
          });

          reply
            .setCookie('token', token, {
              path: '/cookie',
              secure: false, // send cookie over HTTPS only
              httpOnly: true,
              sameSite: true, // alternative CSRF protection
            })
            .send({ success: true, url: '/cookie/ui' });
        } else {
          reply.code(401).send({ error: 'invalid_username_password' });
        }
      },
    });

    fastify.addHook('preHandler', async (request, reply) => {
      if (request.url === '/cookie/login') {
        return;
      }

      try {
        await request.jwtVerify();
      } catch (error) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    });
  });

  next();
};
