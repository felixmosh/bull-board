const { FastifyAdapter } = require('@bull-board/fastify');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const pointOfView = require('point-of-view');
const path = require('path');

module.exports.cookieAuth = function cookieAuth(fastify, { queue }, next) {
  fastify.register(require('fastify-cookie'), {
    secret: 'my-secret-key', // for cookies signature
  });

  fastify.register(require('fastify-jwt'), {
    secret: 'super-secret',
    cookie: {
      cookieName: 'token',
    },
  });

  fastify.after(() => {
    const serverAdapter = new FastifyAdapter();

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
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
      handler: async (req, reply) => {
        reply.view('login.ejs');
      },
    });

    fastify.route({
      method: 'POST',
      url: '/cookie/login',
      handler: async (req, reply) => {
        const { username = '', password = '' } = req.body;

        if (username === 'bull' && password === 'board') {
          const token = await reply.jwtSign({
            name: 'foo',
            role: ['admin', 'spy'],
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
