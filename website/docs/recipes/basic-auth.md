# Add basic auth

The dashboard has no built-in auth. Don't expose it on the open internet without one. Here's the minimum per framework.

## Express + Passport

From [`examples/with-express-auth`](https://github.com/felixmosh/bull-board/tree/master/examples/with-express-auth).

```js
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { ensureLoggedIn } = require('connect-ensure-login');
const session = require('express-session');

passport.use(new LocalStrategy((username, password, cb) => {
  if (username === 'bull' && password === 'board') {
    return cb(null, { user: 'bull-board' });
  }
  return cb(null, false);
}));

passport.serializeUser((user, cb) => cb(null, user));
passport.deserializeUser((user, cb) => cb(null, user));

app.use(session({ secret: 'keyboard cat', resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

app.post('/ui/login', passport.authenticate('local', { failureRedirect: '/ui/login?invalid=true' }),
  (req, res) => res.redirect('/ui'));

app.use('/ui', ensureLoggedIn({ redirectTo: '/ui/login' }), serverAdapter.getRouter());
```

Run it:

```sh
git clone https://github.com/felixmosh/bull-board
cd bull-board/examples/with-express-auth
npm install && npm start
# http://localhost:3000/ui (login: bull / board)
```

## Fastify + @fastify/basic-auth

From [`examples/with-fastify-auth`](https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify-auth).

```js
await app.register(require('@fastify/basic-auth'), {
  validate: (username, password, req, reply, done) => {
    if (username === 'bull' && password === 'board') return done();
    done(new Error('Unauthorized'));
  },
  authenticate: { realm: 'Bull-Board' },
});

app.after(() => {
  const serverAdapter = new FastifyAdapter();
  createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
  serverAdapter.setBasePath('/ui');
  app.register(serverAdapter.registerPlugin(), { prefix: '/ui' });

  app.addHook('onRequest', (req, reply, next) => {
    app.basicAuth(req, reply, (err) => err ? reply.code(401).send({ error: err.name }) : next());
  });
});
```

The `onRequest` hook covers every route registered after it. Scope the auth plugin inside a child context if you want it to cover only the dashboard.

## Hapi + strategy

From [`examples/with-hapi-auth`](https://github.com/felixmosh/bull-board/tree/master/examples/with-hapi-auth).

```js
await app.register(require('@hapi/basic'));
app.auth.strategy('simple', 'basic', {
  validate: async (_req, username, password) => ({
    isValid: username === 'bull' && password === 'board',
    credentials: { username },
  }),
});

const serverAdapter = new HapiAdapter();
createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
serverAdapter.setBasePath('/ui');

await app.register(
  { plugin: serverAdapter.registerPlugin(), options: { auth: 'simple' } },
  { routes: { prefix: '/ui' } }
);
```

The plugin options pass straight to Hapi's route config, so the auth strategy applies to every bull-board route.

## NestJS + guards

From [`examples/with-nestjs-fastify-auth`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-fastify-auth).

NestJS on the Fastify platform with a standard `@UseGuards()` guard. The example uses passport-local plus `@fastify/secure-session` for session cookies.

```ts
@Controller()
export class AppController {
  @Post('login')
  @UseFilters(AuthExceptionFilter)
  @UseGuards(AuthGuard('local'))
  login(@Request() req: FastifyRequest, @Response() reply: FastifyReply) {
    req.session.set('sev-data', req.user);
    return reply.status(302).redirect('/queues');
  }
}
```

The dashboard is mounted by `@bull-board/nestjs`, and the module's own guard checks the session before the route resolves.

## Combine with read-only mode

Auth keeps strangers out. [Read-only mode](/recipes/read-only-mode) keeps authenticated users from running destructive actions. Use both for public-facing status boards.
