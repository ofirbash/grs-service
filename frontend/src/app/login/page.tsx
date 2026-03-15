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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
