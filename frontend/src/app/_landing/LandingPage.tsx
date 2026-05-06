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
} from 'lucide-react';
import { accessRequestApi } from '@/lib/api';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

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
] as const;

export default function LandingPage({ onLoginClick }: LandingPageProps) {
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <div className="min-h-screen bg-stone-50 text-navy-900 selection:bg-amber-200/60">
      {/* Header bar */}
      <header className="border-b border-navy-100/80 bg-white/95 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logos/bashari-full.png"
              alt="Bashari"
              width={140}
              height={42}
              priority
            />
            <span className="hidden sm:inline-block h-6 w-px bg-navy-200" />
            <span className="hidden sm:inline-block text-[11px] tracking-[0.3em] uppercase text-navy-500">
              Lab&nbsp;Direct
            </span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              onClick={onLoginClick}
              className="text-navy-700 hover:text-navy-900 hover:bg-navy-50 font-medium text-sm h-9 px-4"
              data-testid="landing-login-button"
            >
              Login
            </Button>
            <Button
              onClick={() => setRequestOpen(true)}
              className="bg-navy-900 hover:bg-navy-800 text-white font-medium text-sm h-9 px-4 sm:px-5"
              data-testid="landing-request-access-button"
            >
              Request Access
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Decorative background — subtle vertical accent line + radial */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_-10%,rgba(180,83,9,0.07),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-12 top-0 hidden lg:block h-full w-px bg-gradient-to-b from-transparent via-amber-300/40 to-transparent"
        />

        <div className="relative mx-auto max-w-7xl px-6 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-[11px] tracking-[0.25em] uppercase text-navy-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Bashari × GRS Lab Hong Kong
            </div>
            <h1
              className="font-serif tracking-tight text-navy-900 text-4xl sm:text-5xl lg:text-6xl leading-[1.05]"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
              data-testid="landing-hero-headline"
            >
              <span className="font-bold">BASHARI</span>
              <span className="text-amber-700"> — </span>
              Your Local Gateway to <em className="italic">GRS Lab Services</em>.
            </h1>
            <p className="max-w-2xl text-base sm:text-lg text-navy-600 leading-relaxed">
              Skip the logistical burden. Secure, transparent, and direct shipping for your
              gemstones to GRS lab in HK — managed locally in Israel by Bashari.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={() => setRequestOpen(true)}
                size="lg"
                className="bg-navy-900 hover:bg-navy-800 text-white h-12 px-7 text-sm tracking-wide"
                data-testid="hero-request-access-button"
              >
                Request Access
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                onClick={onLoginClick}
                variant="outline"
                size="lg"
                className="border-navy-300 text-navy-800 hover:bg-navy-50 h-12 px-7 text-sm tracking-wide"
                data-testid="hero-login-button"
              >
                Login
              </Button>
            </div>
            <div className="flex items-center gap-2 pt-3 text-xs text-navy-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Insured shipments · Customs handled · Direct line to GRS HK
            </div>
          </div>

          {/* Editorial visual block — replaces stock photo with a pure-CSS
              composition that screams "lab + precision" without an external dep. */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md aspect-[4/5]">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-navy-900 via-navy-950 to-black shadow-2xl shadow-navy-900/30 overflow-hidden">
                {/* gem facet illustration — pure CSS conic gradient */}
                <div
                  className="absolute inset-0 opacity-60"
                  style={{
                    background:
                      'conic-gradient(from 210deg at 50% 45%, #1e3a8a, #0c4a6e, #155e75, #134e4a, #0f766e, #1e3a8a)',
                    filter: 'blur(60px)',
                  }}
                />
                <div className="absolute top-8 left-8 right-8 flex items-center justify-between text-amber-200/80 text-[10px] tracking-[0.4em] uppercase">
                  <span>Report · 25-040820</span>
                  <span>GRS · HK</span>
                </div>
                <div className="absolute bottom-10 left-8 right-8 space-y-2 text-white">
                  <div className="text-[10px] tracking-[0.35em] uppercase text-amber-200/80">
                    Verbal Result
                  </div>
                  <div
                    className="text-2xl"
                    style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                  >
                    <em>Pigeon Blood</em> — Mozambique
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-3">
                    {[
                      ['Stone', 'Ruby'],
                      ['Carat', '3.42'],
                      ['Treatment', 'No Heat'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div className="text-[10px] tracking-widest uppercase text-white/50">
                          {k}
                        </div>
                        <div className="text-sm font-medium">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* small floating accent card */}
              <div className="absolute -bottom-6 -left-6 hidden md:block bg-white border border-navy-100 rounded-xl p-4 shadow-xl shadow-navy-900/10 w-44">
                <div className="text-[10px] tracking-widest uppercase text-navy-400">
                  Status
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-medium text-navy-800">Cert. Issued</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-navy-100 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl mb-14">
            <div className="text-[11px] tracking-[0.3em] uppercase text-amber-700 font-medium">
              Why Bashari
            </div>
            <h2
              className="mt-3 text-3xl sm:text-4xl text-navy-900 leading-tight"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            >
              A direct line between your stones and GRS Hong Kong.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-navy-100">
            {FEATURES.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="bg-white p-7 lg:p-9 group hover:bg-stone-50 transition-colors"
                data-testid={`feature-${title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="flex items-start gap-5">
                  <div className="shrink-0 h-11 w-11 rounded-lg bg-navy-900 text-amber-200 flex items-center justify-center group-hover:bg-amber-700 group-hover:text-white transition-colors">
                    <Icon className="h-5 w-5" strokeWidth={1.6} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-navy-900 text-lg leading-tight">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm text-navy-600 leading-relaxed">
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
      <section className="bg-navy-950 text-white">
        <div className="mx-auto max-w-7xl px-6 py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h3
              className="text-2xl sm:text-3xl"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            >
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
            className="bg-amber-500 hover:bg-amber-400 text-navy-950 h-12 px-8 font-semibold tracking-wide shrink-0"
            data-testid="footer-cta-request-access"
          >
            Request Access
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <footer className="bg-navy-950 border-t border-white/10 text-white/50">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div>© {new Date().getFullYear()} Bashari Lab-Direct. All rights reserved.</div>
          <div className="tracking-widest uppercase">Bashari × GRS</div>
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            className="text-2xl text-navy-900"
          >
            {step === 'form' && 'Request Access'}
            {step === 'otp' && 'Verify your email'}
            {step === 'success' && "We've got your request"}
          </DialogTitle>
          <DialogDescription className="text-navy-500">
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
                <Label htmlFor="ra-name" className="text-xs text-navy-600">Full name *</Label>
                <Input
                  id="ra-name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                  data-testid="ra-fullname-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ra-company" className="text-xs text-navy-600">Company *</Label>
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
              <Label htmlFor="ra-email" className="text-xs text-navy-600">Email *</Label>
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
              <Label htmlFor="ra-phone" className="text-xs text-navy-600">Phone *</Label>
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
              <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700" data-testid="ra-error">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-navy-900 hover:bg-navy-800 min-w-32"
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
              <Label htmlFor="ra-otp" className="text-xs text-navy-600">6-digit code</Label>
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
              <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700" data-testid="ra-otp-error">
                {error}
              </div>
            )}

            <div className="flex justify-between pt-1">
              <Button type="button" variant="ghost" onClick={() => { setStep('form'); setError(''); }}>
                Back
              </Button>
              <Button
                type="submit"
                disabled={submitting || otp.length !== 6}
                className="bg-navy-900 hover:bg-navy-800 min-w-32"
                data-testid="ra-verify-button"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Request'}
              </Button>
            </div>
          </form>
        )}

        {step === 'success' && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <p className="text-sm text-navy-600 max-w-sm mx-auto">
              Thanks <strong>{form.full_name.split(' ')[0]}</strong> — your request is in our
              queue. We&apos;ll email <strong>{form.email}</strong> as soon as it is approved.
            </p>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-navy-900 hover:bg-navy-800"
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
