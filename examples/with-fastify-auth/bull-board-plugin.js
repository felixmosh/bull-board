const { FastifyAdapter } = require('@bull-board/fastify');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');

module.exports.bullBoardWithAuth = function bullBoardWithAuth(fastify, { queue }, next) {
  const authenticate = { realm: 'Westeros' };
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

    serverAdapter.setBasePath('/ui');
    fastify.register(serverAdapter.registerPlugin(), { prefix: '/ui' });
    fastify.route({
      method: 'GET',
      url: '/login',
      handler: async (req, reply) => {
        reply.redirect('/ui');
      },
    });
    fastify.addHook('onRequest', fastify.basicAuth);
  });

  next();
};
