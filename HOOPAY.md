# bull-board, HooPay fork

This fork adds job filters to the queue page and queue grouping by name prefix, and is
published privately for HooPay projects.

## What the fork adds

- **Job filters** above the job list: exact job id, order (newest or oldest first) and a search
  over the job (`name`, `data`, `returnvalue`, `progress`, options). The search is
  [JSONata](https://docs.jsonata.org) with SQL style operators on top:

  | Write | Meaning |
  |---|---|
  | `data.payload.organizationId = 77` | field equals a value (`<>` and `==` also work) |
  | `data.email LIKE 'ana%'` | pattern, case sensitive: `%` any text, `_` one character, `'50\\%'` a literal `%` |
  | `data.email ILIKE '%@hoopay.com.br'` | the same, ignoring case; `NOT LIKE` / `NOT ILIKE` negate |
  | `data.status IN ('paid', 'refunded')` | value in a list; `NOT IN` negates |
  | `data.coupon IS NULL` | field missing or `null`; `IS NOT NULL` negates |
  | `name = 'webhook' AND (data.amount >= 100 OR NOT (data.test = true))` | combine conditions |
  | `$icontains(data.description, 'pix')` | substring, ignoring case |

  The **Filter builder** button next to the search opens rows of field / operator / value,
  joined by AND or OR, that write this text for you. Fields are suggested from the data of the
  jobs on screen.

  A field that holds an array matches when any element does. Keywords inside quotes are left
  alone. The rewrite lives in `packages/api/src/handlers/searchSyntax.ts`.

- **Group by name prefix** (Settings, or `uiConfig.overview.groupByPrefix: true` as the default):
  queues without a `delimiter` are grouped in the sidebar and the overview by the first word of
  their name, so `Checkout-Order` and `Checkout-Abandoned` open from one `Checkout` group.

Three packages are published to GitHub Packages:

| Published as | Installed as | Replaces |
|---|---|---|
| `@hoopay/bull-board-api` | `@bull-board/api` | upstream `@bull-board/api` |
| `@hoopay/bull-board-ui` | `@bull-board/ui` | upstream `@bull-board/ui` |
| `@hoopay/bull-board-express` | `@bull-board/express` | upstream `@bull-board/express` |

Each package depends on the others through npm aliases, so they all install under
`node_modules/@bull-board/*`. Code that imports `@bull-board/...` works without changes.

## Using it in a project

1. Create a GitHub token (classic) with the `read:packages` scope. CI and Docker builds need one too.

2. Add a `.npmrc` next to the project's `package.json`:

   ```
   @hoopay:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
   ```

3. Point the dependency at the fork, keeping the original name so imports stay the same:

   ```json
   "@bull-board/express": "npm:@hoopay/bull-board-express@9.10.5-hoopay.1"
   ```

   With yarn v1: `yarn add @bull-board/express@npm:@hoopay/bull-board-express@9.10.5-hoopay.1`.
   With npm: `npm install @bull-board/express@npm:@hoopay/bull-board-express@9.10.5-hoopay.1`.

4. `bullmq` must be at least `5.56.0`, the lowest version this fork supports.

## Releasing a new version

Versions follow upstream with a `-hoopay.N` suffix, for example `9.10.5-hoopay.1`, then
`9.10.5-hoopay.2`.

```bash
git tag hoopay-v9.10.5-hoopay.1
git push origin hoopay-v9.10.5-hoopay.1
```

The tag starts `.github/workflows/hoopay-publish.yml`, which builds, runs the api, express and
ui tests, and publishes with the repository's `GITHUB_TOKEN`. You can also start it from the
Actions tab ("HooPay publish", then "Run workflow") and type a version.

Before tagging, you can check the packages locally:

```bash
yarn build
node scripts/hoopay-publish.mjs 9.10.5-hoopay.1 --pack   # writes .tgz files to .hoopay-publish/
```

## Pulling in upstream changes

The publish script renames packages in a staging folder and leaves the repository's
`package.json` files alone, so upstream merges only conflict where the code itself conflicts:

```bash
git remote add upstream https://github.com/felixmosh/bull-board.git   # once
git fetch upstream
git merge upstream/master
```
