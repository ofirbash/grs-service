"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await authApi.login(formData.email, formData.password);
      if (response.access_token) {
        setAuth(response.access_token, response.user);
        router.push('/dashboard');
      } else if (response.requires_2fa) {
        setError('2FA is required but not yet implemented in this version');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Invalid email or password');
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

          <form onSubmit={handleSubmit} className="space-y-4">
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
              />
            </div>

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
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'SIGN IN'
              )}
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
