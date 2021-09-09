const { FastifyAdapter } = require('@bull-board/fastify');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const pointOfView = require('point-of-view');
const path = require('path');

module.exports.cookieAuth = function cookieAuth(fastify, { queue }, next) {
  fastify.register(require('fastify-cookie'), {
    secret: 'my-secret', // for cookies signature
    parseOptions: {}, // options for parsing cookies
  });

  fastify.register(require('fastify-jwt'), {
    secret: 'supersecret',
    cookie: {
      cookieName: 'token',
    },
  });

  function validate(req, reply, done) {
    if (username === 'bull' && password === 'board') {
      done();
    } else {
      done(new Error('Unauthorized'));
    }
  }

  fastify.decorate('validate', validate);

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
    fastify.addHook('onRequest', (request, reply, next) => {
      if (request.url === '/cookie/login') {
        return next();
      }

      return request.jwtVerify();
    });
  });

  next();
};
