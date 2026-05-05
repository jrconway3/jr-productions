/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'export',
	images: {
		unoptimized: true,
	},
	async headers() {
		return [
			{
				source: '/:path*',
				headers: [
					{
						key: 'Strict-Transport-Security',
						value: 'max-age=31536000; includeSubDomains; preload',
					},
					{
						key: 'X-Content-Type-Options',
						value: 'nosniff',
					},
					{
						key: 'X-Frame-Options',
						value: 'SAMEORIGIN',
					},
					{
						key: 'Referrer-Policy',
						value: 'strict-origin-when-cross-origin',
					},
					{
						key: 'Permissions-Policy',
						value: 'camera=(), microphone=(), geolocation=()',
					},
					{
						key: 'Content-Security-Policy',
						value: [
							"default-src 'self'",
							"img-src 'self' https: data:",
							"font-src 'self' data:",
							"script-src 'self'",
							"style-src 'self' 'unsafe-inline'",
							"connect-src 'self'",
							"frame-ancestors 'self'",
							"base-uri 'self'",
							"form-action 'self'",
							'upgrade-insecure-requests',
						].join('; '),
					},
				],
			},
		];
	},
	async redirects() {
		if (process.env.NODE_ENV !== 'production') {
			return [];
		}

		return [
			{
				source: '/:path*',
				has: [
					{
						type: 'header',
						key: 'x-forwarded-proto',
						value: 'http',
					},
				],
				destination: 'https://jaidynreiman.net/:path*',
				permanent: true,
			},
		];
	},
};

export default nextConfig;
