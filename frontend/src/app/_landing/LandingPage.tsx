"use client";

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Truck,
  UserCheck,
  Smartphone,
  FileText,
  TrendingDown,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { accessRequestApi } from '@/lib/api';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

// Brand red — close to the GRS reference. Tailwind doesn't ship this exact
// shade so we inline it via style props for the few places we need it.
const BRAND_RED = '#E60012';
const BRAND_RED_DARK = '#B8000E';

interface LandingPageProps {
  onLoginClick: () => void;
}

const FEATURES = [
  {
    Icon: Truck,
    title: 'End-to-End Logistics',
    body:
      "We handle the full cycle: insured shipping back and forth and customs clearance.",
  },
  {
    Icon: UserCheck,
    title: 'Local Representative',
    body:
      'Human support right here in Israel. A local partner to talk to for any issue or special request.',
  },
  {
    Icon: Smartphone,
    title: 'Instant Digital Results',
    body:
      'Get your grading results the moment they are ready, delivered directly to your phone or dashboard.',
  },
  {
    Icon: FileText,
    title: 'Certificate Scans',
    body:
      'Access scans of your certificates instantly. View and share them with your clients before the physical certificates return.',
  },
  {
    Icon: TrendingDown,
    title: 'Volume-Based Pricing',
    body:
      'Benefit from our tiered discount model — the more you send, the more you save.',
  },
  {
    Icon: CreditCard,
    title: 'Online Payments',
    body:
      'Quick and secure payment options via Credit Card or BIT.',
  },
] as const;

export default function LandingPage({ onLoginClick }: LandingPageProps) {
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-black antialiased font-sans selection:bg-black selection:text-white">
      {/* Top red brand bar */}
      <header
        className="text-white sticky top-0 z-30 border-b-2 border-black/20"
        style={{ backgroundColor: BRAND_RED }}
      >
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center">
            <Image
              src="/logos/labdirect-white.png"
              alt="Bashari Lab-Direct"
              width={800}
              height={116}
              priority
              className="h-8 sm:h-10 w-auto"
            />
          </div>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              onClick={onLoginClick}
              className="text-white hover:text-white hover:bg-white/15 font-semibold text-sm h-9 px-4"
              data-testid="landing-login-button"
            >
              Login
            </Button>
            <Button
              onClick={() => setRequestOpen(true)}
              className="bg-white hover:bg-neutral-100 text-black font-semibold text-sm h-9 px-4 sm:px-5"
              data-testid="landing-request-access-button"
            >
              Request Access
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div className="relative mx-auto max-w-7xl px-6 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-7">
            <div
              className="inline-flex items-center gap-2 border border-black/15 bg-white px-3 py-1 text-[11px] tracking-[0.25em] uppercase text-black font-semibold"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: BRAND_RED }}
              />
              BASHARI × GRS
            </div>
            <h1
              className="font-sans tracking-tight text-black text-4xl sm:text-5xl lg:text-6xl leading-[1.05] font-bold"
              data-testid="landing-hero-headline"
            >
              <span style={{ color: BRAND_RED }}>BASHARI</span>
              <span className="text-black"> — Your Local </span>
              Gateway to GRS Lab Services.
            </h1>
            <p className="max-w-2xl text-base sm:text-lg text-neutral-700 leading-relaxed">
              Skip the logistical burden. Secure, transparent, and direct shipping for your
              gemstones to GRS lab in HK — managed locally in Israel by Bashari.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={() => setRequestOpen(true)}
                size="lg"
                className="text-white h-12 px-7 text-sm tracking-wide font-semibold"
                style={{ backgroundColor: BRAND_RED }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND_RED_DARK)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND_RED)}
                data-testid="hero-request-access-button"
              >
                Request Access
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                onClick={onLoginClick}
                variant="outline"
                size="lg"
                className="border-2 border-black text-black hover:bg-black hover:text-white h-12 px-7 text-sm tracking-wide font-semibold"
                data-testid="hero-login-button"
              >
                Login
              </Button>
            </div>
            <div className="flex items-center gap-2 pt-3 text-xs text-neutral-600">
              <ShieldCheck className="h-4 w-4 text-black" />
              Insured shipments · Customs handled · Direct line to GRS HK
            </div>
          </div>

          {/* Hero visual — actual GRS gemstone report rendered from the user's PDF */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md">
              {/* black drop shadow card behind the report for depth */}
              <div className="absolute -inset-2 bg-black/5 rounded-sm rotate-[1.5deg]" aria-hidden />
              <div
                className="relative bg-white border border-black/10 shadow-2xl shadow-black/15 overflow-hidden"
                style={{ aspectRatio: '1400 / 982' }}
              >
                <Image
                  src="/landing/grs-report.jpg"
                  alt="GRS Gemstone Report — Royal Blue Sapphire"
                  fill
                  sizes="(max-width: 1024px) 80vw, 480px"
                  className="object-cover"
                  priority
                />
                {/* small red accent strip */}
                <div
                  className="absolute top-0 left-0 h-1.5 w-1/3"
                  style={{ backgroundColor: BRAND_RED }}
                />
              </div>
              {/* floating accent card */}
              <div className="absolute -bottom-5 -left-5 hidden md:block bg-black text-white p-4 shadow-xl shadow-black/20 w-44">
                <div className="text-[10px] tracking-widest uppercase text-white/60">
                  Status
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full animate-pulse"
                    style={{ backgroundColor: BRAND_RED }}
                  />
                  <span className="text-sm font-semibold">Cert. Issued</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl mb-14">
            <div
              className="text-[11px] tracking-[0.3em] uppercase font-bold"
              style={{ color: BRAND_RED }}
            >
              Why Bashari
            </div>
            <h2 className="mt-3 text-3xl sm:text-4xl text-black leading-tight font-bold">
              A direct line between your stones and GRS Lab.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-black/10">
            {FEATURES.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="bg-white p-7 lg:p-9 group hover:bg-neutral-50 transition-colors"
                data-testid={`feature-${title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="flex items-start gap-5">
                  <div
                    className="shrink-0 h-11 w-11 bg-black text-white flex items-center justify-center group-hover:text-white transition-colors"
                    style={{ /* hover swap to red via inline style on group-hover would need extra logic; keeping black for simplicity */ }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-black text-lg leading-tight">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm text-neutral-700 leading-relaxed">
                      {body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-7xl px-6 py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h3 className="text-2xl sm:text-3xl font-bold">
              Ready to send your next parcel?
            </h3>
            <p className="text-white/70 mt-2 max-w-xl text-sm sm:text-base">
              Approval is manual and usually takes one business day. Once approved you
              receive a setup link to activate your account.
            </p>
          </div>
          <Button
            onClick={() => setRequestOpen(true)}
            size="lg"
            className="text-white h-12 px-8 font-semibold tracking-wide shrink-0"
            style={{ backgroundColor: BRAND_RED }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND_RED_DARK)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND_RED)}
            data-testid="footer-cta-request-access"
          >
            Request Access
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <footer className="bg-black border-t border-white/10 text-white/60">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div>© {new Date().getFullYear()} Bashari Lab-Direct. All rights reserved.</div>
          <div className="tracking-widest uppercase font-semibold">BASHARI × GRS</div>
        </div>
      </footer>

      <RequestAccessDialog open={requestOpen} onOpenChange={setRequestOpen} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Request Access dialog (multi-step: form → OTP → success)                  */
/* -------------------------------------------------------------------------- */

interface RequestAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'form' | 'otp' | 'success';

function RequestAccessDialog({ open, onOpenChange }: RequestAccessDialogProps) {
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    company: '',
    email: '',
    phone: '',
    website: '', // honeypot
  });
  const [otp, setOtp] = useState('');

  const reset = () => {
    setStep('form');
    setSubmitting(false);
    setError('');
    setOtp('');
    setForm({ full_name: '', company: '', email: '', phone: '', website: '' });
    setTurnstileToken('');
    turnstileRef.current?.reset();
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Please complete the bot verification.');
      return;
    }
    if (!form.full_name.trim() || !form.company.trim() || !form.email.trim() || !form.phone.trim()) {
      setError('Please fill in every field.');
      return;
    }
    setSubmitting(true);
    try {
      await accessRequestApi.sendOtp({
        full_name: form.full_name.trim(),
        company: form.company.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        turnstile_token: turnstileToken || undefined,
        website: form.website,
      });
      setStep('otp');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Could not send verification code. Please try again.');
      turnstileRef.current?.reset();
      setTurnstileToken('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setSubmitting(true);
    try {
      await accessRequestApi.verifyAndSubmit({
        email: form.email.trim().toLowerCase(),
        otp: otp.trim(),
        full_name: form.full_name.trim(),
        company: form.company.trim(),
        phone: form.phone.trim(),
        turnstile_token: turnstileToken || undefined,
        website: form.website,
      });
      setStep('success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Could not verify the code. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(reset, 200);
      }}
    >
      <DialogContent className="sm:max-w-lg font-sans max-h-[95vh] overflow-y-auto">
        <div className="flex flex-col items-center gap-1.5 pb-3 pt-1 border-b border-black/10 -mx-6 px-6 mb-1">
          <Image
            src="/logos/labdirect-black.png"
            alt="Bashari Lab-Direct"
            width={800}
            height={116}
            className="h-8 w-auto"
          />
        </div>
        <DialogHeader>
          <DialogTitle className="text-2xl text-black font-bold">
            {step === 'form' && 'Request Access'}
            {step === 'otp' && 'Verify your email'}
            {step === 'success' && "We've got your request"}
          </DialogTitle>
          <DialogDescription className="text-neutral-600">
            {step === 'form' &&
              'Tell us a bit about you. We review every request manually — usually within one business day.'}
            {step === 'otp' &&
              `Enter the 6-digit code sent to ${form.email}. The code is valid for 30 minutes.`}
            {step === 'success' &&
              'Once an admin approves your request you will receive an email with a setup link.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'form' && (
          <form onSubmit={handleSendOtp} className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ra-name" className="text-xs text-black font-medium">Full name *</Label>
                <Input
                  id="ra-name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                  data-testid="ra-fullname-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ra-company" className="text-xs text-black font-medium">Company *</Label>
                <Input
                  id="ra-company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  required
                  data-testid="ra-company-input"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ra-email" className="text-xs text-black font-medium">Email *</Label>
              <Input
                id="ra-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                data-testid="ra-email-input"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ra-phone" className="text-xs text-black font-medium">Phone *</Label>
              <Input
                id="ra-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
                data-testid="ra-phone-input"
              />
            </div>

            {/* Honeypot */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </label>
            </div>

            {TURNSTILE_SITE_KEY && (
              <div className="flex justify-center pt-1">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={setTurnstileToken}
                  onError={() => setTurnstileToken('')}
                  onExpire={() => setTurnstileToken('')}
                  options={{ theme: 'light', size: 'flexible' }}
                />
              </div>
            )}

            {error && (
              <div
                className="border bg-white p-2.5 text-xs"
                style={{ borderColor: BRAND_RED, color: BRAND_RED_DARK }}
                data-testid="ra-error"
              >
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-black text-black hover:bg-black hover:text-white">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="text-white min-w-32 font-semibold"
                style={{ backgroundColor: BRAND_RED }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND_RED_DARK)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND_RED)}
                data-testid="ra-send-otp-button"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Verification Code'}
              </Button>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyAndSubmit} className="space-y-4 pt-1">
            <div>
              <Label htmlFor="ra-otp" className="text-xs text-black font-medium">6-digit code</Label>
              <Input
                id="ra-otp"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="h-12 mt-1 text-center text-xl tracking-[0.5em] font-mono"
                placeholder="123456"
                data-testid="ra-otp-input"
                autoFocus
              />
            </div>

            {error && (
              <div
                className="border bg-white p-2.5 text-xs"
                style={{ borderColor: BRAND_RED, color: BRAND_RED_DARK }}
                data-testid="ra-otp-error"
              >
                {error}
              </div>
            )}

            <div className="flex justify-between pt-1">
              <Button type="button" variant="ghost" onClick={() => { setStep('form'); setError(''); }} className="text-black hover:bg-black/5">
                Back
              </Button>
              <Button
                type="submit"
                disabled={submitting || otp.length !== 6}
                className="text-white min-w-32 font-semibold"
                style={{ backgroundColor: BRAND_RED }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND_RED_DARK)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND_RED)}
                data-testid="ra-verify-button"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Request'}
              </Button>
            </div>
          </form>
        )}

        {step === 'success' && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="h-14 w-14 mx-auto text-black" />
            <p className="text-sm text-neutral-700 max-w-sm mx-auto">
              Thanks <strong>{form.full_name.split(' ')[0]}</strong> — your request is in our
              queue. We&apos;ll email <strong>{form.email}</strong> as soon as it is approved.
            </p>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-black hover:bg-neutral-800 text-white"
              data-testid="ra-success-close"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
