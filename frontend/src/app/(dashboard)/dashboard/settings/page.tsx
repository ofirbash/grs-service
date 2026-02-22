"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { settingsApi, branchesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Settings,
  User,
  Building,
  DollarSign,
  List,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Save,
  ChevronRight,
} from 'lucide-react';

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

const STONE_TYPES = ['Emerald', 'Sapphire', 'Ruby'];

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'dropdowns' | 'branches' | 'pricing'>('profile');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dropdown settings state
  const [dropdownSettings, setDropdownSettings] = useState<DropdownSettings>({
    identification: [],
    color: [],
    origin: [],
    comment: []
  });
  const [selectedField, setSelectedField] = useState<keyof DropdownSettings>('identification');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<DropdownOption | null>(null);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [newOptionStoneTypes, setNewOptionStoneTypes] = useState<string[]>(['all']);

  // Branches state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchFormData, setBranchFormData] = useState({
    name: '',
    code: '',
    address: '',
    return_address: '',
    phone: '',
    email: ''
  });

  // Pricing state
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>({
    brackets: [],
    color_stability_fee: 50,
    service_types: ['Express', 'Normal', 'Recheck']
  });
  const [newServiceType, setNewServiceType] = useState('');

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'dropdowns') {
        const data = await settingsApi.getDropdowns();
        setDropdownSettings(data);
      } else if (activeTab === 'branches') {
        const data = await branchesApi.getAll();
        setBranches(data);
      } else if (activeTab === 'pricing') {
        const data = await settingsApi.getPricing();
        setPricingConfig(data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Dropdown handlers
  const handleAddOption = () => {
    setEditingOption(null);
    setNewOptionValue('');
    setNewOptionStoneTypes(['all']);
    setEditDialogOpen(true);
  };

  const handleEditOption = (option: DropdownOption) => {
    setEditingOption(option);
    setNewOptionValue(option.value);
    setNewOptionStoneTypes(option.stone_types);
    setEditDialogOpen(true);
  };

  const handleSaveOption = async () => {
    if (!newOptionValue.trim()) return;
    
    setSaving(true);
    try {
      const currentOptions = [...dropdownSettings[selectedField]];
      
      if (editingOption) {
        // Update existing
        const idx = currentOptions.findIndex(o => o.value === editingOption.value);
        if (idx >= 0) {
          currentOptions[idx] = { value: newOptionValue, stone_types: newOptionStoneTypes };
        }
      } else {
        // Add new
        currentOptions.push({ value: newOptionValue, stone_types: newOptionStoneTypes });
      }
      
      await settingsApi.updateDropdownField(selectedField, currentOptions);
      setDropdownSettings(prev => ({ ...prev, [selectedField]: currentOptions }));
      setEditDialogOpen(false);
    } catch (error) {
      console.error('Failed to save option:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOption = async (option: DropdownOption) => {
    if (!confirm(`Delete "${option.value}"?`)) return;
    
    setSaving(true);
    try {
      const currentOptions = dropdownSettings[selectedField].filter(o => o.value !== option.value);
      await settingsApi.updateDropdownField(selectedField, currentOptions);
      setDropdownSettings(prev => ({ ...prev, [selectedField]: currentOptions }));
    } catch (error) {
      console.error('Failed to delete option:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleStoneType = (stoneType: string) => {
    if (stoneType === 'all') {
      setNewOptionStoneTypes(['all']);
    } else {
      let newTypes = newOptionStoneTypes.filter(t => t !== 'all');
      if (newTypes.includes(stoneType)) {
        newTypes = newTypes.filter(t => t !== stoneType);
      } else {
        newTypes.push(stoneType);
      }
      if (newTypes.length === 0) {
        newTypes = ['all'];
      }
      setNewOptionStoneTypes(newTypes);
    }
  };

  // Branch handlers
  const handleOpenBranchDialog = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setBranchFormData({
        name: branch.name,
        code: branch.code,
        address: branch.address,
        return_address: branch.return_address,
        phone: branch.phone || '',
        email: branch.email || ''
      });
    } else {
      setEditingBranch(null);
      setBranchFormData({ name: '', code: '', address: '', return_address: '', phone: '', email: '' });
    }
    setBranchDialogOpen(true);
  };

  const handleSaveBranch = async () => {
    if (!branchFormData.name || !branchFormData.code) return;
    
    setSaving(true);
    try {
      if (editingBranch) {
        await branchesApi.update(editingBranch.id, branchFormData);
      } else {
        await branchesApi.create(branchFormData);
      }
      setBranchDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Failed to save branch:', error);
    } finally {
      setSaving(false);
    }
  };

  // Pricing handlers
  const handleAddBracket = () => {
    const lastBracket = pricingConfig.brackets[pricingConfig.brackets.length - 1];
    const newMin = lastBracket ? lastBracket.max_value + 1 : 0;
    setPricingConfig(prev => ({
      ...prev,
      brackets: [...prev.brackets, {
        min_value: newMin,
        max_value: newMin + 9999,
        express_fee: 0,
        normal_fee: 0,
        recheck_fee: 0
      }]
    }));
  };

  const handleUpdateBracket = (index: number, field: keyof PricingBracket, value: number) => {
    setPricingConfig(prev => ({
      ...prev,
      brackets: prev.brackets.map((b, i) => i === index ? { ...b, [field]: value } : b)
    }));
  };

  const handleDeleteBracket = (index: number) => {
    setPricingConfig(prev => ({
      ...prev,
      brackets: prev.brackets.filter((_, i) => i !== index)
    }));
  };

  const handleAddServiceType = () => {
    if (!newServiceType.trim()) return;
    setPricingConfig(prev => ({
      ...prev,
      service_types: [...prev.service_types, newServiceType.trim()]
    }));
    setNewServiceType('');
  };

  const handleRemoveServiceType = (serviceType: string) => {
    setPricingConfig(prev => ({
      ...prev,
      service_types: prev.service_types.filter(s => s !== serviceType)
    }));
  };

  const handleSavePricing = async () => {
    setSaving(true);
    try {
      await settingsApi.updatePricing(pricingConfig);
      alert('Pricing configuration saved!');
    } catch (error) {
      console.error('Failed to save pricing:', error);
      alert('Failed to save pricing configuration');
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-800">Settings</h1>
        <p className="text-navy-600">Manage system configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-200 pb-2">
        <Button
          variant={activeTab === 'profile' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('profile')}
          className={activeTab === 'profile' ? 'bg-navy-800' : ''}
        >
          <User className="h-4 w-4 mr-2" />
          Profile
        </Button>
        {isAdmin && (
          <>
            <Button
              variant={activeTab === 'dropdowns' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('dropdowns')}
              className={activeTab === 'dropdowns' ? 'bg-navy-800' : ''}
            >
              <List className="h-4 w-4 mr-2" />
              Verbal Dropdowns
            </Button>
            <Button
              variant={activeTab === 'branches' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('branches')}
              className={activeTab === 'branches' ? 'bg-navy-800' : ''}
            >
              <Building className="h-4 w-4 mr-2" />
              Branches
            </Button>
            <Button
              variant={activeTab === 'pricing' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('pricing')}
              className={activeTab === 'pricing' ? 'bg-navy-800' : ''}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Pricing
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-navy-600" />
        </div>
      ) : (
        <>
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <Card className="border-navy-100">
              <CardHeader>
                <CardTitle className="text-navy-800">Profile Information</CardTitle>
                <CardDescription>Your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-navy-600">Full Name</Label>
                    <p className="text-navy-800 font-medium">{user?.full_name || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-navy-600">Email</Label>
                    <p className="text-navy-800 font-medium">{user?.email || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-navy-600">Role</Label>
                    <Badge variant="secondary" className="mt-1">{user?.role || 'N/A'}</Badge>
                  </div>
                  <div>
                    <Label className="text-navy-600">User ID</Label>
                    <p className="text-navy-500 text-sm font-mono">{user?.id || 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Verbal Dropdowns Tab */}
          {activeTab === 'dropdowns' && isAdmin && (
            <div className="space-y-4">
              <Card className="border-navy-100">
                <CardHeader>
                  <CardTitle className="text-navy-800">Verbal Findings Dropdowns</CardTitle>
                  <CardDescription>Manage dropdown values for verbal findings. Assign values to specific stone types (Emerald, Sapphire, Ruby) or make them available for all.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-4">
                    {(['identification', 'color', 'origin', 'comment'] as const).map((field) => (
                      <Button
                        key={field}
                        variant={selectedField === field ? 'default' : 'outline'}
                        onClick={() => setSelectedField(field)}
                        className={selectedField === field ? 'bg-navy-800' : ''}
                        size="sm"
                      >
                        {field.charAt(0).toUpperCase() + field.slice(1)}
                        <Badge variant="secondary" className="ml-2">{dropdownSettings[field].length}</Badge>
                      </Button>
                    ))}
                  </div>

                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-navy-800">{selectedField.charAt(0).toUpperCase() + selectedField.slice(1)} Values</h3>
                    <Button onClick={handleAddOption} size="sm" className="bg-navy-800 hover:bg-navy-700">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Value
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow className="bg-navy-50">
                        <TableHead className="font-semibold text-navy-700">Value</TableHead>
                        <TableHead className="font-semibold text-navy-700">Stone Types</TableHead>
                        <TableHead className="font-semibold text-navy-700 w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dropdownSettings[selectedField].map((option, idx) => (
                        <TableRow key={idx} className="hover:bg-navy-50">
                          <TableCell className="font-medium text-navy-800">{option.value}</TableCell>
                          <TableCell>
                            {option.stone_types.includes('all') ? (
                              <Badge variant="secondary">All Stone Types</Badge>
                            ) : (
                              <div className="flex gap-1 flex-wrap">
                                {option.stone_types.map(st => (
                                  <Badge key={st} variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">{st}</Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleEditOption(option)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteOption(option)} className="text-red-600 hover:text-red-700">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {dropdownSettings[selectedField].length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-navy-500 py-8">
                            No values defined. Click &quot;Add Value&quot; to create one.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Branches Tab */}
          {activeTab === 'branches' && isAdmin && (
            <Card className="border-navy-100">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-navy-800">Branches</CardTitle>
                  <CardDescription>Manage branch locations and addresses</CardDescription>
                </div>
                <Button onClick={() => handleOpenBranchDialog()} className="bg-navy-800 hover:bg-navy-700">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Branch
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-navy-50">
                      <TableHead className="font-semibold text-navy-700">Name</TableHead>
                      <TableHead className="font-semibold text-navy-700">Code</TableHead>
                      <TableHead className="font-semibold text-navy-700">Address</TableHead>
                      <TableHead className="font-semibold text-navy-700">Return Address</TableHead>
                      <TableHead className="font-semibold text-navy-700">Contact</TableHead>
                      <TableHead className="font-semibold text-navy-700 w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.map((branch) => (
                      <TableRow key={branch.id} className="hover:bg-navy-50">
                        <TableCell className="font-medium text-navy-800">{branch.name}</TableCell>
                        <TableCell><Badge variant="secondary">{branch.code}</Badge></TableCell>
                        <TableCell className="text-navy-600 max-w-xs truncate">{branch.address}</TableCell>
                        <TableCell className="text-navy-600 max-w-xs truncate">{branch.return_address}</TableCell>
                        <TableCell className="text-navy-600">
                          {branch.phone && <div>{branch.phone}</div>}
                          {branch.email && <div className="text-sm">{branch.email}</div>}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleOpenBranchDialog(branch)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {branches.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-navy-500 py-8">
                          No branches defined. Click &quot;Add Branch&quot; to create one.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Pricing Tab */}
          {activeTab === 'pricing' && isAdmin && (
            <div className="space-y-4">
              {/* Service Types */}
              <Card className="border-navy-100">
                <CardHeader>
                  <CardTitle className="text-navy-800">Service Types</CardTitle>
                  <CardDescription>Define available service types</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {pricingConfig.service_types.map((st) => (
                      <Badge key={st} variant="secondary" className="text-sm py-1 px-3">
                        {st}
                        <button onClick={() => handleRemoveServiceType(st)} className="ml-2 text-red-500 hover:text-red-700">
                          &times;
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="New service type..."
                      value={newServiceType}
                      onChange={(e) => setNewServiceType(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button onClick={handleAddServiceType} variant="outline">
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Price Brackets */}
              <Card className="border-navy-100">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-navy-800">Price Brackets</CardTitle>
                    <CardDescription>Set fees based on declared stone value</CardDescription>
                  </div>
                  <Button onClick={handleAddBracket} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Bracket
                  </Button>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-navy-50">
                        <TableHead className="font-semibold text-navy-700">Min Value ($)</TableHead>
                        <TableHead className="font-semibold text-navy-700">Max Value ($)</TableHead>
                        <TableHead className="font-semibold text-navy-700">Express Fee ($)</TableHead>
                        <TableHead className="font-semibold text-navy-700">Normal Fee ($)</TableHead>
                        <TableHead className="font-semibold text-navy-700">Recheck Fee ($)</TableHead>
                        <TableHead className="font-semibold text-navy-700 w-16">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pricingConfig.brackets.map((bracket, idx) => (
                        <TableRow key={idx} className="hover:bg-navy-50">
                          <TableCell>
                            <Input
                              type="number"
                              value={bracket.min_value}
                              onChange={(e) => handleUpdateBracket(idx, 'min_value', parseFloat(e.target.value) || 0)}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={bracket.max_value}
                              onChange={(e) => handleUpdateBracket(idx, 'max_value', parseFloat(e.target.value) || 0)}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={bracket.express_fee}
                              onChange={(e) => handleUpdateBracket(idx, 'express_fee', parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={bracket.normal_fee}
                              onChange={(e) => handleUpdateBracket(idx, 'normal_fee', parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={bracket.recheck_fee}
                              onChange={(e) => handleUpdateBracket(idx, 'recheck_fee', parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteBracket(idx)} className="text-red-600 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {pricingConfig.brackets.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-navy-500 py-8">
                            No price brackets defined. Click &quot;Add Bracket&quot; to create one.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Color Stability Fee */}
              <Card className="border-navy-100">
                <CardHeader>
                  <CardTitle className="text-navy-800">Additional Fees</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Label className="text-navy-600">Color Stability Test Fee ($)</Label>
                    <Input
                      type="number"
                      value={pricingConfig.color_stability_fee}
                      onChange={(e) => setPricingConfig(prev => ({ ...prev, color_stability_fee: parseFloat(e.target.value) || 0 }))}
                      className="w-32"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button onClick={handleSavePricing} disabled={saving} className="bg-navy-800 hover:bg-navy-700">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Pricing Configuration
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Dropdown Option Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy-800">
              {editingOption ? 'Edit Value' : 'Add New Value'}
            </DialogTitle>
            <DialogDescription>
              {selectedField.charAt(0).toUpperCase() + selectedField.slice(1)} dropdown option
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                placeholder={`Enter ${selectedField} value...`}
                className="border-navy-200"
              />
            </div>

            <div className="space-y-2">
              <Label>Available for Stone Types</Label>
              <p className="text-sm text-navy-500">Select which stone types can use this value. Leave as &quot;All&quot; for universal availability.</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge
                  variant={newOptionStoneTypes.includes('all') ? 'default' : 'outline'}
                  className={`cursor-pointer ${newOptionStoneTypes.includes('all') ? 'bg-navy-800' : ''}`}
                  onClick={() => toggleStoneType('all')}
                >
                  All Types
                </Badge>
                {STONE_TYPES.map((st) => (
                  <Badge
                    key={st}
                    variant={newOptionStoneTypes.includes(st) ? 'default' : 'outline'}
                    className={`cursor-pointer ${newOptionStoneTypes.includes(st) && !newOptionStoneTypes.includes('all') ? 'bg-amber-600' : ''}`}
                    onClick={() => toggleStoneType(st)}
                  >
                    {st}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveOption} disabled={saving || !newOptionValue.trim()} className="bg-navy-800 hover:bg-navy-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branch Dialog */}
      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-navy-800">
              {editingBranch ? 'Edit Branch' : 'Add New Branch'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Branch Name *</Label>
                <Input
                  value={branchFormData.name}
                  onChange={(e) => setBranchFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Israel Office"
                  className="border-navy-200"
                />
              </div>
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input
                  value={branchFormData.code}
                  onChange={(e) => setBranchFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g., IL"
                  className="border-navy-200"
                  maxLength={5}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                value={branchFormData.address}
                onChange={(e) => setBranchFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Full address..."
                className="border-navy-200"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Return Address</Label>
              <Textarea
                value={branchFormData.return_address}
                onChange={(e) => setBranchFormData(prev => ({ ...prev, return_address: e.target.value }))}
                placeholder="Return shipping address..."
                className="border-navy-200"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={branchFormData.phone}
                  onChange={(e) => setBranchFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+1 234 567 8900"
                  className="border-navy-200"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={branchFormData.email}
                  onChange={(e) => setBranchFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="branch@example.com"
                  className="border-navy-200"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveBranch} disabled={saving || !branchFormData.name || !branchFormData.code} className="bg-navy-800 hover:bg-navy-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
