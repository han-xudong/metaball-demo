import type { NextConfig } from 'next'

const isCI = process.env.GITHUB_ACTIONS === 'true'
const repo = 'metaball-demo'

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isCI ? `/${repo}` : undefined,
  assetPrefix: isCI ? `/${repo}/` : undefined,
  trailingSlash: true,
}

export default nextConfig
