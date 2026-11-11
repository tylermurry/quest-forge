// @ts-check
// Plain JS on purpose: the repo root uses TypeScript 7 and this package is not typechecked.
// The user manual. The developer docs are a separate site in dev-docs/, served at /dev-docs/.

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Quest Forge manual",
  tagline: "How to make point-and-click adventures with Quest Forge",
  // PLACEHOLDER: replace with the production domain of the Cloudflare site.
  url: "https://questforge.example.com",
  // Served under /docs/ of the Cloudflare site (the build is copied into the site's assets).
  baseUrl: "/docs/",
  // "always" builds /x/y/index.html and links to /x/y/. Workers static assets' default html
  // handling serves /x/y/ from x/y/index.html, so nested pages never fall through to the
  // site's single-page-application fallback.
  trailingSlash: true,
  onBrokenLinks: "throw",
  // `.md` is CommonMark, `.mdx` is MDX. Mermaid renders ```mermaid blocks as diagrams.
  markdown: {
    format: "detect",
    mermaid: true,
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

  // Diagrams in the manual (dev-docs/project/manual-style.md).
  themes: ["@docusaurus/theme-mermaid"],
  plugins: [
    // The Mermaid theme has an optional, heavy layout package (@mermaid-js/layout-elk) we don't use. Under pnpm the
    // client bundle still tries to resolve it and fails, so tell the bundler it is empty.
    () => ({
      name: "mermaid-without-elk",
      configureWebpack: () => ({ resolve: { alias: { "@mermaid-js/layout-elk": false } } }),
    }),
  ],

  themeConfig: {
    navbar: {
      title: "Quest Forge manual",
      items: [],
    },
  },
};

module.exports = config;
