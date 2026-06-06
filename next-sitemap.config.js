/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://jaidynreiman.net',
  generateRobotsTxt: true,
  outDir: './out',
  robotsTxtOptions: {
    policies: [{ userAgent: '*', allow: '/' }],
  },
};
