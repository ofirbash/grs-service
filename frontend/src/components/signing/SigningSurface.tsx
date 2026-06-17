"use client";

/**
 * <SigningSurface> — the actual drawable canvas for the signing-pad page.
 *
 * Wraps `react-signature-canvas` to fix three production bugs:
 *
 * 1. **Ref forwarding through Next.js dynamic().** `next/dynamic` does NOT
 *    forward refs to the loaded component, so the page's ref ended up
 *    null and `toDataURL()` returned undefined → "Could not read
 *    signature canvas" error on submit. This file is a `"use client"`
 *    boundary that imports the lib directly + forwardRef's the
 *    underlying class instance, so the parent gets a real ref.
 *
 * 2. **"Only the top of the canvas is writable" on mobile.** The lib
 *    leaves the canvas at its default 300×150 pixel resolution unless
 *    width/height are explicitly set; CSS then stretches it to fill the
 *    container, but pointer events outside (0..150) pixel-space
 *    silently fail. We use a `ResizeObserver` to set the canvas's
 *    pixel width/height to its rendered size × devicePixelRatio, and
 *    call the lib's internal `_resizeCanvas()` so the SignaturePad
 *    re-binds to the new dimensions without clearing the stroke in
 *    progress.
 *
 * 3. **Page scrolls while signing on iOS/Android.** Without
 *    `touch-action: none` the browser treats the drag as a pan and
 *    scrolls the page. We set it on the canvas + the surrounding
 *    container; the parent page also locks the body with
 *    `overscroll-behavior: contain` and a fixed viewport height.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import SignatureCanvasImpl from 'react-signature-canvas';
import type { SignatureCanvasProps } from 'react-signature-canvas';

export interface SigningSurfaceHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: (type?: string) => string;
}

interface Props extends Pick<SignatureCanvasProps, 'penColor' | 'backgroundColor'> {
  /** Optional onBegin callback (e.g. to clear any "please sign" error
   *  the moment the user starts the first stroke). */
  onBegin?: () => void;
}

export const SigningSurface = forwardRef<SigningSurfaceHandle, Props>(
  function SigningSurface({ penColor = '#0a1a3f', backgroundColor = 'rgba(255,255,255,1)', onBegin }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const padRef = useRef<SignatureCanvasImpl | null>(null);

    // Expose only the minimal surface — keeps callers stable across
    // future lib upgrades.
    useImperativeHandle(ref, () => ({
      clear: () => padRef.current?.clear(),
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataURL: (type = 'image/png') => padRef.current?.toDataURL(type) ?? '',
    }), []);

    // Keep the canvas pixel resolution in sync with the rendered CSS
    // size × devicePixelRatio. Without this the drawable region is
    // permanently 300×150 px while the visible canvas is e.g. 400×800,
    // so touches in the bottom 4/5 of the screen miss.
    useEffect(() => {
      const container = containerRef.current;
      const pad = padRef.current;
      if (!container || !pad) return;

      const resize = () => {
        const canvas = pad.getCanvas();
        const rect = container.getBoundingClientRect();
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        // Avoid pointlessly re-sizing (skips Safari layout thrash).
        const w = Math.round(rect.width * ratio);
        const h = Math.round(rect.height * ratio);
        if (canvas.width === w && canvas.height === h) return;

        // Preserve the current stroke data (if any) — lib's clearOnResize
        // would otherwise wipe a half-drawn signature when the URL bar
        // hides on iOS.
        const data = pad.toData();
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.scale(ratio, ratio);
        // Re-feed strokes; fromData() is the lib's public restore API.
        if (data && data.length) {
          pad.fromData(data);
        } else {
          pad.clear();
        }
      };

      // Initial size after mount (the lib mounts with width/height=300/150).
      resize();

      const ro = new ResizeObserver(resize);
      ro.observe(container);
      // visualViewport handles iOS URL-bar collapse + keyboard scenarios
      // where the container's clientRect changes without a DOM resize.
      window.visualViewport?.addEventListener('resize', resize);
      return () => {
        ro.disconnect();
        window.visualViewport?.removeEventListener('resize', resize);
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className="w-full h-full relative"
        style={{
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          overscrollBehavior: 'contain',
        }}
      >
        <SignatureCanvasImpl
          ref={(r) => {
            padRef.current = r;
          }}
          penColor={penColor}
          backgroundColor={backgroundColor}
          // We manage resize ourselves — disable the lib's clearOnResize
          // because it would wipe the stroke on every iOS URL-bar
          // collapse.
          clearOnResize={false}
          onBegin={onBegin}
          canvasProps={{
            className: 'block w-full h-full',
            style: { touchAction: 'none', display: 'block' },
            // data-testid is non-standard on CanvasHTMLAttributes; cast.
            ...({ 'data-testid': 'pad-canvas' } as Record<string, string>),
          }}
        />
      </div>
    );
  },
);
