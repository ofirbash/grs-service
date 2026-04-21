"use client";

import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, User } from 'lucide-react';

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
      const token = localStorage.getItem('token') || '';
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
    </div>
  );
}
