import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export interface NewStoneDraft {
  stone_type: string;
  weight: string;
  value: string;
  shape: string;
}

interface GroupStonesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  saving: boolean;
  onConfirm: () => void;
}

export const GroupStonesDialog: React.FC<GroupStonesDialogProps> = ({
  open, onOpenChange, selectedCount, saving, onConfirm,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-lg text-navy-900">Group Stones for Certificate</DialogTitle>
        <DialogDescription>
          Create a certificate group for {selectedCount} selected stone(s).
          Maximum 30 stones per certificate.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4">
        <p className="text-sm text-navy-600">
          Selected stones will be grouped together and assigned to a single certificate.
        </p>
        {selectedCount > 30 && (
          <p className="text-sm text-red-600 mt-2">
            Warning: Maximum 30 stones per certificate. Please deselect some stones.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={onConfirm}
          disabled={saving || selectedCount === 0 || selectedCount > 30}
          className="bg-navy-900 hover:bg-navy-800"
          data-testid="confirm-group-button"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Grouping...</>
          ) : 'Create Certificate Group'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

interface AddStoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobNumber?: number;
  stoneTypes: string[];
  shapes: string[];
  newStone: NewStoneDraft;
  setNewStone: (s: NewStoneDraft) => void;
  adding: boolean;
  onConfirm: () => void;
}

export const AddStoneDialog: React.FC<AddStoneDialogProps> = ({
  open, onOpenChange, jobNumber, stoneTypes, shapes,
  newStone, setNewStone, adding, onConfirm,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add Stone to Job #{jobNumber}</DialogTitle>
        <DialogDescription>
          Add a new stone to this job. Type, weight, and value are required.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Stone Type <span className="text-red-500">*</span></Label>
          <Select
            value={newStone.stone_type}
            onValueChange={(value) => setNewStone({ ...newStone, stone_type: value })}
          >
            <SelectTrigger data-testid="add-stone-type-select">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {stoneTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Weight (ct) <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={newStone.weight}
              onChange={(e) => setNewStone({ ...newStone, weight: e.target.value })}
              data-testid="add-stone-weight-input"
            />
          </div>
          <div className="space-y-2">
            <Label>Value (USD) <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={newStone.value}
              onChange={(e) => setNewStone({ ...newStone, value: e.target.value })}
              data-testid="add-stone-value-input"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Shape</Label>
          <Select
            value={newStone.shape}
            onValueChange={(value) => setNewStone({ ...newStone, shape: value })}
          >
            <SelectTrigger data-testid="add-stone-shape-select">
              <SelectValue placeholder="Select shape (optional)" />
            </SelectTrigger>
            <SelectContent>
              {shapes.map((shape) => (
                <SelectItem key={shape} value={shape}>{shape}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={onConfirm}
          disabled={adding || !newStone.stone_type || !newStone.weight || !newStone.value}
          className="bg-navy-900 hover:bg-navy-800"
          data-testid="confirm-add-stone-button"
        >
          {adding ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</>
          ) : 'Add Stone'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
