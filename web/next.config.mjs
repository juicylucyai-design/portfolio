const isDev = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = isDev
  ? {
      // `npm run dev:web` on :3001 forwards API calls to the server on :3000.
      async rewrites() {
        return [{ source: '/api/:path*', destination: 'http://localhost:3000/api/:path*' }];
      },
    }
  : {
      // Production: plain HTML/JS files in web/out, served by the NestJS server behind the sign-in gate.
      output: 'export',
      images: { unoptimized: true },
    };

export default nextConfig;
