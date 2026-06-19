/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Rewrites have been moved to middleware.ts to allow dynamic runtime environment variables
  // such as process.env.BACKEND_URL in Docker and Google Cloud Run.
};

export default nextConfig;
