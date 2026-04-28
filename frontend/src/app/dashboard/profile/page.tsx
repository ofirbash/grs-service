"use client";

import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { getToken } from '@/lib/tokenStorage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, User, ShieldCheck, ShieldOff, Copy } from 'lucide-react';

export default function ProfilePage() {
  const { user, setAuth } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || '',
        email: user.email || '',
        phone: user.phone || '',
        password: '',
        confirmPassword: '',
      });
      setLoading(false);
    }
  }, [user]);

  const handleSave = async () => {
    if (formData.password && formData.password !== formData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const updateData: { full_name?: string; phone?: string; email?: string; password?: string } = {};
      if (formData.full_name !== user?.full_name) updateData.full_name = formData.full_name;
      if (formData.phone !== (user?.phone || '')) updateData.phone = formData.phone;
      if (isAdmin && formData.email !== user?.email) updateData.email = formData.email;
      if (formData.password) updateData.password = formData.password;

      if (Object.keys(updateData).length === 0) {
        setSaving(false);
        return;
      }

      const updated = await authApi.updateProfile(updateData);
      // Update auth store
      const token = getToken() || '';
      setAuth(token, { ...user, ...updated });
      setSaved(true);
      setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      setTimeout(() => setSaved(false), 2000);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-navy-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy-900">My Profile</h1>

      <Card className="border-navy-200 max-w-xl">
        <CardHeader className="border-b border-navy-100 pb-3">
          <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
            <User className="h-5 w-5 text-navy-600" />
            Account Details
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-navy-500">Full Name</Label>
            <Input
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="border-navy-200"
              data-testid="profile-name-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-navy-500">Email</Label>
            <Input
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="border-navy-200"
              disabled={!isAdmin}
              data-testid="profile-email-input"
            />
            {!isAdmin && (
              <p className="text-[10px] text-navy-400">Contact admin to change your email address</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-navy-500">Phone</Label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="border-navy-200"
              data-testid="profile-phone-input"
            />
          </div>

          <div className="border-t border-navy-100 pt-4 space-y-1.5">
            <Label className="text-xs text-navy-500">New Password</Label>
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Leave blank to keep current"
              className="border-navy-200"
              data-testid="profile-password-input"
            />
          </div>

          {formData.password && (
            <div className="space-y-1.5">
              <Label className="text-xs text-navy-500">Confirm Password</Label>
              <Input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="border-navy-200"
                data-testid="profile-confirm-password-input"
              />
            </div>
          )}

          <div className="pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-navy-900 hover:bg-navy-800"
              data-testid="profile-save-button"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : saved ? (
                <><Check className="h-4 w-4 mr-2" />Saved</>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isAdmin && <TwoFactorCard />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Two-Factor Authentication (admins only)                                    */
/* -------------------------------------------------------------------------- */

function TwoFactorCard() {
  const { user, setAuth } = useAuthStore();
  const enabled = !!user?.two_factor_enabled;
  const [mode, setMode] = useState<'idle' | 'enrolling' | 'disabling'>('idle');
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const startEnroll = async () => {
    setError('');
    setSubmitting(true);
    try {
      const data = await authApi.setup2fa();
      setSecret(data.secret);
      setQrCode(data.qr_code);
      setCode('');
      setMode('enrolling');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Failed to start 2FA enrollment');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmEnroll = async () => {
    setError('');
    setSubmitting(true);
    try {
      await authApi.enable2fa(code);
      const token = getToken() || '';
      if (user) setAuth(token, { ...user, two_factor_enabled: true });
      setMode('idle');
      setSecret('');
      setQrCode('');
      setCode('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Invalid code. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDisable = async () => {
    setError('');
    setSubmitting(true);
    try {
      await authApi.disable2fa(code);
      const token = getToken() || '';
      if (user) setAuth(token, { ...user, two_factor_enabled: false });
      setMode('idle');
      setCode('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Invalid code. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-navy-200 max-w-xl" data-testid="2fa-card">
      <CardHeader className="border-b border-navy-100 pb-3">
        <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          ) : (
            <ShieldOff className="h-5 w-5 text-navy-400" />
          )}
          Two-Factor Authentication
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-navy-700 font-medium">
              {enabled ? 'Active on this account' : 'Not enabled'}
            </p>
            <p className="text-xs text-navy-500 mt-1">
              Protect your admin login with a 6-digit code from Google Authenticator,
              Authy, 1Password, or any TOTP-compatible app.
            </p>
          </div>
          {mode === 'idle' && !enabled && (
            <Button
              onClick={startEnroll}
              disabled={submitting}
              className="bg-navy-900 hover:bg-navy-800 shrink-0"
              data-testid="2fa-enable-button"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enable 2FA'}
            </Button>
          )}
          {mode === 'idle' && enabled && (
            <Button
              variant="outline"
              onClick={() => { setMode('disabling'); setCode(''); setError(''); }}
              className="shrink-0 border-red-200 text-red-600 hover:bg-red-50"
              data-testid="2fa-disable-button"
            >
              Disable 2FA
            </Button>
          )}
        </div>

        {mode === 'enrolling' && (
          <div className="rounded-md border border-navy-200 bg-navy-50 p-4 space-y-3">
            <p className="text-sm font-medium text-navy-800">
              Step 1 — Scan this QR code with your authenticator app
            </p>
            {qrCode && (
              <div className="flex justify-center bg-white p-3 rounded border border-navy-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="2FA QR code" width={180} height={180} />
              </div>
            )}
            <details className="text-xs text-navy-600">
              <summary className="cursor-pointer hover:text-navy-900">
                Can&apos;t scan? Enter this key manually
              </summary>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 bg-white border border-navy-200 rounded px-2 py-1 font-mono text-[11px] break-all">
                  {secret}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(secret);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </details>

            <div className="pt-2 space-y-2">
              <Label className="text-sm font-medium text-navy-800">
                Step 2 — Enter the 6-digit code from the app
              </Label>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="border-navy-200 h-11 text-center text-xl tracking-[0.5em] font-mono"
                placeholder="123456"
                data-testid="2fa-enroll-code-input"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => { setMode('idle'); setSecret(''); setQrCode(''); setCode(''); setError(''); }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmEnroll}
                disabled={submitting || code.length !== 6}
                className="flex-1 bg-navy-900 hover:bg-navy-800"
                data-testid="2fa-enroll-confirm-button"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Enable'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'disabling' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 space-y-3">
            <p className="text-sm font-medium text-red-900">
              Confirm disabling 2FA
            </p>
            <p className="text-xs text-red-800">
              Enter the current 6-digit code from your authenticator app to disable 2FA.
            </p>
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="border-red-200 bg-white h-11 text-center text-xl tracking-[0.5em] font-mono"
              placeholder="123456"
              data-testid="2fa-disable-code-input"
              autoFocus
            />
            {error && (
              <div className="bg-white border border-red-200 rounded-md p-2.5 text-xs text-red-700">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setMode('idle'); setCode(''); setError(''); }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDisable}
                disabled={submitting || code.length !== 6}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                data-testid="2fa-disable-confirm-button"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disable 2FA'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
