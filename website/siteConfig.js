/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// See https://docusaurus.io/docs/site-config for all the possible
// site configuration options.

const siteConfig = {
  title: 'bull-board', // Title for your website.
  tagline: 'Bull queue UI for inspecting jobs',
  url: 'https://vcapretz.github.io', // Your website URL
  baseUrl: '/bull-board/', // Base URL for your project */
  organizationName: 'vcapretz',
  projectName: 'bull-board',

  // For no header links in the top nav bar -> headerLinks: [],
  headerLinks: [{ doc: 'introduction', label: 'Docs' }],

  /* path to images for header/footer */
  headerIcon: 'img/logo.png',
  footerIcon: 'img/logo.png',
  favicon: 'img/logo.png',

  /* Colors for website */
  colors: {
    primaryColor: '#55735a',
    secondaryColor: '#3b503e',
  },

  // This copyright info is used in /core/Footer.js and blog RSS/Atom feeds.
  copyright: `Copyright © ${new Date().getFullYear()} Vitor Capretz`,

  highlight: {
    // Highlight.js theme to use for syntax highlighting in code blocks.
    theme: 'github',
  },

  // Add custom scripts here that would be placed in <script> tags.
  scripts: ['https://buttons.github.io/buttons.js'],

  // On page navigation for the current documentation page.
  onPageNav: 'separate',
  // No .html extensions for paths.
  cleanUrl: true,

  // For sites with a sizable amount of content, set collapsible to true.
  // Expand/collapse the links and subcategories under categories.
  // docsSideNavCollapsible: true,

  // Show documentation's last contributor's name.
  // enableUpdateBy: true,

  // Show documentation's last update time.
  // enableUpdateTime: true,

  // You may provide arbitrary config keys to be used as needed by your
  // template. For example, if you need your repo's URL...
  repoUrl: 'https://github.com/vcapretz/bull-board',
}

module.exports = siteConfig
