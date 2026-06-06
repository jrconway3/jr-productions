/** @type {import('next-sitemap').IConfig} */
const config = {
  siteUrl: 'https://jaidynreiman.net',
  generateRobotsTxt: true,
  outDir: './out',
  robotsTxtOptions: {
    policies: [{ userAgent: '*', allow: '/' }],
  },
};

export default config;
