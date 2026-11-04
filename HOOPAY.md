# bull-board, HooPay fork

This fork adds job search to the queue page and is published privately for HooPay projects.
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
