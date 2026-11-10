// @ts-check
// Plain JS on purpose: the repo root uses TypeScript 7 and this package is not typechecked.

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Questforge docs",
  tagline: "Engineering standards and the Questforge project specs",
  // PLACEHOLDER: replace with the production domain of the Cloudflare site.
  url: "https://questforge.example.com",
  // Served under /docs/ of the Cloudflare site (the build is copied into the site's assets).
  baseUrl: "/docs/",
  // "always" builds /x/y/index.html and links to /x/y/. Workers static assets' default html
  // handling serves /x/y/ from x/y/index.html, so nested pages never fall through to the
  // site's single-page-application fallback.
  trailingSlash: true,
  onBrokenLinks: "throw",
  // `.md` is CommonMark (the project specs contain `<`, `{` and tables); `.mdx` is MDX.
  markdown: {
    format: "detect",
    hooks: { onBrokenMarkdownLinks: "throw" },
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: false,
        blog: false,
        pages: {},
        theme: {},
      }),
    ],
  ],

  plugins: [
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "standards",
        path: "standards",
        routeBasePath: "standards",
        sidebarPath: "./sidebars.js",
      },
    ],
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "project",
        path: "project",
        routeBasePath: "project",
        sidebarPath: "./sidebars.js",
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: "Questforge docs",
      items: [
        { to: "/standards/", label: "Standards", position: "left", activeBaseRegex: "/standards/" },
        { to: "/project/", label: "Project", position: "left", activeBaseRegex: "/project/" },
      ],
    },
  },
};

module.exports = config;
