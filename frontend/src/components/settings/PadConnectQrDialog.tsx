"use client";

/**
 * <PadConnectQrDialog> — Settings → Signing Pad Accounts.
 *
 * Admin clicks "Connect" on a pad row → this modal pops a QR code the
 * admin shows to a phone or tablet. The QR encodes the production login
 * URL with `?email=<pad.email>` pre-filled, so the device just needs the
 * password typed in. Once logged in, the auth flow auto-routes
 * signing_pad accounts to `/dashboard/signing-pad`, so the pad is "live"
 * on the new device with two scans + one password.
 *
 * Why not a magic-link? Because the QR could be photographed off the
 * admin's screen, and pad sessions live for days. Requiring the password
 * on first login keeps the threat surface tiny while still saving the
 * admin from typing a 30-char URL on a glass keyboard.
 */

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, CheckCircle2, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface PadLike {
  id: string;
  email: string;
  full_name: string;
}

interface Props {
  pad: PadLike | null;
  onClose: () => void;
}

export function PadConnectQrDialog({ pad, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  // Build the full login URL. We deliberately use `window.location.origin`
  // (the URL the *admin* is currently viewing) instead of a hardcoded
  // production domain, so QRs in the preview env scan into the preview
  // env and QRs in prod scan into prod. The pad device will then send
  // its API calls to the same origin via the existing /api proxy.
  const loginUrl = useMemo(() => {
    if (!pad || typeof window === "undefined") return "";
    const origin = window.location.origin;
    const qs = new URLSearchParams({ email: pad.email }).toString();
    return `${origin}/login?${qs}`;
  }, [pad]);

  const handleCopy = async () => {
    if (!loginUrl) return;
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      // Reset the indicator after 2s — short enough that the admin won't
      // get confused about whether a *second* copy happened.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail on http:// origins or with insufficient
      // permissions. Fall back to a select-all prompt the admin can copy
      // manually.
      const ok = window.prompt("Copy this URL:", loginUrl);
      if (ok !== null) setCopied(true);
    }
  };

  return (
    <Dialog open={!!pad} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="pad-connect-qr-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl text-navy-900 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-navy-600" />
            Connect this pad
          </DialogTitle>
          <DialogDescription>
            Scan the QR with the pad device. It opens the login page with{" "}
            <strong>{pad?.email}</strong> pre-filled — you only need to enter the
            password.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div
            className="p-4 bg-white border-2 border-navy-200 rounded-lg"
            data-testid="pad-connect-qr"
          >
            {loginUrl && (
              <QRCodeSVG
                value={loginUrl}
                size={208}
                level="M"
                includeMargin={false}
                fgColor="#0a1a3f"
              />
            )}
          </div>

          <div className="w-full">
            <div className="text-xs uppercase tracking-wider text-navy-500 font-semibold mb-1">
              Or open this URL manually
            </div>
            <div className="flex gap-1.5">
              <code
                className="flex-1 text-xs bg-navy-50 border border-navy-200 rounded px-2 py-1.5 truncate font-mono text-navy-700"
                title={loginUrl}
                data-testid="pad-connect-url"
              >
                {loginUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="shrink-0"
                data-testid="pad-connect-copy"
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="w-full text-xs text-navy-500 bg-navy-50/60 border border-navy-100 rounded p-2.5 leading-relaxed">
            <strong className="text-navy-700">Tip:</strong> after the pad device is
            logged in, enable <em>Guided Access</em> (iPad) or <em>Screen Pinning</em>{" "}
            (Android) to lock it to the signing-pad page.
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose} data-testid="pad-connect-close">
            <X className="h-4 w-4 mr-1.5" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
