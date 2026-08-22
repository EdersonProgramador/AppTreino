const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: {
    domains: ['lh3.googleusercontent.com', `${process.env.NEXT_PUBLIC_IMAGE_DOMAIN}`],
  },
  webpack: (config) => {
    config.resolve.alias["@"] = path.join(__dirname, "src");
    config.resolve.alias["next/link"] = path.join(__dirname, "src/lib/legacy-link.tsx");
    return config;
  },
}

module.exports = nextConfig
