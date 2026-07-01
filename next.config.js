/** @type {import('next').NextConfig} */
function normalizeBasePath(value) {
  const cleanValue = String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return cleanValue ? `/${cleanValue}` : "";
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
const assetPrefix = normalizeBasePath(process.env.NEXT_PUBLIC_ASSET_PREFIX);

const nextConfig = {
  output: "standalone",
  ...(basePath ? { basePath } : {}),
  ...(assetPrefix ? { assetPrefix } : {}),
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
