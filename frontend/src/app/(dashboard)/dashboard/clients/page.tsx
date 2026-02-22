"use client";

import { useEffect, useState } from 'react';
import { clientsApi, branchesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
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
import { Users, Plus, Search, Loader2, Mail, Phone, Building, Pencil, FileText } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: string;
  branch_id: string;
  notes?: string;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');

  // Create client dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    branch_id: '',
    notes: '',
  });

  // Edit client dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    branch_id: '',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [clientsData, branchesData] = await Promise.all([
        clientsApi.getAll(),
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
      await clientsApi.create(formData);
      setCreateDialogOpen(false);
      setFormData({ name: '', email: '', phone: '', company: '', address: '', branch_id: '', notes: '' });
      fetchData();
    } catch (error) {
      console.error('Failed to create client:', error);
    } finally {
      setCreating(false);
    }
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setEditFormData({
      name: client.name,
      email: client.email,
      phone: client.phone || '',
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
      await clientsApi.update(editingClient.id, editFormData);
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
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-navy-800 hover:bg-navy-700"
          data-testid="create-client-button"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-navy-100">
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
          </div>
        </CardContent>
      </Card>

      {/* Clients Table */}
      <Card className="border-navy-100">
        <CardHeader className="border-b border-navy-100">
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-navy-50">
                    <TableHead className="font-semibold text-navy-700">Name</TableHead>
                    <TableHead className="font-semibold text-navy-700">Email</TableHead>
                    <TableHead className="font-semibold text-navy-700">Phone</TableHead>
                    <TableHead className="font-semibold text-navy-700">Company</TableHead>
                    <TableHead className="font-semibold text-navy-700">Branch</TableHead>
                    <TableHead className="font-semibold text-navy-700">Notes</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow
                      key={client.id}
                      className="hover:bg-navy-50"
                      data-testid={`client-row-${client.id}`}
                    >
                      <TableCell className="font-medium text-navy-800">{client.name}</TableCell>
                      <TableCell className="text-navy-600">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-navy-400" />
                          {client.email}
                        </div>
                      </TableCell>
                      <TableCell className="text-navy-600">
                        {client.phone ? (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-navy-400" />
                            {client.phone}
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-navy-600">
                        {client.company ? (
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-navy-400" />
                            {client.company}
                          </div>
                        ) : (
                          '-'
                        )}
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
          )}
        </CardContent>
      </Card>

      {/* Create Client Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800">Add New Client</DialogTitle>
            <DialogDescription>Add a new client to your database</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Client name"
                className="border-navy-200"
                data-testid="client-name-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
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

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 234 567 8900"
                className="border-navy-200"
                data-testid="client-phone-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Company name"
                className="border-navy-200"
                data-testid="client-company-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch">Branch *</Label>
              <Select
                value={formData.branch_id}
                onValueChange={(value) => setFormData({ ...formData, branch_id: value })}
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={creating || !formData.name || !formData.email || !formData.branch_id}
              className="bg-navy-800 hover:bg-navy-700"
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
    </div>
  );
}
