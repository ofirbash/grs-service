"use client";

import { useEffect, useState } from 'react';
import { settingsApi, branchesApi, jobsApi, usersApi, addressesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  ListFilter,
  Building,
  DollarSign,
  AlertCircle,
  Search,
  Shield,
} from 'lucide-react';

// Types
interface DropdownOption {
  value: string;
  stone_types: string[];
}

interface DropdownSettings {
  identification: DropdownOption[];
  color: DropdownOption[];
  origin: DropdownOption[];
  comment: DropdownOption[];
}

interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  return_address: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
}

interface PricingBracket {
  min_value: number;
  max_value: number;
  fees: Record<string, number>;
}

interface PricingConfig {
  brackets: PricingBracket[];
  color_stability_fee: number;
  mounted_jewellery_fee: number;
  service_types: string[];
}

const STONE_TYPES = ['all', 'Emerald', 'Sapphire', 'Ruby', 'Diamond', 'Spinel', 'Tanzanite', 'Other'];
const DROPDOWN_FIELDS = ['identification', 'color', 'origin', 'comment'] as const;

export default function SettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';
  const isSuperAdmin = user?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState('dropdowns');
  const [loading, setLoading] = useState(true);

  // Dropdown Settings State
  const [dropdowns, setDropdowns] = useState<DropdownSettings>({
    identification: [],
    color: [],
    origin: [],
    comment: [],
  });
  const [selectedField, setSelectedField] = useState<typeof DROPDOWN_FIELDS[number]>('identification');
  const [dropdownSearchTerm, setDropdownSearchTerm] = useState('');
  const [editingOption, setEditingOption] = useState<DropdownOption | null>(null);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [newOptionStoneTypes, setNewOptionStoneTypes] = useState<string[]>(['all']);
  const [savingDropdown, setSavingDropdown] = useState(false);
  const [addOptionDialogOpen, setAddOptionDialogOpen] = useState(false);

  // Branches State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [branchForm, setBranchForm] = useState({
    name: '',
    code: '',
    address: '',
    return_address: '',
    phone: '',
    email: '',
  });

  // Pricing State
  const [pricing, setPricing] = useState<PricingConfig>({
    brackets: [],
    color_stability_fee: 50,
    mounted_jewellery_fee: 50,
    service_types: ['Express', 'Normal', 'Recheck'],
  });
  const [editingPricing, setEditingPricing] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingForm, setPricingForm] = useState<PricingConfig>({
    brackets: [],
    color_stability_fee: 50,
    mounted_jewellery_fee: 50,
    service_types: [],
  });
  const [newServiceType, setNewServiceType] = useState('');
  const [usedServiceTypes, setUsedServiceTypes] = useState<Set<string>>(new Set());

  // Admin Users State
  interface AdminUser {
    id: string;
    email: string;
    full_name: string;
    role: string;
    branch_id?: string;
    phone?: string;
    created_at: string;
  }
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'branch_admin',
    branch_id: '',
    phone: '',
  });

  // Addresses State
  interface Address {
    id: string;
    name: string;
  }
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [newAddressName, setNewAddressName] = useState('');
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [editAddressName, setEditAddressName] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const promises: Promise<unknown>[] = [
        settingsApi.getDropdowns(),
        branchesApi.getAll(),
        settingsApi.getPricing(),
        jobsApi.getAll(),
        addressesApi.getAll(),
      ];
      if (isSuperAdmin) {
        promises.push(usersApi.getAll());
      }
      const [dropdownsData, branchesData, pricingData, jobsData, addressesData, usersData] = await Promise.all(promises);
      setDropdowns(dropdownsData as DropdownSettings);
      setBranches(branchesData as Branch[]);
      setPricing(pricingData as PricingConfig);
      setPricingForm(pricingData as PricingConfig);
      setAddresses(addressesData as Address[]);
      const used = new Set<string>();
      (jobsData as Array<{ service_type?: string }>).forEach((job) => {
        if (job.service_type) used.add(job.service_type);
      });
      setUsedServiceTypes(used);
      if (usersData) {
        setAdminUsers(usersData as AdminUser[]);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      alert('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  // ============== DROPDOWN HANDLERS ==============
  const handleAddOption = async () => {
    if (!newOptionValue.trim()) return;

    const newOption: DropdownOption = {
      value: newOptionValue.trim().toUpperCase(),
      stone_types: newOptionStoneTypes,
    };

    const updatedOptions = [...dropdowns[selectedField], newOption];

    setSavingDropdown(true);
    try {
      await settingsApi.updateDropdownField(selectedField, updatedOptions);
      setDropdowns({ ...dropdowns, [selectedField]: updatedOptions });
      setNewOptionValue('');
      setNewOptionStoneTypes(['all']);
      setAddOptionDialogOpen(false);
      ;
    } catch (error) {
      console.error('Failed to add option:', error);
      alert('Failed to add option');
    } finally {
      setSavingDropdown(false);
    }
  };

  const handleUpdateOption = async (oldValue: string, newOption: DropdownOption) => {
    const updatedOptions = dropdowns[selectedField].map((opt) =>
      opt.value === oldValue ? newOption : opt
    );

    setSavingDropdown(true);
    try {
      await settingsApi.updateDropdownField(selectedField, updatedOptions);
      setDropdowns({ ...dropdowns, [selectedField]: updatedOptions });
      setEditingOption(null);
      ;
    } catch (error) {
      console.error('Failed to update option:', error);
      alert('Failed to update option');
    } finally {
      setSavingDropdown(false);
    }
  };

  const handleDeleteOption = async (value: string) => {
    if (!confirm(`Are you sure you want to delete "${value}"?`)) return;

    const updatedOptions = dropdowns[selectedField].filter((opt) => opt.value !== value);

    setSavingDropdown(true);
    try {
      await settingsApi.updateDropdownField(selectedField, updatedOptions);
      setDropdowns({ ...dropdowns, [selectedField]: updatedOptions });
      ;
    } catch (error) {
      console.error('Failed to delete option:', error);
      alert('Failed to delete option');
    } finally {
      setSavingDropdown(false);
    }
  };

  const toggleStoneType = (stoneType: string, currentTypes: string[], setter: (types: string[]) => void) => {
    if (stoneType === 'all') {
      setter(['all']);
    } else {
      const withoutAll = currentTypes.filter((t) => t !== 'all');
      if (withoutAll.includes(stoneType)) {
        const filtered = withoutAll.filter((t) => t !== stoneType);
        setter(filtered.length === 0 ? ['all'] : filtered);
      } else {
        setter([...withoutAll, stoneType]);
      }
    }
  };

  // ============== BRANCH HANDLERS ==============
  const openBranchDialog = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setBranchForm({
        name: branch.name,
        code: branch.code,
        address: branch.address,
        return_address: branch.return_address,
        phone: branch.phone || '',
        email: branch.email || '',
      });
    } else {
      setEditingBranch(null);
      setBranchForm({
        name: '',
        code: '',
        address: '',
        return_address: '',
        phone: '',
        email: '',
      });
    }
    setBranchDialogOpen(true);
  };

  const handleSaveBranch = async () => {
    if (!branchForm.name || !branchForm.code || !branchForm.address || !branchForm.return_address) {
      alert('Please fill in all required fields');
      return;
    }

    setSavingBranch(true);
    try {
      if (editingBranch) {
        await branchesApi.update(editingBranch.id, branchForm);
        ;
      } else {
        await branchesApi.create(branchForm);
        ;
      }
      setBranchDialogOpen(false);
      fetchAllData();
    } catch (error) {
      console.error('Failed to save branch:', error);
      alert('Failed to save branch');
    } finally {
      setSavingBranch(false);
    }
  };

  // ============== PRICING HANDLERS ==============
  const handleStartEditPricing = () => {
    setPricingForm({ ...pricing });
    setEditingPricing(true);
  };

  const handleCancelEditPricing = () => {
    setPricingForm({ ...pricing });
    setEditingPricing(false);
  };

  const handleSavePricing = async () => {
    setSavingPricing(true);
    try {
      await settingsApi.updatePricing(pricingForm);
      setPricing({ ...pricingForm });
      setEditingPricing(false);
      ;
    } catch (error) {
      console.error('Failed to save pricing:', error);
      alert('Failed to save pricing');
    } finally {
      setSavingPricing(false);
    }
  };

  const updateBracket = (index: number, field: string, value: number) => {
    const newBrackets = [...pricingForm.brackets];
    if (field === 'min_value' || field === 'max_value') {
      newBrackets[index] = { ...newBrackets[index], [field]: value };
    } else {
      // field is a service type name - update inside fees
      newBrackets[index] = {
        ...newBrackets[index],
        fees: { ...newBrackets[index].fees, [field]: value }
      };
    }
    setPricingForm({ ...pricingForm, brackets: newBrackets });
  };

  const addBracket = () => {
    const lastBracket = pricingForm.brackets[pricingForm.brackets.length - 1];
    const defaultFees: Record<string, number> = {};
    pricingForm.service_types.forEach(st => { defaultFees[st] = 0; });
    const newBracket: PricingBracket = {
      min_value: lastBracket ? lastBracket.max_value + 1 : 0,
      max_value: lastBracket ? lastBracket.max_value + 10000 : 9999.99,
      fees: defaultFees,
    };
    setPricingForm({ ...pricingForm, brackets: [...pricingForm.brackets, newBracket] });
  };

  const removeBracket = (index: number) => {
    if (pricingForm.brackets.length <= 1) {
      alert('At least one pricing bracket is required');
      return;
    }
    const newBrackets = pricingForm.brackets.filter((_, i) => i !== index);
    setPricingForm({ ...pricingForm, brackets: newBrackets });
  };

  const handleAddServiceType = () => {
    const trimmed = newServiceType.trim();
    if (!trimmed) return;
    if (pricingForm.service_types.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      alert('This service type already exists');
      return;
    }
    // Add service type and add default fee (0) to all existing brackets
    const updatedBrackets = pricingForm.brackets.map(b => ({
      ...b,
      fees: { ...b.fees, [trimmed]: 0 }
    }));
    setPricingForm({
      ...pricingForm,
      service_types: [...pricingForm.service_types, trimmed],
      brackets: updatedBrackets,
    });
    setNewServiceType('');
  };

  const handleDeleteServiceType = (serviceType: string) => {
    if (usedServiceTypes.has(serviceType)) return;
    if (!confirm(`Remove service type "${serviceType}"?`)) return;
    const updatedBrackets = pricingForm.brackets.map(b => {
      const newFees = { ...b.fees };
      delete newFees[serviceType];
      return { ...b, fees: newFees };
    });
    setPricingForm({
      ...pricingForm,
      service_types: pricingForm.service_types.filter(t => t !== serviceType),
      brackets: updatedBrackets,
    });
  };

  // ============== ADDRESS HANDLERS ==============
  const handleAddAddress = async () => {
    if (!newAddressName.trim()) return;
    setSavingAddress(true);
    try {
      await addressesApi.create(newAddressName.trim());
      setNewAddressName('');
      const data = await addressesApi.getAll();
      setAddresses(data);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Failed to add address');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleUpdateAddress = async () => {
    if (!editingAddress || !editAddressName.trim()) return;
    setSavingAddress(true);
    try {
      await addressesApi.update(editingAddress.id, editAddressName.trim());
      setEditingAddress(null);
      const data = await addressesApi.getAll();
      setAddresses(data);
    } catch (error) {
      console.error('Failed to update address:', error);
    } finally {
      setSavingAddress(false);
    }
  };

  // ============== ADMIN USER HANDLERS ==============
  const openAdminDialog = (admin?: AdminUser) => {
    if (admin) {
      setEditingAdmin(admin);
      setAdminForm({
        email: admin.email,
        full_name: admin.full_name,
        password: '',
        role: admin.role,
        branch_id: admin.branch_id || '',
        phone: admin.phone || '',
      });
    } else {
      setEditingAdmin(null);
      setAdminForm({ email: '', full_name: '', password: '', role: 'branch_admin', branch_id: '', phone: '' });
    }
    setAdminDialogOpen(true);
  };

  const handleSaveAdmin = async () => {
    if (!adminForm.email || !adminForm.full_name || !adminForm.role) return;
    if (!editingAdmin && !adminForm.password) return;
    if (adminForm.role === 'branch_admin' && !adminForm.branch_id) {
      alert('Please select a branch for the branch admin');
      return;
    }

    setSavingAdmin(true);
    try {
      if (editingAdmin) {
        const updateData: Record<string, string> = {
          full_name: adminForm.full_name,
          role: adminForm.role,
          branch_id: adminForm.role === 'branch_admin' ? adminForm.branch_id : '',
          phone: adminForm.phone,
        };
        if (adminForm.password) updateData.password = adminForm.password;
        await usersApi.update(editingAdmin.id, updateData);
      } else {
        await usersApi.createAdmin({
          email: adminForm.email,
          full_name: adminForm.full_name,
          password: adminForm.password,
          role: adminForm.role,
          branch_id: adminForm.role === 'branch_admin' ? adminForm.branch_id : undefined,
          phone: adminForm.phone || undefined,
        });
      }
      setAdminDialogOpen(false);
      fetchAllData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Failed to save admin user');
    } finally {
      setSavingAdmin(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="settings-loading">
        <Loader2 className="h-8 w-8 animate-spin text-navy-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6 animate-fadeIn" data-testid="settings-page">
        <Card className="border-navy-100">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-amber-500" />
            <h3 className="text-lg font-semibold text-navy-800 mb-2">Access Restricted</h3>
            <p className="text-navy-600">Admin access is required to view settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="settings-page">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-navy-900">Admin Settings</h2>
        <p className="text-navy-600">Configure system options, branches, and pricing</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-navy-100 p-1">
          <TabsTrigger
            value="dropdowns"
            className="data-[state=active]:bg-white data-[state=active]:text-navy-800"
            data-testid="tab-dropdowns"
          >
            <ListFilter className="h-4 w-4 mr-2" />
            Verbal Dropdowns
          </TabsTrigger>
          <TabsTrigger
            value="branches"
            className="data-[state=active]:bg-white data-[state=active]:text-navy-800"
            data-testid="tab-branches"
          >
            <Building className="h-4 w-4 mr-2" />
            Branches
          </TabsTrigger>
          <TabsTrigger
            value="pricing"
            className="data-[state=active]:bg-white data-[state=active]:text-navy-800"
            data-testid="tab-pricing"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Pricing
          </TabsTrigger>
          {isSuperAdmin && (
          <TabsTrigger
            value="admins"
            className="data-[state=active]:bg-white data-[state=active]:text-navy-800"
            data-testid="tab-admins"
          >
            <Shield className="h-4 w-4 mr-2" />
            Admin Users
          </TabsTrigger>
          )}
        </TabsList>

        {/* ==================== DROPDOWNS TAB ==================== */}
        <TabsContent value="dropdowns" className="space-y-6">
          <Card className="border-navy-100">
            <CardHeader>
              <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
                <ListFilter className="h-5 w-5" />
                Verbal Findings Dropdown Options
              </CardTitle>
              <CardDescription>
                Manage dropdown values for Identification, Color, Origin, and Comment fields.
                Optionally filter options by stone type.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Field Selector and Search */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end justify-between">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Select Field</Label>
                    <Select value={selectedField} onValueChange={(v) => {
                      setSelectedField(v as typeof DROPDOWN_FIELDS[number]);
                      setDropdownSearchTerm('');
                    }}>
                      <SelectTrigger className="w-48" data-testid="dropdown-field-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DROPDOWN_FIELDS.map((field) => (
                          <SelectItem key={field} value={field}>
                            {field.charAt(0).toUpperCase() + field.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Search Options</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-navy-400" />
                      <Input
                        placeholder="Filter options..."
                        value={dropdownSearchTerm}
                        onChange={(e) => setDropdownSearchTerm(e.target.value)}
                        className="pl-10 w-64 border-navy-200"
                        data-testid="dropdown-search-input"
                      />
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => setAddOptionDialogOpen(true)}
                  className="bg-navy-800 hover:bg-navy-700"
                  data-testid="add-dropdown-option-button"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Option
                </Button>
              </div>

              {/* Options Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-navy-50">
                      <TableHead className="font-semibold text-navy-700">Value</TableHead>
                      <TableHead className="font-semibold text-navy-700">Stone Types</TableHead>
                      <TableHead className="font-semibold text-navy-700 w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const filteredOptions = dropdowns[selectedField].filter(option =>
                        option.value.toLowerCase().includes(dropdownSearchTerm.toLowerCase())
                      );
                      
                      if (filteredOptions.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8 text-navy-500">
                              {dropdownSearchTerm ? `No options matching "${dropdownSearchTerm}"` : 'No options configured for this field'}
                            </TableCell>
                          </TableRow>
                        );
                      }
                      
                      return filteredOptions.map((option, index) => (
                        <TableRow key={`${option.value}-${index}`} className="hover:bg-navy-50">
                          <TableCell className="font-medium text-navy-800">
                            {editingOption?.value === option.value ? (
                              <Input
                                value={editingOption.value}
                                onChange={(e) => setEditingOption({ ...editingOption, value: e.target.value })}
                                className="max-w-xs"
                              />
                            ) : (
                              option.value
                            )}
                          </TableCell>
                          <TableCell>
                            {editingOption?.value === option.value ? (
                              <div className="flex flex-wrap gap-1">
                                {STONE_TYPES.map((type) => (
                                  <Badge
                                    key={type}
                                    variant={editingOption.stone_types.includes(type) ? 'default' : 'outline'}
                                    className={`cursor-pointer ${
                                      editingOption.stone_types.includes(type)
                                        ? 'bg-navy-800 hover:bg-navy-700'
                                        : 'hover:bg-navy-100'
                                    }`}
                                    onClick={() =>
                                      toggleStoneType(type, editingOption.stone_types, (types) =>
                                        setEditingOption({ ...editingOption, stone_types: types })
                                      )
                                    }
                                  >
                                    {type}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {option.stone_types.map((type) => (
                                  <Badge key={type} variant="secondary" className="bg-navy-100 text-navy-700">
                                    {type}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {editingOption?.value === option.value ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleUpdateOption(option.value, editingOption)}
                                    disabled={savingDropdown}
                                    className="h-8 w-8 p-0"
                                    data-testid={`save-option-${index}`}
                                  >
                                    {savingDropdown ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4 text-green-600" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingOption(null)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <X className="h-4 w-4 text-navy-500" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingOption({ ...option })}
                                    className="h-8 w-8 p-0 hover:bg-navy-100"
                                    data-testid={`edit-option-${index}`}
                                  >
                                    <Pencil className="h-4 w-4 text-navy-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteOption(option.value)}
                                    className="h-8 w-8 p-0 hover:bg-red-50"
                                    data-testid={`delete-option-${index}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </div>

              <p className="text-sm text-navy-500">
                {dropdownSearchTerm 
                  ? `Showing ${dropdowns[selectedField].filter(o => o.value.toLowerCase().includes(dropdownSearchTerm.toLowerCase())).length} of ${dropdowns[selectedField].length} options`
                  : `Total: ${dropdowns[selectedField].length} options`
                }
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== BRANCHES TAB ==================== */}
        <TabsContent value="branches" className="space-y-6">
          <Card className="border-navy-100">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Branch Locations
                </CardTitle>
                <CardDescription>Manage office locations and addresses</CardDescription>
              </div>
              {isSuperAdmin && (
                <Button
                  onClick={() => openBranchDialog()}
                  className="bg-navy-800 hover:bg-navy-700"
                  data-testid="add-branch-button"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Branch
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-navy-50">
                      <TableHead className="font-semibold text-navy-700">Name</TableHead>
                      <TableHead className="font-semibold text-navy-700">Code</TableHead>
                      <TableHead className="font-semibold text-navy-700">Address</TableHead>
                      <TableHead className="font-semibold text-navy-700">Return Address</TableHead>
                      <TableHead className="font-semibold text-navy-700">Contact</TableHead>
                      {isSuperAdmin && (
                        <TableHead className="font-semibold text-navy-700 w-20">Actions</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center py-8 text-navy-500">
                          No branches configured
                        </TableCell>
                      </TableRow>
                    ) : (
                      branches.map((branch) => (
                        <TableRow key={branch.id} className="hover:bg-navy-50" data-testid={`branch-row-${branch.id}`}>
                          <TableCell className="font-medium text-navy-800">{branch.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-navy-50">
                              {branch.code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-navy-600 max-w-[200px] truncate" title={branch.address}>
                            {branch.address}
                          </TableCell>
                          <TableCell className="text-navy-600 max-w-[200px] truncate" title={branch.return_address}>
                            {branch.return_address}
                          </TableCell>
                          <TableCell className="text-navy-600">
                            <div className="text-sm">
                              {branch.phone && <div>{branch.phone}</div>}
                              {branch.email && <div className="text-navy-500">{branch.email}</div>}
                              {!branch.phone && !branch.email && '-'}
                            </div>
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openBranchDialog(branch)}
                                className="h-8 w-8 p-0 hover:bg-navy-100"
                                data-testid={`edit-branch-${branch.id}`}
                              >
                                <Pencil className="h-4 w-4 text-navy-600" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Addresses Section */}
          <Card className="border-navy-100">
            <CardHeader>
              <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
                <Building className="h-5 w-5" />
                Addresses
              </CardTitle>
              <CardDescription>Manage shipment addresses (labs, offices, etc.)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="New address name..."
                  value={newAddressName}
                  onChange={(e) => setNewAddressName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddAddress(); }}
                  className="w-64 border-navy-200"
                  data-testid="new-address-input"
                />
                <Button
                  onClick={handleAddAddress}
                  disabled={savingAddress || !newAddressName.trim()}
                  className="bg-navy-800 hover:bg-navy-700"
                  data-testid="add-address-button"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-navy-50">
                      <TableHead className="font-semibold text-navy-700">Address Name</TableHead>
                      <TableHead className="font-semibold text-navy-700 w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {addresses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center py-6 text-navy-500">
                          No addresses configured
                        </TableCell>
                      </TableRow>
                    ) : (
                      addresses.map((addr) => (
                        <TableRow key={addr.id} className="hover:bg-navy-50">
                          <TableCell className="font-medium text-navy-800">
                            {editingAddress?.id === addr.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editAddressName}
                                  onChange={(e) => setEditAddressName(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateAddress(); }}
                                  className="w-64"
                                  autoFocus
                                />
                              </div>
                            ) : (
                              addr.name
                            )}
                          </TableCell>
                          <TableCell>
                            {editingAddress?.id === addr.id ? (
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" onClick={handleUpdateAddress} disabled={savingAddress} className="h-8 w-8 p-0">
                                  <Save className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditingAddress(null)} className="h-8 w-8 p-0">
                                  <X className="h-4 w-4 text-navy-500" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setEditingAddress(addr); setEditAddressName(addr.name); }}
                                className="h-8 w-8 p-0 hover:bg-navy-100"
                                data-testid={`edit-address-${addr.id}`}
                              >
                                <Pencil className="h-4 w-4 text-navy-600" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== PRICING TAB ==================== */}
        <TabsContent value="pricing" className="space-y-6">
          <Card className="border-navy-100">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Pricing Configuration
                </CardTitle>
                <CardDescription>Configure service fees based on stone value brackets</CardDescription>
              </div>
              {!editingPricing ? (
                <Button
                  onClick={handleStartEditPricing}
                  variant="outline"
                  className="border-navy-200"
                  data-testid="edit-pricing-button"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Pricing
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    onClick={handleCancelEditPricing}
                    variant="outline"
                    className="border-navy-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSavePricing}
                    disabled={savingPricing}
                    className="bg-navy-800 hover:bg-navy-700"
                    data-testid="save-pricing-button"
                  >
                    {savingPricing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pricing Brackets Table */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-navy-800">Value Brackets</h3>
                  {editingPricing && (
                    <Button
                      onClick={addBracket}
                      variant="outline"
                      size="sm"
                      className="border-navy-200"
                      data-testid="add-bracket-button"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Bracket
                    </Button>
                  )}
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-navy-50">
                        <TableHead className="font-semibold text-navy-700">Min Value (USD)</TableHead>
                        <TableHead className="font-semibold text-navy-700">Max Value (USD)</TableHead>
                        {(editingPricing ? pricingForm.service_types : pricing.service_types).map((st) => (
                          <TableHead key={st} className="font-semibold text-navy-700">{st}</TableHead>
                        ))}
                        {editingPricing && <TableHead className="w-16"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(editingPricing ? pricingForm.brackets : pricing.brackets).map((bracket, index) => (
                        <TableRow key={index} className="hover:bg-navy-50" data-testid={`pricing-bracket-${index}`}>
                          <TableCell>
                            {editingPricing ? (
                              <Input
                                type="number"
                                value={bracket.min_value}
                                onChange={(e) => updateBracket(index, 'min_value', parseFloat(e.target.value) || 0)}
                                className="w-28"
                              />
                            ) : (
                              <span className="font-medium">${bracket.min_value.toLocaleString()}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingPricing ? (
                              <Input
                                type="number"
                                value={bracket.max_value}
                                onChange={(e) => updateBracket(index, 'max_value', parseFloat(e.target.value) || 0)}
                                className="w-28"
                              />
                            ) : (
                              <span className="font-medium">${bracket.max_value.toLocaleString()}</span>
                            )}
                          </TableCell>
                          {(editingPricing ? pricingForm.service_types : pricing.service_types).map((st) => (
                            <TableCell key={st}>
                              {editingPricing ? (
                                <Input
                                  type="number"
                                  value={bracket.fees?.[st] ?? 0}
                                  onChange={(e) => updateBracket(index, st, parseFloat(e.target.value) || 0)}
                                  className="w-24"
                                  data-testid={`bracket-${index}-${st.toLowerCase()}-fee`}
                                />
                              ) : (
                                <Badge className="bg-navy-100 text-navy-800">${bracket.fees?.[st] ?? 0}</Badge>
                              )}
                            </TableCell>
                          ))}
                          {editingPricing && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeBracket(index)}
                                className="h-8 w-8 p-0 hover:bg-red-50"
                                data-testid={`remove-bracket-${index}`}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Service Types */}
              <div className="p-4 bg-navy-50 rounded-lg">
                <Label className="text-sm font-medium text-navy-800">Available Service Types</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(editingPricing ? pricingForm.service_types : pricing.service_types).map((type) => (
                    <Badge key={type} className="bg-navy-800 text-white flex items-center gap-1">
                      {type}
                      {editingPricing && !usedServiceTypes.has(type) && (
                        <button
                          onClick={() => handleDeleteServiceType(type)}
                          className="ml-1 hover:text-red-300"
                          title={`Remove ${type}`}
                          data-testid={`delete-service-type-${type.toLowerCase()}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
                {editingPricing && (
                  <div className="flex items-center gap-2 mt-3">
                    <Input
                      placeholder="New service type..."
                      value={newServiceType}
                      onChange={(e) => setNewServiceType(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddServiceType();
                        }
                      }}
                      className="w-48 h-8 text-sm border-navy-200"
                      data-testid="new-service-type-input"
                    />
                    <Button
                      onClick={handleAddServiceType}
                      disabled={!newServiceType.trim()}
                      size="sm"
                      className="bg-navy-800 hover:bg-navy-700 h-8"
                      data-testid="add-service-type-button"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                )}
              </div>

              {/* Additional Fees */}
              <div className="p-4 bg-navy-50 rounded-lg space-y-4">
                <Label className="text-sm font-semibold text-navy-800">Additional Fees</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-navy-600">Color Stability Test (USD)</Label>
                    {editingPricing ? (
                      <Input
                        type="number"
                        value={pricingForm.color_stability_fee}
                        onChange={(e) => setPricingForm({ ...pricingForm, color_stability_fee: parseFloat(e.target.value) || 0 })}
                        className="mt-1 w-32"
                        data-testid="color-stability-fee-input"
                      />
                    ) : (
                      <p className="text-xl font-bold text-navy-900 mt-1">${pricing.color_stability_fee}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm text-navy-600">Mounted Jewellery (USD)</Label>
                    {editingPricing ? (
                      <Input
                        type="number"
                        value={pricingForm.mounted_jewellery_fee}
                        onChange={(e) => setPricingForm({ ...pricingForm, mounted_jewellery_fee: parseFloat(e.target.value) || 0 })}
                        className="mt-1 w-32"
                        data-testid="mounted-jewellery-fee-input"
                      />
                    ) : (
                      <p className="text-xl font-bold text-navy-900 mt-1">${pricing.mounted_jewellery_fee}</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== ADMIN USERS TAB ==================== */}
        {isSuperAdmin && (
        <TabsContent value="admins" className="space-y-6">
          <Card className="border-navy-100">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Admin Users
                </CardTitle>
                <CardDescription>Manage admin accounts and access levels</CardDescription>
              </div>
              <Button
                onClick={() => openAdminDialog()}
                className="bg-navy-800 hover:bg-navy-700"
                data-testid="add-admin-button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Admin
              </Button>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-navy-50">
                      <TableHead className="font-semibold text-navy-700">Name</TableHead>
                      <TableHead className="font-semibold text-navy-700">Email</TableHead>
                      <TableHead className="font-semibold text-navy-700">Role</TableHead>
                      <TableHead className="font-semibold text-navy-700">Branch</TableHead>
                      <TableHead className="font-semibold text-navy-700 w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-navy-500">
                          No admin users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      adminUsers.map((admin) => (
                        <TableRow key={admin.id} className="hover:bg-navy-50" data-testid={`admin-row-${admin.id}`}>
                          <TableCell className="font-medium text-navy-800">{admin.full_name}</TableCell>
                          <TableCell className="text-navy-600">{admin.email}</TableCell>
                          <TableCell>
                            {admin.role === 'super_admin' ? (
                              <Badge className="bg-purple-100 text-purple-800">Super Admin</Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-800">Branch Admin</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-navy-600">
                            {admin.role === 'super_admin'
                              ? 'Global'
                              : branches.find(b => b.id === admin.branch_id)?.name || '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openAdminDialog(admin)}
                              className="h-8 w-8 p-0 hover:bg-navy-100"
                              data-testid={`edit-admin-${admin.id}`}
                            >
                              <Pencil className="h-4 w-4 text-navy-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>

      {/* ==================== ADMIN USER DIALOG ==================== */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800">
              {editingAdmin ? 'Edit Admin User' : 'Create Admin User'}
            </DialogTitle>
            <DialogDescription>
              {editingAdmin ? 'Update admin account details' : 'Create a new admin account'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={adminForm.full_name}
                onChange={(e) => setAdminForm({ ...adminForm, full_name: e.target.value })}
                placeholder="Enter full name"
                className="border-navy-200"
                data-testid="admin-name-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={adminForm.email}
                onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                placeholder="Enter email"
                className="border-navy-200"
                disabled={!!editingAdmin}
                data-testid="admin-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label>{editingAdmin ? 'New Password (leave empty to keep current)' : 'Password *'}</Label>
              <Input
                type="password"
                value={adminForm.password}
                onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                placeholder={editingAdmin ? 'Leave empty to keep current' : 'Enter password'}
                className="border-navy-200"
                data-testid="admin-password-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Access Level *</Label>
              <Select
                value={adminForm.role}
                onValueChange={(v) => setAdminForm({ ...adminForm, role: v, branch_id: v === 'super_admin' ? '' : adminForm.branch_id })}
              >
                <SelectTrigger data-testid="admin-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin (Global)</SelectItem>
                  <SelectItem value="branch_admin">Branch Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {adminForm.role === 'branch_admin' && (
              <div className="space-y-2">
                <Label>Branch *</Label>
                <Select
                  value={adminForm.branch_id}
                  onValueChange={(v) => setAdminForm({ ...adminForm, branch_id: v })}
                >
                  <SelectTrigger data-testid="admin-branch-select">
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
            )}

            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={adminForm.phone}
                onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                placeholder="Phone number (optional)"
                className="border-navy-200"
                data-testid="admin-phone-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAdmin}
              disabled={savingAdmin || !adminForm.full_name || !adminForm.email || !adminForm.role || (!editingAdmin && !adminForm.password)}
              className="bg-navy-800 hover:bg-navy-700"
              data-testid="confirm-save-admin-button"
            >
              {savingAdmin ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                editingAdmin ? 'Save Changes' : 'Create Admin'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== ADD DROPDOWN OPTION DIALOG ==================== */}
      <Dialog open={addOptionDialogOpen} onOpenChange={setAddOptionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800">
              Add {selectedField.charAt(0).toUpperCase() + selectedField.slice(1)} Option
            </DialogTitle>
            <DialogDescription>
              Add a new dropdown value for the {selectedField} field
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="optionValue">Value *</Label>
              <Input
                id="optionValue"
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                placeholder="Enter option value"
                className="border-navy-200"
                data-testid="new-option-value-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Stone Type Filter</Label>
              <p className="text-sm text-navy-500 mb-2">
                Select which stone types this option applies to
              </p>
              <div className="flex flex-wrap gap-2">
                {STONE_TYPES.map((type) => (
                  <Badge
                    key={type}
                    variant={newOptionStoneTypes.includes(type) ? 'default' : 'outline'}
                    className={`cursor-pointer ${
                      newOptionStoneTypes.includes(type)
                        ? 'bg-navy-800 hover:bg-navy-700'
                        : 'hover:bg-navy-100'
                    }`}
                    onClick={() => toggleStoneType(type, newOptionStoneTypes, setNewOptionStoneTypes)}
                  >
                    {type}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOptionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddOption}
              disabled={savingDropdown || !newOptionValue.trim()}
              className="bg-navy-800 hover:bg-navy-700"
              data-testid="confirm-add-option-button"
            >
              {savingDropdown ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Option'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== BRANCH DIALOG ==================== */}
      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800">
              {editingBranch ? 'Edit Branch' : 'Add New Branch'}
            </DialogTitle>
            <DialogDescription>
              {editingBranch ? 'Update branch information' : 'Create a new office location'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branchName">Name *</Label>
                <Input
                  id="branchName"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder="e.g., Israel Office"
                  className="border-navy-200"
                  data-testid="branch-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchCode">Code *</Label>
                <Input
                  id="branchCode"
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., IL"
                  maxLength={5}
                  className="border-navy-200"
                  data-testid="branch-code-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchAddress">Address *</Label>
              <Textarea
                id="branchAddress"
                value={branchForm.address}
                onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                placeholder="Full office address"
                className="border-navy-200 min-h-[60px]"
                data-testid="branch-address-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchReturnAddress">Return Address *</Label>
              <Textarea
                id="branchReturnAddress"
                value={branchForm.return_address}
                onChange={(e) => setBranchForm({ ...branchForm, return_address: e.target.value })}
                placeholder="Address for return shipments"
                className="border-navy-200 min-h-[60px]"
                data-testid="branch-return-address-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branchPhone">Phone</Label>
                <Input
                  id="branchPhone"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                  className="border-navy-200"
                  data-testid="branch-phone-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchEmail">Email</Label>
                <Input
                  id="branchEmail"
                  type="email"
                  value={branchForm.email}
                  onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                  placeholder="office@example.com"
                  className="border-navy-200"
                  data-testid="branch-email-input"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveBranch}
              disabled={savingBranch || !branchForm.name || !branchForm.code || !branchForm.address || !branchForm.return_address}
              className="bg-navy-800 hover:bg-navy-700"
              data-testid="confirm-save-branch-button"
            >
              {savingBranch ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                editingBranch ? 'Save Changes' : 'Create Branch'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
