/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      '@react-pdf/renderer',
      // Neon の WebSocket（ws）をバンドルすると bufferUtil.mask エラーになるためサーバでは未バンドルで解決
      '@prisma/client',
      '@prisma/adapter-neon',
      '@neondatabase/serverless',
      'ws',
      'isomorphic-ws',
    ],
  },
  /** dev / RSC バンドルが ws を束ねると bufferUtil.mask が壊れる。ハイフン付きパッケージ名は文字列push不可 */
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({ ws: 'commonjs ws' })
    }
    return config
  },
}

module.exports = nextConfig

