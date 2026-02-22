"use client";

import { useAuthStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Settings, User, Shield } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6 animate-fadeIn max-w-4xl" data-testid="settings-page">
      <div>
        <h2 className="text-2xl font-bold text-navy-900">Settings</h2>
        <p className="text-navy-600">Manage your account and preferences</p>
      </div>

      {/* Profile Card */}
      <Card className="border-navy-100">
        <CardHeader className="border-b border-navy-100">
          <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label className="text-navy-500">Full Name</Label>
              <p className="font-medium text-navy-800 mt-1">{user?.full_name || 'N/A'}</p>
            </div>
            <div>
              <Label className="text-navy-500">Email</Label>
              <p className="font-medium text-navy-800 mt-1">{user?.email || 'N/A'}</p>
            </div>
            <div>
              <Label className="text-navy-500">Role</Label>
              <div className="mt-1">
                <Badge variant={user?.role === 'super_admin' ? 'default' : 'secondary'}>
                  {user?.role?.replace('_', ' ') || 'N/A'}
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-navy-500">User ID</Label>
              <p className="font-mono text-sm text-navy-600 mt-1">{user?.id || 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Card */}
      <Card className="border-navy-100">
        <CardHeader className="border-b border-navy-100">
          <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>Security settings and preferences</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-navy-50 rounded-lg">
              <div>
                <p className="font-medium text-navy-800">Two-Factor Authentication</p>
                <p className="text-sm text-navy-500">Add an extra layer of security to your account</p>
              </div>
              <Badge variant="secondary">Not Enabled</Badge>
            </div>
            <div className="flex items-center justify-between p-4 bg-navy-50 rounded-lg">
              <div>
                <p className="font-medium text-navy-800">Password</p>
                <p className="text-sm text-navy-500">Last changed: Unknown</p>
              </div>
              <Badge variant="outline">Active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="border-navy-100">
        <CardHeader className="border-b border-navy-100">
          <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label className="text-navy-500">Application</Label>
              <p className="font-medium text-navy-800 mt-1">GRS Global Lab Logistics ERP</p>
            </div>
            <div>
              <Label className="text-navy-500">Version</Label>
              <p className="font-medium text-navy-800 mt-1">1.0.0</p>
            </div>
            <div>
              <Label className="text-navy-500">Environment</Label>
              <p className="font-medium text-navy-800 mt-1">Production</p>
            </div>
            <div>
              <Label className="text-navy-500">API Status</Label>
              <Badge variant="success" className="mt-1">Connected</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
