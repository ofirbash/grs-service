"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Save, Truck, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cloudinaryApi, settingsApi, type ReturnSender } from '@/lib/api';

const FIELDS: Array<{ key: keyof ReturnSender; label: string }> = [
  { key: 'company_name', label: 'Company name' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

export const ReturnSenderCard: React.FC = () => {
  const [form, setForm] = useState<ReturnSender | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    settingsApi.getReturnSender().then(setForm).catch((e) => console.error('Failed to load return sender:', e));
  }, []);

  if (!form) return null;

  const handleLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file');
      return;
    }
    setUploading(true);
    try {
      const { url } = await cloudinaryApi.uploadFile(file, 'uploads/branding');
      setForm({ ...form, logo_url: url });
    } catch (e) {
      console.error('Logo upload failed:', e);
      alert('Logo upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      setForm(await settingsApi.updateReturnSender(form));
      setMessage('Saved');
    } catch (e) {
      console.error('Failed to save return sender:', e);
      alert('Failed to save. Company name and address are required.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-navy-200" data-testid="return-sender-card">
      <CardHeader>
        <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Return Shipment Sender (HK)
        </CardTitle>
        <CardDescription>
          Printed on full shipment memos for &quot;Stones from Lab&quot; and &quot;Certificates from Lab&quot; shipments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={form.logo_url}
            alt="Sender logo"
            className="h-16 w-16 object-contain border border-navy-200 rounded-md p-0.5 bg-white"
            data-testid="return-sender-logo-preview"
          />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLogo(e.target.files?.[0])} data-testid="return-sender-logo-input" />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="return-sender-logo-upload">
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Replace logo
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className={`space-y-1.5 ${key === 'address' ? 'sm:col-span-2' : ''}`}>
              <Label className="text-sm">{label}</Label>
              <Input
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="border-navy-200"
                data-testid={`return-sender-${key.replace('_', '-')}`}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || uploading} className="bg-navy-900 hover:bg-navy-800" data-testid="return-sender-save">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
          {message && <span className="text-sm text-emerald-600" data-testid="return-sender-saved">{message}</span>}
        </div>
      </CardContent>
    </Card>
  );
};
