/** @type {import('next').NextConfig} */
// Static-export configuration so the deployment template (CRA-style: nginx
// serving a static `frontend/build/` directory) can pick up the build output.
// All pages in this app are client components and there are no Next.js
// API routes / server actions / next/headers usage, so static export is safe.
//
// Notes on directory naming:
// - `next build` with `output: 'export'` writes static files into `out/`.
// - The deployment template expects `build/` (CRA convention), so the
//   package.json `build` script renames `out/` → `build/` after the build.
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // Skip ESLint inside `next build` — we lint as a separate step locally and
  // don't want a stray warning to break a deploy.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
