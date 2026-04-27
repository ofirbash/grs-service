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
  // CRITICAL: emit each route as `<route>/index.html` (e.g. `login/index.html`)
  // instead of `login.html`. Production's nginx does CRA-style static lookup
  // (`try_files $uri $uri/ /index.html`) which checks for a directory with an
  // index.html inside, NOT for `.html` extensions. Without this flag every
  // route falls back to root `/index.html` (the home page) — which then runs
  // its `window.location.replace('/login')` redirect and enters a hard reload
  // loop. With this flag, `/login` → `/login/index.html` is found directly.
  trailingSlash: true,
  images: { unoptimized: true },
  // Skip ESLint inside `next build` — we lint as a separate step locally and
  // don't want a stray warning to break a deploy.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
