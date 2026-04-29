"use client";

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    website: '', // honeypot — must stay empty
  });
  const [turnstileToken, setTurnstileToken] = useState('');
  const [step, setStep] = useState<'login' | '2fa'>('login');
  const [totpCode, setTotpCode] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Please complete the bot verification below.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.login(formData.email, formData.password, {
        turnstile_token: turnstileToken || undefined,
        website: formData.website, // honeypot
      });
      if (response.requires_2fa) {
        setStep('2fa');
      } else if (response.access_token) {
        setAuth(response.access_token, response.user);
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string }; status?: number } };
      setError(e.response?.data?.detail || 'Invalid email or password');
      // Reset Turnstile so the user can retry (tokens are single-use).
      turnstileRef.current?.reset();
      setTurnstileToken('');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      // Note: no turnstile_token sent on the 2FA hop. The token from the
      // password step is single-use and already consumed; the backend skips
      // Turnstile when a totp_code is present. Honeypot + rate-limit still
      // apply, and a wrong TOTP code returns the user to step 1.
      const response = await authApi.login(formData.email, formData.password, {
        website: formData.website,
        totp_code: totpCode.trim(),
      });
      if (response.access_token) {
        setAuth(response.access_token, response.user);
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Invalid 2FA code');
      // Allow another TOTP attempt without forcing a full restart. We only
      // bounce back to step 1 if the rate limit kicks in (HTTP 429).
      if ((e.response as { status?: number } | undefined)?.status === 429) {
        turnstileRef.current?.reset();
        setTurnstileToken('');
        setStep('login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await authApi.forgotPassword(forgotEmail);
      setForgotSent(true);
    } catch {
      setForgotSent(true); // Always show success to prevent enumeration
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 p-4">
      <Card className="w-full max-w-sm border-0 shadow-2xl" data-testid="login-card">
        <CardContent className="pt-8 pb-8 px-8 space-y-6">
          <div className="text-center space-y-4">
            <Image
              src="/logos/bashari-full.png"
              alt="Bashari"
              width={180}
              height={80}
              className="mx-auto"
              priority
            />
            <p className="text-xs text-navy-400 tracking-widest uppercase">Lab-Direct</p>
          </div>

          {step === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-navy-500 uppercase tracking-wider">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="border-navy-200 h-10"
                  data-testid="login-email-input"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs text-navy-500 uppercase tracking-wider">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="border-navy-200 h-10"
                  data-testid="login-password-input"
                  autoComplete="current-password"
                />
              </div>

              {/* Honeypot — visually hidden, not tab-reachable. Bots fill it; real users skip it. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '-9999px',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                }}
              >
                <label>
                  Website
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </label>
              </div>

              {TURNSTILE_SITE_KEY && (
                <div className="flex justify-center" data-testid="turnstile-widget">
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
                <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700" data-testid="login-error">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-navy-900 hover:bg-navy-800 h-10 text-sm tracking-wide"
                data-testid="login-submit-button"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'SIGN IN'}
              </Button>

              <button
                type="button"
                onClick={() => setForgotMode(true)}
                className="w-full text-xs text-navy-400 hover:text-navy-600 transition-colors"
                data-testid="forgot-password-link"
              >
                Forgot your password?
              </button>
            </form>
          ) : (
            <form onSubmit={handle2faSubmit} className="space-y-4" data-testid="login-2fa-form">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="h-10 w-10 rounded-full bg-navy-100 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-navy-700" />
                </div>
                <h3 className="font-semibold text-navy-900 text-sm">Two-factor authentication</h3>
                <p className="text-xs text-navy-500">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                className="border-navy-200 h-12 text-center text-xl tracking-[0.5em] font-mono"
                data-testid="login-totp-input"
                autoFocus
              />

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700" data-testid="login-2fa-error">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading || totpCode.length !== 6}
                className="w-full bg-navy-900 hover:bg-navy-800 h-10 text-sm tracking-wide"
                data-testid="login-2fa-submit"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'VERIFY'}
              </Button>
              <button
                type="button"
                onClick={() => { setStep('login'); setTotpCode(''); setError(''); }}
                className="w-full text-xs text-navy-400 hover:text-navy-600"
              >
                Back to sign in
              </button>
            </form>
          )}

          {/* Forgot Password Modal */}
          {forgotMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <Card className="w-full max-w-sm border-0 shadow-2xl">
                <CardContent className="pt-6 pb-6 px-6 space-y-4">
                  {forgotSent ? (
                    <div className="text-center space-y-3">
                      <div className="h-10 w-10 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 text-emerald-600" style={{ animation: 'none' }} />
                      </div>
                      <h3 className="font-semibold text-navy-900">Check your email</h3>
                      <p className="text-sm text-navy-500">
                        If an account exists with that email, we&apos;ve sent a password reset link.
                      </p>
                      <Button
                        onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(''); }}
                        className="w-full bg-navy-900 hover:bg-navy-800"
                        data-testid="forgot-back-to-login"
                      >
                        Back to Login
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div className="text-center space-y-1">
                        <h3 className="font-semibold text-navy-900">Reset Password</h3>
                        <p className="text-xs text-navy-500">Enter your email and we&apos;ll send a reset link</p>
                      </div>
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        className="border-navy-200 h-10"
                        data-testid="forgot-email-input"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => { setForgotMode(false); setForgotEmail(''); }}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={forgotLoading}
                          className="flex-1 bg-navy-900 hover:bg-navy-800"
                          data-testid="forgot-submit-button"
                        >
                          {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Link'}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
