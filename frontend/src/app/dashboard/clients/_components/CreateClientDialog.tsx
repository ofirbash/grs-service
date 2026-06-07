"use client";

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { clientsApi } from '@/lib/api';
import type { Branch, Client } from '../_types';

/** Phone-prefix shortlist for the country picker. Kept inline rather than
 *  pulled from settings — the operator-facing form is happiest with a tight
 *  curated list; expanding it later is a one-line change here. */
const COUNTRY_PREFIXES = [
  { code: 'IL', flag: '\ud83c\uddee\ud83c\uddf1', prefix: '+972', label: 'Israel (+972)' },
  { code: 'US', flag: '\ud83c\uddfa\ud83c\uddf8', prefix: '+1', label: 'USA (+1)' },
  { code: 'GB', flag: '\ud83c\uddec\ud83c\udde7', prefix: '+44', label: 'UK (+44)' },
  { code: 'HK', flag: '\ud83c\udded\ud83c\uddf0', prefix: '+852', label: 'Hong Kong (+852)' },
  { code: 'CH', flag: '\ud83c\udde8\ud83c\udded', prefix: '+41', label: 'Switzerland (+41)' },
  { code: 'TH', flag: '\ud83c\uddf9\ud83c\udded', prefix: '+66', label: 'Thailand (+66)' },
  { code: 'IN', flag: '\ud83c\uddee\ud83c\uddf3', prefix: '+91', label: 'India (+91)' },
];

/** Branch → default phone prefix. US branch defaults to +1; everything else
 *  starts at +972 (the lab is based in Israel — local clients are the most
 *  common case). The operator can override per-client of course. */
function getDefaultPrefix(branchId: string, branches: Branch[]): string {
  const branch = branches.find((b) => b.id === branchId);
  if (!branch) return '+972';
  if (branch.code === 'US') return '+1';
  return '+972';
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  secondary_email: '',
  secondary_phone: '',
  company: '',
  address: '',
  branch_id: '',
  notes: '',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Branch[];
  /** Optional branch preselect — set by the Clients page when only one
   *  branch is selectable, or by the Jobs page when the operator already
   *  has a branch filter active. */
  defaultBranchId?: string;
  /** Fires after a successful create. The newly-created Client is passed
   *  back so callers can auto-select it (Create Job dialog does this). */
  onCreated?: (client: Client) => void;
}

/** Self-contained "Add New Client" dialog. Pulled out of clients/page.tsx on
 *  Feb 25 2026 so the Create Job dialog can offer an inline "+ Add new
 *  client" affordance without duplicating ~180 lines of form. The dialog
 *  owns its own form state; the parent only needs to feed branches +
 *  receive the new client on the onCreated callback. */
export const CreateClientDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  branches,
  defaultBranchId,
  onCreated,
}) => {
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [phonePrefix, setPhonePrefix] = useState('+972');
  const [secondaryPhonePrefix, setSecondaryPhonePrefix] = useState('+972');
  const [creating, setCreating] = useState(false);

  // Whenever the dialog opens (or the parent's defaultBranchId changes),
  // reset the form and seed the branch + phone prefix. We don't reset on
  // close — that would briefly flash the cleared form before the
  // open-transition finishes, and the parent unmounts the dialog anyway.
  useEffect(() => {
    if (open) {
      setFormData({ ...EMPTY_FORM, branch_id: defaultBranchId || '' });
      const dp = defaultBranchId ? getDefaultPrefix(defaultBranchId, branches) : '+972';
      setPhonePrefix(dp);
      setSecondaryPhonePrefix(dp);
    }
  }, [open, defaultBranchId, branches]);

  const handleCreate = async () => {
    if (!formData.name || !formData.email || !formData.branch_id) return;
    setCreating(true);
    try {
      const cleanedData = {
        name: formData.name,
        email: formData.email,
        branch_id: formData.branch_id,
        phone: formData.phone ? `${phonePrefix}${formData.phone}` : undefined,
        secondary_email: formData.secondary_email || undefined,
        secondary_phone: formData.secondary_phone
          ? `${secondaryPhonePrefix}${formData.secondary_phone}`
          : undefined,
        company: formData.company || undefined,
        address: formData.address || undefined,
        notes: formData.notes || undefined,
      };
      const created = (await clientsApi.create(cleanedData)) as Client;
      onCreated?.(created);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create client:', error);
      alert('Failed to create client');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl text-navy-900">Add New Client</DialogTitle>
          <DialogDescription>Add a new client to your database</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Row 1: Name & Company */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cc-name" className="text-sm">Name *</Label>
              <Input
                id="cc-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Client name"
                className="border-navy-200"
                data-testid="client-name-input"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-company" className="text-sm">Company</Label>
              <Input
                id="cc-company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Company name"
                className="border-navy-200"
                data-testid="client-company-input"
              />
            </div>
          </div>

          {/* Row 2: Primary Email & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cc-email" className="text-sm">Primary Email *</Label>
              <Input
                id="cc-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="client@example.com"
                className="border-navy-200"
                data-testid="client-email-input"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-phone" className="text-sm">Primary Phone</Label>
              <p className="text-[10px] text-navy-400 -mt-0.5">Used for SMS notifications</p>
              <div className="flex gap-1">
                <Select value={phonePrefix} onValueChange={setPhonePrefix}>
                  <SelectTrigger className="w-[100px] border-navy-200 text-xs flex-shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_PREFIXES.map((c) => (
                      <SelectItem key={c.code} value={c.prefix}>{c.flag} {c.prefix}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="cc-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="54 397 5801"
                  className="border-navy-200"
                  data-testid="client-phone-input"
                />
              </div>
            </div>
          </div>

          {/* Row 3: Secondary Email & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cc-secondary-email" className="text-sm">Secondary Email</Label>
              <Input
                id="cc-secondary-email"
                type="email"
                value={formData.secondary_email}
                onChange={(e) => setFormData({ ...formData, secondary_email: e.target.value })}
                placeholder="secondary@example.com"
                className="border-navy-200"
                data-testid="client-secondary-email-input"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-secondary-phone" className="text-sm">Secondary Phone</Label>
              <div className="flex gap-1">
                <Select value={secondaryPhonePrefix} onValueChange={setSecondaryPhonePrefix}>
                  <SelectTrigger className="w-[100px] border-navy-200 text-xs flex-shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_PREFIXES.map((c) => (
                      <SelectItem key={c.code} value={c.prefix}>{c.flag} {c.prefix}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="cc-secondary-phone"
                  value={formData.secondary_phone}
                  onChange={(e) => setFormData({ ...formData, secondary_phone: e.target.value })}
                  placeholder="54 397 5801"
                  className="border-navy-200"
                  data-testid="client-secondary-phone-input"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Branch & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cc-branch" className="text-sm">Branch *</Label>
              <Select
                value={formData.branch_id}
                onValueChange={(value) => {
                  setFormData({ ...formData, branch_id: value });
                  const dp = getDefaultPrefix(value, branches);
                  setPhonePrefix(dp);
                  setSecondaryPhonePrefix(dp);
                }}
              >
                <SelectTrigger data-testid="client-branch-select">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-address" className="text-sm">Address</Label>
              <Input
                id="cc-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Client address"
                className="border-navy-200"
                data-testid="client-address-input"
              />
            </div>
          </div>

          {/* Row 5: Notes */}
          <div className="space-y-1">
            <Label htmlFor="cc-notes" className="text-sm">Notes</Label>
            <Textarea
              id="cc-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this client..."
              className="border-navy-200 min-h-[60px]"
              data-testid="client-notes-input"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !formData.name || !formData.email || !formData.branch_id}
            className="bg-navy-900 hover:bg-navy-800"
            data-testid="confirm-create-client-button"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Add Client'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
