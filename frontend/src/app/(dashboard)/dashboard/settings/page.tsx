"use client";

import { useEffect, useState } from 'react';
import { settingsApi, branchesApi } from '@/lib/api';
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
  express_fee: number;
  normal_fee: number;
  recheck_fee: number;
}

interface PricingConfig {
  brackets: PricingBracket[];
  color_stability_fee: number;
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
    service_types: ['Express', 'Normal', 'Recheck'],
  });
  const [editingPricing, setEditingPricing] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingForm, setPricingForm] = useState<PricingConfig>({
    brackets: [],
    color_stability_fee: 50,
    service_types: [],
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [dropdownsData, branchesData, pricingData] = await Promise.all([
        settingsApi.getDropdowns(),
        branchesApi.getAll(),
        settingsApi.getPricing(),
      ]);
      setDropdowns(dropdownsData);
      setBranches(branchesData);
      setPricing(pricingData);
      setPricingForm(pricingData);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      toast.error('Failed to load settings');
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
      toast.success('Option added successfully');
    } catch (error) {
      console.error('Failed to add option:', error);
      toast.error('Failed to add option');
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
      toast.success('Option updated successfully');
    } catch (error) {
      console.error('Failed to update option:', error);
      toast.error('Failed to update option');
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
      toast.success('Option deleted successfully');
    } catch (error) {
      console.error('Failed to delete option:', error);
      toast.error('Failed to delete option');
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
      toast.error('Please fill in all required fields');
      return;
    }

    setSavingBranch(true);
    try {
      if (editingBranch) {
        await branchesApi.update(editingBranch.id, branchForm);
        toast.success('Branch updated successfully');
      } else {
        await branchesApi.create(branchForm);
        toast.success('Branch created successfully');
      }
      setBranchDialogOpen(false);
      fetchAllData();
    } catch (error) {
      console.error('Failed to save branch:', error);
      toast.error('Failed to save branch');
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
      toast.success('Pricing updated successfully');
    } catch (error) {
      console.error('Failed to save pricing:', error);
      toast.error('Failed to save pricing');
    } finally {
      setSavingPricing(false);
    }
  };

  const updateBracket = (index: number, field: keyof PricingBracket, value: number) => {
    const newBrackets = [...pricingForm.brackets];
    newBrackets[index] = { ...newBrackets[index], [field]: value };
    setPricingForm({ ...pricingForm, brackets: newBrackets });
  };

  const addBracket = () => {
    const lastBracket = pricingForm.brackets[pricingForm.brackets.length - 1];
    const newBracket: PricingBracket = {
      min_value: lastBracket ? lastBracket.max_value + 1 : 0,
      max_value: lastBracket ? lastBracket.max_value + 10000 : 9999.99,
      express_fee: 100,
      normal_fee: 80,
      recheck_fee: 40,
    };
    setPricingForm({ ...pricingForm, brackets: [...pricingForm.brackets, newBracket] });
  };

  const removeBracket = (index: number) => {
    if (pricingForm.brackets.length <= 1) {
      toast.error('At least one pricing bracket is required');
      return;
    }
    const newBrackets = pricingForm.brackets.filter((_, i) => i !== index);
    setPricingForm({ ...pricingForm, brackets: newBrackets });
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
              {/* Field Selector */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Select Field</Label>
                  <Select value={selectedField} onValueChange={(v) => setSelectedField(v as typeof DROPDOWN_FIELDS[number])}>
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
                    {dropdowns[selectedField].length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-navy-500">
                          No options configured for this field
                        </TableCell>
                      </TableRow>
                    ) : (
                      dropdowns[selectedField].map((option, index) => (
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
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <p className="text-sm text-navy-500">
                Total: {dropdowns[selectedField].length} options
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
              {/* Color Stability Fee */}
              <div className="p-4 bg-navy-50 rounded-lg">
                <Label className="text-sm font-medium text-navy-800">Color Stability Test Fee (USD)</Label>
                {editingPricing ? (
                  <Input
                    type="number"
                    value={pricingForm.color_stability_fee}
                    onChange={(e) => setPricingForm({ ...pricingForm, color_stability_fee: parseFloat(e.target.value) || 0 })}
                    className="mt-2 w-32"
                    data-testid="color-stability-fee-input"
                  />
                ) : (
                  <p className="text-2xl font-bold text-navy-900 mt-1">${pricing.color_stability_fee}</p>
                )}
                <p className="text-sm text-navy-500 mt-1">Added to stone fee when color stability test is requested</p>
              </div>

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
                        <TableHead className="font-semibold text-navy-700">Express Fee</TableHead>
                        <TableHead className="font-semibold text-navy-700">Normal Fee</TableHead>
                        <TableHead className="font-semibold text-navy-700">Recheck Fee</TableHead>
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
                          <TableCell>
                            {editingPricing ? (
                              <Input
                                type="number"
                                value={bracket.express_fee}
                                onChange={(e) => updateBracket(index, 'express_fee', parseFloat(e.target.value) || 0)}
                                className="w-24"
                              />
                            ) : (
                              <Badge className="bg-red-100 text-red-800">${bracket.express_fee}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingPricing ? (
                              <Input
                                type="number"
                                value={bracket.normal_fee}
                                onChange={(e) => updateBracket(index, 'normal_fee', parseFloat(e.target.value) || 0)}
                                className="w-24"
                              />
                            ) : (
                              <Badge className="bg-blue-100 text-blue-800">${bracket.normal_fee}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingPricing ? (
                              <Input
                                type="number"
                                value={bracket.recheck_fee}
                                onChange={(e) => updateBracket(index, 'recheck_fee', parseFloat(e.target.value) || 0)}
                                className="w-24"
                              />
                            ) : (
                              <Badge className="bg-green-100 text-green-800">${bracket.recheck_fee}</Badge>
                            )}
                          </TableCell>
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
                    <Badge key={type} className="bg-navy-800 text-white">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
