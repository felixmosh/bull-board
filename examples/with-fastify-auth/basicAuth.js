const { FastifyAdapter } = require('@bull-board/fastify');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');

module.exports.basicAuth = function basicAuth(fastify, { queue }, next) {
  const authenticate = { realm: 'Bull-Board' };
  function validate(username, password, req, reply, done) {
    if (username === 'bull' && password === 'board') {
      done();
    } else {
      done(new Error('Unauthorized'));
    }
  }

  fastify.register(require('fastify-basic-auth'), { validate, authenticate });

  fastify.after(() => {
    const serverAdapter = new FastifyAdapter();

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
    });

    serverAdapter.setBasePath('/basic/ui');
    fastify.register(serverAdapter.registerPlugin(), { prefix: '/basic/ui' });
    fastify.route({
      method: 'GET',
      url: '/basic/login',
      handler: async (req, reply) => {
        reply.redirect('/basic/ui');
      },
    });
    fastify.addHook('onRequest', fastify.basicAuth);
  });

  next();
};
