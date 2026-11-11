// @ts-check
// Plain JS on purpose: the repo root uses TypeScript 7 and this package is not typechecked.
// The user manual. The developer docs are a separate site in dev-docs/, served at /dev-docs/.

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Questforge manual",
  tagline: "How to make point-and-click adventures with Questforge",
  // PLACEHOLDER: replace with the production domain of the Cloudflare site.
  url: "https://questforge.example.com",
  // Served under /docs/ of the Cloudflare site (the build is copied into the site's assets).
  baseUrl: "/docs/",
  // "always" builds /x/y/index.html and links to /x/y/. Workers static assets' default html
  // handling serves /x/y/ from x/y/index.html, so nested pages never fall through to the
  // site's single-page-application fallback.
  trailingSlash: true,
  onBrokenLinks: "throw",
  // `.md` is CommonMark, `.mdx` is MDX.
  markdown: {
    format: "detect",
    hooks: { onBrokenMarkdownLinks: "throw" },
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        // The manual's pages live in manual/ and are served from the site root (/docs/).
        docs: {
          path: "manual",
          routeBasePath: "/",
          sidebarPath: "./sidebars.js",
        },
        blog: false,
        theme: {},
      }),
    ],
  ],

  themeConfig: {
    navbar: {
      title: "Questforge manual",
      items: [],
    },
  },
};

module.exports = config;
