"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Gem, Loader2 } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950 p-4">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10" />
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-navy-700/50 bg-white/95 backdrop-blur">
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-navy-800 rounded-xl flex items-center justify-center shadow-lg">
            <Gem className="w-8 h-8 text-gold-400" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-navy-900">GRS Global</CardTitle>
            <CardDescription className="text-navy-600">
              Lab Logistics & ERP System
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg" data-testid="login-error">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-navy-700">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@bashari.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="border-navy-200 focus:border-navy-500 focus:ring-navy-500"
                data-testid="login-email-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-navy-700">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="border-navy-200 focus:border-navy-500 focus:ring-navy-500"
                data-testid="login-password-input"
              />
            </div>
            
            <Button
              type="submit"
              className="w-full bg-navy-800 hover:bg-navy-700 text-white h-11"
              disabled={isLoading}
              data-testid="login-submit-button"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-navy-500">
            <p>Demo credentials: admin@bashari.com / admin123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
