# CSRF protection

The dashboard's destructive actions (retry, clean, pause, obliterate) are state-changing PUT/POST calls. If the dashboard lives on the same origin as an untrusted user session, protect those calls with CSRF tokens.

From [`examples/with-express-csrf`](https://github.com/felixmosh/bull-board/tree/master/examples/with-express-csrf). The example uses [`csrf-csrf`](https://github.com/Psifi-Solutions/csrf-csrf) (double-submit cookie pattern). The older `csurf` package is deprecated, don't reach for it.

```js
const { doubleCsrf } = require('csrf-csrf');
const cookieParser = require('cookie-parser');

const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => 'Secret',
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => req.headers['x-xsrf-token'] || '',
  cookieName: 'x-csrf-token',
  cookieOptions: { secure: process.env.NODE_ENV === 'production' },
});

app.use(cookieParser());

app.get('/ui/*', (req, res, next) => {
  if (['api', 'static'].every((part) => !req.path.includes(`/${part}/`))) {
    const token = generateToken(req, res, true);
    res.cookie('XSRF-TOKEN', token, {
      sameSite: 'lax',
      path: '/ui/',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  next();
});

app.use('/ui', doubleCsrfProtection, serverAdapter.getRouter());
```

Two pieces are at play. `doubleCsrfProtection` rejects any non-GET request to `/ui` that lacks a valid token. The `XSRF-TOKEN` cookie is readable by the dashboard's bundled Axios, which mirrors it into the `x-xsrf-token` header on every request. That matches what `getTokenFromRequest` pulls off.

The extra `res.cookie` dance exists because the base cookie set by `csrf-csrf` is `httpOnly` (tracked in a pending upstream PR). Dashboard JS needs a readable copy, hence the second cookie.

If you're behind a login with `SameSite=Lax` session cookies, modern browsers already block most cross-site POSTs. Belt-and-suspenders CSRF on top doesn't hurt for high-value dashboards.

## See also

- [Basic auth](/recipes/basic-auth). A login is usually a prerequisite before CSRF matters.
