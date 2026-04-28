"use client";

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { Loader2, Lock, CheckCircle2, AlertCircle, User, Mail } from 'lucide-react';

interface SetupInfo {
  email: string;
  full_name: string;
  phone: string;
  company: string;
  address: string;
}

function SetupPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { setAuth } = useAuthStore();

  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(true);

  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadingInfo(false);
      return;
    }
    authApi
      .getSetupInfo(token)
      .then((data) => {
        setInfo(data);
        setPhone(data.phone || '');
        setCompany(data.company || '');
        setAddress(data.address || '');
      })
      .catch((err: unknown) => {
        const e = err as { response?: { data?: { detail?: string } } };
        setFetchError(
          e.response?.data?.detail ||
            'This setup link is invalid or has expired. Please contact your administrator.'
        );
      })
      .finally(() => setLoadingInfo(false));
  }, [token]);

  if (!token) {
    return (
      <LinkError message="This setup link is invalid or missing. Please contact your administrator." />
    );
  }

  if (loadingInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-950">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (fetchError) {
    return <LinkError message={fetchError} />;
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

    setIsSubmitting(true);
    try {
      const response = await authApi.setupPassword(token, password, {
        phone: phone.trim(),
        company: company.trim(),
        address: address.trim(),
      });
      if (response.access_token) {
        setSuccess(true);
        setAuth(response.access_token, response.user);
        setTimeout(() => router.push('/dashboard'), 1500);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(
        e.response?.data?.detail ||
          'Failed to set up account. The link may have expired.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-950 p-4">
        <Card className="w-full max-w-md border-navy-200 shadow-2xl">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold text-navy-800 mb-2">
              Account set up successfully!
            </h3>
            <p className="text-navy-600">Redirecting to your dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 p-4 py-10">
      <Card
        className="w-full max-w-lg border-0 shadow-2xl"
        data-testid="setup-password-card"
      >
        <CardContent className="pt-8 pb-8 px-8 space-y-5">
          <div className="text-center space-y-3">
            <Image
              src="/logos/bashari-full.png"
              alt="Bashari"
              width={160}
              height={70}
              className="mx-auto"
            />
            <p className="text-xs text-navy-400 tracking-widest uppercase">
              Lab-Direct
            </p>
            <p className="text-sm text-navy-600">
              Welcome! Review your details and set a password to activate your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Locked identity fields */}
            <div className="space-y-3 rounded-md border border-navy-200 bg-navy-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-navy-500">
                Account identity (locked)
              </p>
              <div className="space-y-1">
                <Label className="text-xs text-navy-500 flex items-center gap-1">
                  <User className="h-3 w-3" /> Name
                </Label>
                <Input
                  value={info?.full_name || ''}
                  readOnly
                  className="bg-white border-navy-200 text-navy-700 cursor-not-allowed"
                  data-testid="setup-name-readonly"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-navy-500 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <Input
                  value={info?.email || ''}
                  readOnly
                  className="bg-white border-navy-200 text-navy-700 cursor-not-allowed"
                  data-testid="setup-email-readonly"
                />
                <p className="text-[11px] text-navy-500">
                  Contact your administrator if your name or email is incorrect.
                </p>
              </div>
            </div>

            {/* Editable contact details */}
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-navy-500">
                Your contact details
              </p>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs text-navy-600">
                  Phone
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                  className="border-navy-200"
                  data-testid="setup-phone-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="company" className="text-xs text-navy-600">
                  Company
                </Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Your company"
                  className="border-navy-200"
                  data-testid="setup-company-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="address" className="text-xs text-navy-600">
                  Address
                </Label>
                <Textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, city, country"
                  className="border-navy-200 min-h-[72px]"
                  data-testid="setup-address-input"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-navy-500 flex items-center gap-1">
                <Lock className="h-3 w-3" /> Create your password
              </p>
              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs text-navy-600">
                  New password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="border-navy-200"
                  data-testid="setup-password-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirmPassword" className="text-xs text-navy-600">
                  Confirm password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="border-navy-200"
                  data-testid="setup-confirm-password-input"
                />
              </div>
            </div>

            {error && (
              <div
                className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700"
                data-testid="setup-error"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting || !password || !confirmPassword}
              className="w-full bg-navy-900 hover:bg-navy-800 h-10"
              data-testid="setup-submit-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                'Save & Sign In'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function LinkError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 p-4">
      <Card className="w-full max-w-md border-navy-200 shadow-2xl">
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-lg font-semibold text-navy-800 mb-2">Invalid link</h3>
          <p className="text-navy-600">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-navy-950">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      }
    >
      <SetupPasswordForm />
    </Suspense>
  );
}
