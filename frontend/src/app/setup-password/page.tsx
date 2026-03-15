"use client";

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Loader2, Lock, CheckCircle2, AlertCircle } from 'lucide-react';

function SetupPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { setAuth } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-950 p-4">
        <Card className="w-full max-w-md border-navy-200 shadow-2xl">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold text-navy-800 mb-2">Invalid Link</h3>
            <p className="text-navy-600">This setup link is invalid or missing. Please contact your administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.setupPassword(token, password);
      if (response.access_token) {
        setSuccess(true);
        setAuth(response.access_token, response.user);
        setTimeout(() => router.push('/dashboard'), 1500);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to set up password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-950 p-4">
        <Card className="w-full max-w-md border-navy-200 shadow-2xl">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold text-navy-800 mb-2">Account Set Up Successfully!</h3>
            <p className="text-navy-600">Redirecting to your dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl" data-testid="setup-password-card">
        <CardContent className="pt-8 pb-8 px-8 space-y-4">
          <div className="text-center space-y-3">
            <Image
              src="/logos/bashari-full.png"
              alt="Bashari"
              width={160}
              height={70}
              className="mx-auto"
            />
            <p className="text-xs text-navy-400 tracking-widest uppercase">Lab-Direct</p>
            <p className="text-sm text-navy-600">Set up your account password</p>
          </div>

          <div className="bg-navy-50 border border-navy-200 rounded-md p-3 flex items-start gap-2">
            <Lock className="h-4 w-4 text-navy-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-navy-600">
              Choose a secure password for your account. You&apos;ll use this to sign in to view your jobs and stones.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="border-navy-200"
                data-testid="setup-password-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="border-navy-200"
                data-testid="setup-confirm-password-input"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700" data-testid="setup-error">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !password || !confirmPassword}
              className="w-full bg-navy-900 hover:bg-navy-800 h-10"
              data-testid="setup-submit-button"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                'Set Password & Sign In'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-navy-950">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    }>
      <SetupPasswordForm />
    </Suspense>
  );
}
