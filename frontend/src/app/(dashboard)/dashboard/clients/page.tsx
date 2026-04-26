"use client";

import { useEffect, useState, useMemo } from 'react';
import { clientsApi, branchesApi, authApi, notificationsApi } from '@/lib/api';
import { useBranchFilterStore, useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, Plus, Search, Loader2, Pencil, FileText, KeyRound, Mail, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  secondary_email?: string;
  secondary_phone?: string;
  company?: string;
  address?: string;
  branch_id: string;
  notes?: string;
  user_id?: string;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

const COUNTRY_PREFIXES = [
  { code: 'IL', flag: '\ud83c\uddee\ud83c\uddf1', prefix: '+972', label: 'Israel (+972)' },
  { code: 'US', flag: '\ud83c\uddfa\ud83c\uddf8', prefix: '+1', label: 'USA (+1)' },
  { code: 'GB', flag: '\ud83c\uddec\ud83c\udde7', prefix: '+44', label: 'UK (+44)' },
  { code: 'HK', flag: '\ud83c\udded\ud83c\uddf0', prefix: '+852', label: 'Hong Kong (+852)' },
  { code: 'CH', flag: '\ud83c\udde8\ud83c\udded', prefix: '+41', label: 'Switzerland (+41)' },
  { code: 'TH', flag: '\ud83c\uddf9\ud83c\udded', prefix: '+66', label: 'Thailand (+66)' },
  { code: 'IN', flag: '\ud83c\uddee\ud83c\uddf3', prefix: '+91', label: 'India (+91)' },
];

function getDefaultPrefix(branchId: string, branches: Branch[]): string {
  const branch = branches.find(b => b.id === branchId);
  if (!branch) return '+972';
  if (branch.code === 'US') return '+1';
  return '+972';
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const { selectedBranchId } = useBranchFilterStore();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  // Create client dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    secondary_email: '',
    secondary_phone: '',
    company: '',
    address: '',
    branch_id: '',
    notes: '',
  });
  const [phonePrefix, setPhonePrefix] = useState('+972');
  const [secondaryPhonePrefix, setSecondaryPhonePrefix] = useState('+972');

  // Edit client dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [updating, setUpdating] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    phone: '',
    secondary_email: '',
    secondary_phone: '',
    company: '',
    address: '',
    branch_id: '',
    notes: '',
  });
  const [editPhonePrefix, setEditPhonePrefix] = useState('+972');
  const [editSecondaryPhonePrefix, setEditSecondaryPhonePrefix] = useState('+972');

  // Welcome email selection state
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(false);
  const [welcomePreviewHtml, setWelcomePreviewHtml] = useState('');
  const [welcomeSending, setWelcomeSending] = useState(false);
  const [welcomeResults, setWelcomeResults] = useState<Array<{ client_id: string; name?: string; email?: string; status: string; error?: string }> | null>(null);
  const [welcomeSummary, setWelcomeSummary] = useState<{ sent: number; mocked: number; failed: number; skipped: number } | null>(null);

  // Memoised recipient names string for the Welcome email preview header.
  const welcomeRecipientNames = useMemo(
    () => clients.filter((c) => selectedClientIds.has(c.id)).map((c) => c.name).join(', '),
    [clients, selectedClientIds],
  );

  const toggleClientSelected = (clientId: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const toggleSelectAll = (clientIds: string[]) => {
    setSelectedClientIds((prev) => {
      const allSelected = clientIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        clientIds.forEach((id) => next.delete(id));
      } else {
        clientIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const openWelcomeDialog = async () => {
    if (selectedClientIds.size === 0) return;
    setWelcomeResults(null);
    setWelcomeSummary(null);
    try {
      // Preview using the first selected client (so preview reflects real personalisation)
      const firstId = Array.from(selectedClientIds)[0];
      const preview = await notificationsApi.previewWelcome(firstId);
      setWelcomePreviewHtml(preview.html_body || '');
    } catch (e) {
      console.error('Welcome preview failed:', e);
      setWelcomePreviewHtml('<p style="color:#c2410c;padding:20px;">Preview unavailable</p>');
    }
    setWelcomeDialogOpen(true);
  };

  const handleSendWelcome = async () => {
    setWelcomeSending(true);
    try {
      const ids = Array.from(selectedClientIds);
      const res = await notificationsApi.sendWelcomeBulk(ids);
      setWelcomeResults(res.results || []);
      setWelcomeSummary(res.summary || null);
      // Clear selections on success (keep dialog open to show results)
      setSelectedClientIds(new Set());
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      console.error('Send welcome failed:', e);
      alert(err?.response?.data?.detail || 'Failed to send welcome emails');
    } finally {
      setWelcomeSending(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedBranchId]);

  const fetchData = async () => {
    try {
      const [clientsData, branchesData] = await Promise.all([
        clientsApi.getAll(selectedBranchId || undefined),
        branchesApi.getAll(),
      ]);
      setClients(clientsData);
      setBranches(branchesData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    if (!formData.name || !formData.email || !formData.branch_id) {
      return;
    }

    setCreating(true);
    try {
      // Convert empty strings to undefined for optional fields
      const cleanedData = {
        name: formData.name,
        email: formData.email,
        branch_id: formData.branch_id,
        phone: formData.phone ? `${phonePrefix}${formData.phone}` : undefined,
        secondary_email: formData.secondary_email || undefined,
        secondary_phone: formData.secondary_phone ? `${secondaryPhonePrefix}${formData.secondary_phone}` : undefined,
        company: formData.company || undefined,
        address: formData.address || undefined,
        notes: formData.notes || undefined,
      };
      await clientsApi.create(cleanedData);
      setCreateDialogOpen(false);
      setFormData({ name: '', email: '', phone: '', secondary_email: '', secondary_phone: '', company: '', address: '', branch_id: '', notes: '' });
      fetchData();
    } catch (error) {
      console.error('Failed to create client:', error);
    } finally {
      setCreating(false);
    }
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    // Set phone prefixes based on client's branch
    const dp = getDefaultPrefix(client.branch_id, branches);
    setEditPhonePrefix(dp);
    setEditSecondaryPhonePrefix(dp);

    // Strip country code prefix from phone numbers for the input field
    const stripPrefix = (phone: string) => {
      for (const c of COUNTRY_PREFIXES) {
        if (phone.startsWith(c.prefix)) {
          return phone.slice(c.prefix.length);
        }
      }
      return phone;
    };

    setEditFormData({
      name: client.name,
      email: client.email,
      phone: client.phone ? stripPrefix(client.phone) : '',
      secondary_email: client.secondary_email || '',
      secondary_phone: client.secondary_phone ? stripPrefix(client.secondary_phone) : '',
      company: client.company || '',
      address: client.address || '',
      branch_id: client.branch_id,
      notes: client.notes || '',
    });
    setEditDialogOpen(true);
  };

  const handleUpdateClient = async () => {
    if (!editingClient || !editFormData.name || !editFormData.email || !editFormData.branch_id) {
      return;
    }

    setUpdating(true);
    try {
      // Convert empty strings to undefined for optional fields
      const cleanedData = {
        name: editFormData.name,
        email: editFormData.email,
        branch_id: editFormData.branch_id,
        phone: editFormData.phone ? `${editPhonePrefix}${editFormData.phone}` : undefined,
        secondary_email: editFormData.secondary_email || undefined,
        secondary_phone: editFormData.secondary_phone ? `${editSecondaryPhonePrefix}${editFormData.secondary_phone}` : undefined,
        company: editFormData.company || undefined,
        address: editFormData.address || undefined,
        notes: editFormData.notes || undefined,
      };
      await clientsApi.update(editingClient.id, cleanedData);
      setEditDialogOpen(false);
      setEditingClient(null);
      fetchData();
    } catch (error) {
      console.error('Failed to update client:', error);
    } finally {
      setUpdating(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.company?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBranch = branchFilter === 'all' || client.branch_id === branchFilter;
    return matchesSearch && matchesBranch;
  });

  const getBranchName = (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    return branch?.name || 'N/A';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="clients-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy-900">Clients</h2>
          <p className="text-navy-600">Manage your client database</p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button
              variant="outline"
              onClick={openWelcomeDialog}
              disabled={selectedClientIds.size === 0}
              className="border-navy-300 text-navy-900 hover:bg-navy-50 disabled:opacity-50"
              data-testid="send-welcome-email-button"
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Welcome Email
              {selectedClientIds.size > 0 && (
                <Badge variant="secondary" className="ml-2 bg-navy-900 text-white text-[10px] px-1.5 py-0">
                  {selectedClientIds.size}
                </Badge>
              )}
            </Button>
          )}
          {isSuperAdmin && (
            <Button
              onClick={() => {
                // Auto-set branch and phone prefix based on user
                const defaultBranch = user?.branch_id || selectedBranchId || '';
                const dp = defaultBranch ? getDefaultPrefix(defaultBranch, branches) : '+972';
                setFormData(prev => ({ ...prev, branch_id: defaultBranch }));
                setPhonePrefix(dp);
                setSecondaryPhonePrefix(dp);
                setCreateDialogOpen(true);
              }}
              className="bg-navy-900 hover:bg-navy-800"
              data-testid="create-client-button"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="border-navy-200">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-navy-400" />
                <Input
                  placeholder="Search by name, email, or company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-navy-200"
                  data-testid="clients-search-input"
                />
              </div>
            </div>
            {isSuperAdmin && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-full sm:w-48 border-navy-200" data-testid="clients-branch-filter">
                <SelectValue placeholder="Filter by branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Clients Table */}
      <Card className="border-navy-200">
        <CardHeader className="border-b border-navy-200">
          <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Clients ({filteredClients.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredClients.length === 0 ? (
            <div className="p-8 text-center text-navy-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-navy-300" />
              <p>No clients found</p>
            </div>
          ) : (
            <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2 p-3">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="border border-navy-200 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {isSuperAdmin && (
                        <input
                          type="checkbox"
                          checked={selectedClientIds.has(client.id)}
                          onChange={() => toggleClientSelected(client.id)}
                          className="h-4 w-4 rounded border-navy-300 accent-navy-900 flex-shrink-0"
                          data-testid={`client-select-mobile-${client.id}`}
                          aria-label={`Select ${client.name}`}
                        />
                      )}
                      <div className="font-semibold text-navy-900 text-sm truncate">{client.name}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(client)} className="h-7 w-7 p-0">
                      <Pencil className="h-3 w-3 text-navy-600" />
                    </Button>
                  </div>
                  <div className="text-xs text-navy-500 mt-0.5">{client.email}</div>
                  {client.company && <div className="text-xs text-navy-500">{client.company}</div>}
                  <div className="flex items-center justify-between mt-1 text-xs text-navy-400">
                    <span>{client.phone || '-'}</span>
                    <Badge variant="outline" className="text-[10px]">{branches.find(b => b.id === client.branch_id)?.name || '-'}</Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow className="bg-navy-50">
                    {isSuperAdmin && (
                      <TableHead className="w-[40px]">
                        <input
                          type="checkbox"
                          checked={
                            filteredClients.length > 0 &&
                            filteredClients.every((c) => selectedClientIds.has(c.id))
                          }
                          onChange={() => toggleSelectAll(filteredClients.map((c) => c.id))}
                          className="h-4 w-4 rounded border-navy-300 accent-navy-900"
                          data-testid="client-select-all"
                          aria-label="Select all clients"
                        />
                      </TableHead>
                    )}
                    <TableHead className="font-semibold text-navy-700 w-[15%]">Name</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-[20%]">Email</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-[15%]">Phone</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-[15%]">Company</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-[10%]">Branch</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-[18%]">Notes</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-[7%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow
                      key={client.id}
                      className="hover:bg-navy-50"
                      data-testid={`client-row-${client.id}`}
                    >
                      {isSuperAdmin && (
                        <TableCell className="w-[40px]">
                          <input
                            type="checkbox"
                            checked={selectedClientIds.has(client.id)}
                            onChange={() => toggleClientSelected(client.id)}
                            className="h-4 w-4 rounded border-navy-300 accent-navy-900"
                            data-testid={`client-select-${client.id}`}
                            aria-label={`Select ${client.name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium text-navy-900 truncate">{client.name}</TableCell>
                      <TableCell className="text-navy-600 truncate">
                        <span className="truncate block">{client.email}</span>
                      </TableCell>
                      <TableCell className="text-navy-600 truncate">
                        {client.phone ? client.phone : '-'}
                      </TableCell>
                      <TableCell className="text-navy-600 truncate">
                        {client.company || '-'}
                      </TableCell>
                      <TableCell className="text-navy-600">{getBranchName(client.branch_id)}</TableCell>
                      <TableCell className="text-navy-600 max-w-[200px]">
                        {client.notes ? (
                          <div className="flex items-center gap-2 truncate" title={client.notes}>
                            <FileText className="h-4 w-4 text-navy-400 flex-shrink-0" />
                            <span className="truncate">{client.notes}</span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(client)}
                          className="h-8 w-8 p-0 hover:bg-navy-100"
                          data-testid={`edit-client-${client.id}`}
                        >
                          <Pencil className="h-4 w-4 text-navy-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Client Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-900">Add New Client</DialogTitle>
            <DialogDescription>Add a new client to your database</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Row 1: Name & Company */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-sm">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Client name"
                  className="border-navy-200"
                  data-testid="client-name-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="company" className="text-sm">Company</Label>
                <Input
                  id="company"
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
                <Label htmlFor="email" className="text-sm">Primary Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="client@example.com"
                  className="border-navy-200"
                  data-testid="client-email-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-sm">Primary Phone</Label>
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
                    id="phone"
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
                <Label htmlFor="secondary_email" className="text-sm">Secondary Email</Label>
                <Input
                  id="secondary_email"
                  type="email"
                  value={formData.secondary_email}
                  onChange={(e) => setFormData({ ...formData, secondary_email: e.target.value })}
                  placeholder="secondary@example.com"
                  className="border-navy-200"
                  data-testid="client-secondary-email-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="secondary_phone" className="text-sm">Secondary Phone</Label>
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
                    id="secondary_phone"
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
                <Label htmlFor="branch" className="text-sm">Branch *</Label>
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
                <Label htmlFor="address" className="text-sm">Address</Label>
                <Input
                  id="address"
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
              <Label htmlFor="notes" className="text-sm">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this client..."
                className="border-navy-200 min-h-[60px]"
                data-testid="client-notes-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateClient}
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

      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-900">Edit Client</DialogTitle>
            <DialogDescription>Update client information</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Row 1: Name & Company */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-name" className="text-sm">Name *</Label>
                <Input
                  id="edit-name"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  placeholder="Client name"
                  className="border-navy-200"
                  data-testid="edit-client-name-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-company" className="text-sm">Company</Label>
                <Input
                  id="edit-company"
                  value={editFormData.company}
                  onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                  placeholder="Company name"
                  className="border-navy-200"
                  data-testid="edit-client-company-input"
                />
              </div>
            </div>

            {/* Row 2: Primary Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-email" className="text-sm">Primary Email *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  placeholder="client@example.com"
                  className="border-navy-200"
                  data-testid="edit-client-email-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-phone" className="text-sm">Primary Phone</Label>
                <p className="text-[10px] text-navy-400 -mt-0.5">Used for SMS notifications</p>
                <div className="flex gap-1">
                  <Select value={editPhonePrefix} onValueChange={setEditPhonePrefix}>
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
                    id="edit-phone"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="54 397 5801"
                    className="border-navy-200"
                    data-testid="edit-client-phone-input"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Secondary Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-secondary-email" className="text-sm">Secondary Email</Label>
                <Input
                  id="edit-secondary-email"
                  type="email"
                  value={editFormData.secondary_email}
                  onChange={(e) => setEditFormData({ ...editFormData, secondary_email: e.target.value })}
                  placeholder="secondary@example.com"
                  className="border-navy-200"
                  data-testid="edit-client-secondary-email-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-secondary-phone" className="text-sm">Secondary Phone</Label>
                <div className="flex gap-1">
                  <Select value={editSecondaryPhonePrefix} onValueChange={setEditSecondaryPhonePrefix}>
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
                    id="edit-secondary-phone"
                    value={editFormData.secondary_phone}
                    onChange={(e) => setEditFormData({ ...editFormData, secondary_phone: e.target.value })}
                    placeholder="54 397 5801"
                    className="border-navy-200"
                    data-testid="edit-client-secondary-phone-input"
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Branch & Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-branch" className="text-sm">Branch *</Label>
                <Select
                  value={editFormData.branch_id}
                  onValueChange={(value) => setEditFormData({ ...editFormData, branch_id: value })}
                >
                  <SelectTrigger data-testid="edit-client-branch-select">
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
                <Label htmlFor="edit-address" className="text-sm">Address</Label>
                <Input
                  id="edit-address"
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  placeholder="Client address"
                  className="border-navy-200"
                  data-testid="edit-client-address-input"
                />
              </div>
            </div>

            {/* Row 5: Notes */}
            <div className="space-y-1">
              <Label htmlFor="edit-notes" className="text-sm">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                placeholder="Additional notes about this client..."
                className="border-navy-200 min-h-[60px]"
                data-testid="edit-client-notes-input"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {editingClient && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (!editingClient) return;
                  if (!confirm(`Send password reset email to ${editFormData.email}?`)) return;
                  setResettingPassword(true);
                  try {
                    const resetId = editingClient.user_id || editingClient.id;
                    const result = await authApi.adminResetPassword(resetId);
                    alert(result.email_sent
                      ? `Reset link sent to ${editFormData.email}`
                      : `Reset link generated. Share this URL with the client:\n${result.reset_url}`);
                  } catch (err: unknown) {
                    const error = err as { response?: { data?: { detail?: string } } };
                    alert(error.response?.data?.detail || 'Failed to reset password');
                  } finally {
                    setResettingPassword(false);
                  }
                }}
                disabled={resettingPassword}
                className="border-navy-300 sm:mr-auto"
                data-testid="reset-client-password-button"
              >
                {resettingPassword ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                ) : (
                  <><KeyRound className="h-4 w-4 mr-2" />Reset Password</>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateClient}
              disabled={updating || !editFormData.name || !editFormData.email || !editFormData.branch_id}
              className="bg-navy-900 hover:bg-navy-800"
              data-testid="confirm-edit-client-button"
            >
              {updating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Welcome Email Dialog */}
      <Dialog
        open={welcomeDialogOpen}
        onOpenChange={(open) => {
          setWelcomeDialogOpen(open);
          if (!open) {
            setWelcomeResults(null);
            setWelcomeSummary(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="welcome-email-dialog">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-900 flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {welcomeResults ? 'Welcome Emails Sent' : 'Send Welcome Email'}
            </DialogTitle>
            <DialogDescription>
              {welcomeResults
                ? 'Review the delivery status below. Clients without an email on file were skipped.'
                : `This will send a branded welcome message to ${selectedClientIds.size} selected client${selectedClientIds.size === 1 ? '' : 's'}. Preview below before confirming.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {welcomeResults ? (
              <div className="space-y-3">
                {welcomeSummary && (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
                      <div className="text-2xl font-bold text-emerald-700">{welcomeSummary.sent}</div>
                      <div className="text-[11px] uppercase tracking-wide text-emerald-800">Sent</div>
                    </div>
                    <div className="rounded-md bg-sky-50 border border-sky-200 p-3">
                      <div className="text-2xl font-bold text-sky-700">{welcomeSummary.mocked}</div>
                      <div className="text-[11px] uppercase tracking-wide text-sky-800">Mocked</div>
                    </div>
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                      <div className="text-2xl font-bold text-amber-700">{welcomeSummary.skipped}</div>
                      <div className="text-[11px] uppercase tracking-wide text-amber-800">Skipped</div>
                    </div>
                    <div className="rounded-md bg-red-50 border border-red-200 p-3">
                      <div className="text-2xl font-bold text-red-700">{welcomeSummary.failed}</div>
                      <div className="text-[11px] uppercase tracking-wide text-red-800">Failed</div>
                    </div>
                  </div>
                )}
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-navy-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-navy-700 font-semibold">Client</th>
                        <th className="text-left px-3 py-2 text-navy-700 font-semibold">Email</th>
                        <th className="text-left px-3 py-2 text-navy-700 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {welcomeResults.map((r) => (
                        <tr key={r.client_id} className="border-t border-navy-100" data-testid={`welcome-result-${r.client_id}`}>
                          <td className="px-3 py-2 text-navy-900">{r.name || r.client_id}</td>
                          <td className="px-3 py-2 text-navy-600">{r.email || '—'}</td>
                          <td className="px-3 py-2">
                            {r.status === 'sent' && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                              </span>
                            )}
                            {r.status === 'mocked' && (
                              <span className="inline-flex items-center gap-1 text-sky-700 text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Mocked
                              </span>
                            )}
                            {r.status === 'skipped' && (
                              <span className="inline-flex items-center gap-1 text-amber-700 text-xs" title={r.error || ''}>
                                <AlertCircle className="h-3.5 w-3.5" /> Skipped{r.error ? ` — ${r.error}` : ''}
                              </span>
                            )}
                            {r.status === 'failed' && (
                              <span className="inline-flex items-center gap-1 text-red-700 text-xs" title={r.error || ''}>
                                <XCircle className="h-3.5 w-3.5" /> Failed{r.error ? ` — ${r.error}` : ''}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-md border border-navy-200 bg-navy-50 p-3 text-sm text-navy-700">
                  Recipients ({selectedClientIds.size}): {welcomeRecipientNames}
                </div>
                <div className="border border-navy-200 rounded-md overflow-hidden bg-white" style={{ height: 420 }}>
                  <iframe
                    srcDoc={welcomePreviewHtml}
                    title="Welcome email preview"
                    className="w-full h-full border-0"
                    sandbox=""
                    data-testid="welcome-email-preview"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-3 gap-2">
            <Button variant="outline" onClick={() => setWelcomeDialogOpen(false)} data-testid="welcome-dialog-close">
              {welcomeResults ? 'Close' : 'Cancel'}
            </Button>
            {!welcomeResults && (
              <Button
                onClick={handleSendWelcome}
                disabled={welcomeSending || selectedClientIds.size === 0}
                className="bg-navy-900 hover:bg-navy-800"
                data-testid="welcome-dialog-confirm"
              >
                {welcomeSending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                ) : (
                  <><Mail className="h-4 w-4 mr-2" />Send to {selectedClientIds.size} client{selectedClientIds.size === 1 ? '' : 's'}</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
