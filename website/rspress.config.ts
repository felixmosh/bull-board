import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoDistDir = resolve(__dirname, "demo/dist");

function copyDemoPlugin() {
  return {
    name: "copy-demo",
    afterBuild(siteConfig: { outDir: string }) {
      const dest = resolve(siteConfig.outDir, "demo");
      if (existsSync(demoDistDir)) {
        if (existsSync(dest)) rmSync(dest, { recursive: true });
        cpSync(demoDistDir, dest, { recursive: true });
        // oxlint-disable-next-line no-console
        console.log(`[docs] Copied demo into ${dest}`);
      } else {
        console.warn(
          `[docs] Skipping demo: ${demoDistDir} does not exist. Run \`yarn workspace @bull-board/demo build\` first.`,
        );
      }
    },
  };
}

export default defineConfig({
  root: "docs",
  title: "Bull-Board",
  logoText: "Bull-Board",
  logo: "/logo.svg",
  description: "Dashboard for Bull and BullMQ job queues.",
  base: "/bull-board/",
  icon: "/favicon.ico",
  outDir: "doc_build",
  route: {
    cleanUrls: true,
  },
  llms: true,
  head: [["meta", { name: "theme-color", content: "#3c89e8" }]],
  globalStyles: resolve(__dirname, "docs/.rspress/styles/global.css"),
  plugins: [copyDemoPlugin()],
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "Guide", link: "/guide/introduction" },
      { text: "Recipes", link: "/recipes/" },
      { text: "Adapters", link: "/adapters/" },
      { text: "Reference", link: "/configuration/ui-config" },
    ],
    sidebar: {
      "/": [
        {
          text: "Getting Started",
          items: [
            { text: "Introduction", link: "/guide/introduction" },
            { text: "Installation", link: "/guide/getting-started" },
            { text: "Your first dashboard", link: "/guide/your-first-dashboard" },
          ],
        },
        {
          text: "Recipes",
          items: [
            { text: "Overview", link: "/recipes/" },
            { text: "Add basic auth", link: "/recipes/basic-auth" },
            { text: "CSRF protection", link: "/recipes/csrf-protection" },
            { text: "Read-only mode", link: "/recipes/read-only-mode" },
            { text: "Visibility guard", link: "/recipes/visibility-guard" },
            { text: "Formatters", link: "/recipes/formatters" },
            { text: "Multiple dashboards", link: "/recipes/multiple-dashboards" },
            { text: "Per-tenant visibility", link: "/recipes/per-tenant-visibility" },
            { text: "Job logs and flows", link: "/recipes/job-logs-and-flows" },
            { text: "Polling interval", link: "/recipes/change-polling-interval" },
            { text: "External job URLs", link: "/recipes/external-job-url" },
            { text: "Global concurrency", link: "/recipes/global-concurrency" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "UIConfig", link: "/configuration/ui-config" },
            { text: "Production checklist", link: "/configuration/production-checklist" },
          ],
        },
        {
          text: "Adapters",
          collapsed: true,
          items: [
            { text: "Overview", link: "/adapters/" },
            { text: "Express", link: "/adapters/express" },
            { text: "Fastify", link: "/adapters/fastify" },
            { text: "Koa", link: "/adapters/koa" },
            { text: "Hapi", link: "/adapters/hapi" },
            { text: "NestJS", link: "/adapters/nestjs" },
            { text: "Hono", link: "/adapters/hono" },
            { text: "H3", link: "/adapters/h3" },
            { text: "Elysia", link: "/adapters/elysia" },
            { text: "Bun", link: "/adapters/bun" },
          ],
        },
      ],
    },
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/felixmosh/bull-board",
      },
    ],
    editLink: {
      docRepoBaseUrl: "https://github.com/felixmosh/bull-board/edit/master/website/docs",
    },
    footer: {
      message: "Released under the MIT License.",
    },
  },
});
