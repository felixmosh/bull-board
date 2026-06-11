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
      { text: "Queue Adapters", link: "/queue-adapters/" },
      { text: "Server Adapters", link: "/server-adapters/" },
      { text: "Recipes", link: "/recipes/" },
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
          text: "Queue Adapters",
          collapsed: true,
          items: [
            { text: "Overview", link: "/queue-adapters/" },
            { text: "Bull", link: "/queue-adapters/bull" },
            { text: "BullMQ", link: "/queue-adapters/bullmq" },
            { text: "BullMQ Pro", link: "/queue-adapters/bullmq-pro" },
          ],
        },
        {
          text: "Server Adapters",
          collapsed: true,
          items: [
            { text: "Overview", link: "/server-adapters/" },
            { text: "Express", link: "/server-adapters/express" },
            { text: "Fastify", link: "/server-adapters/fastify" },
            { text: "Koa", link: "/server-adapters/koa" },
            { text: "Hapi", link: "/server-adapters/hapi" },
            { text: "NestJS", link: "/server-adapters/nestjs" },
            { text: "Hono", link: "/server-adapters/hono" },
            { text: "H3", link: "/server-adapters/h3" },
            { text: "Elysia", link: "/server-adapters/elysia" },
            { text: "Bun", link: "/server-adapters/bun" },
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
