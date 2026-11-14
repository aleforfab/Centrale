/** @type {import('next').NextConfig} */

// The browser must stay same-origin. Next.js proxies the API and product paths
// to the backend on the server side, so the backend address never reaches the
// client bundle and the backend can bind to loopback on the VM.
const backendUrl = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/products/:path*", destination: `${backendUrl}/products/:path*` },
    ];
  },
};

export default nextConfig;
