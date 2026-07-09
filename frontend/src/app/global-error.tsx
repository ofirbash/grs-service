"use client";

/**
 * Global error boundary for the App Router.
 *
 * Next.js auto-mounts this whenever a client-side render throws. Without
 * it the user gets the default "Application error: a client-side
 * exception has occurred" page — which conveys zero context and looks
 * broken.
 *
 * On modern browsers we show a friendly "something went wrong, reload"
 * card. On very old browsers (e.g. iPad Mini 2 / iOS 12) we additionally
 * hint that the device may be too old IF the error message mentions a
 * specific feature the polyfill bundle didn't cover.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort console log so debugging via remote Web Inspector on
    // an old iPad still surfaces the underlying error.
    // eslint-disable-next-line no-console
    console.error("[GlobalError]", error);
  }, [error]);

  // Heuristic: if the error mentions a recent JS API by name, the device
  // is likely too old. We surface that hint so users on ancient iPads
  // know upgrading the device (or using a newer one) is the real fix.
  const msg = error?.message || "";
  const looksTooOld =
    /\b(hasOwn|structuredClone|replaceAll|Promise\.any|Array\.prototype\.at)\b/.test(msg) ||
    /SyntaxError/i.test(msg);

  return (
    <html lang="en">
      <body className="antialiased font-sans">
        <div className="min-h-screen flex items-center justify-center bg-navy-50 px-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-navy-200 p-6 text-center">
            <h1 className="text-xl font-semibold text-navy-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-navy-600 mb-4">
              {looksTooOld
                ? "This device's browser appears to be too old to run the app. Please update iOS / use a newer device, or try a desktop browser."
                : "An unexpected error occurred while loading this page. Reloading usually fixes it."}
            </p>
            {error?.digest && (
              <p className="text-[10px] text-navy-400 mb-3 font-mono">ref: {error.digest}</p>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => reset()}
                className="px-4 py-2 bg-navy-900 text-white text-sm rounded-md hover:bg-navy-800"
                data-testid="global-error-reset"
              >
                Try again
              </button>
              <a
                href="/"
                className="px-4 py-2 border border-navy-200 text-navy-700 text-sm rounded-md hover:bg-navy-50"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
