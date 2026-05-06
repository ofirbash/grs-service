"use client";

import { useEffect, useState, useMemo } from 'react';
import { accessRequestApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  Mail,
  Phone,
  Building2,
} from 'lucide-react';

type Status = 'pending' | 'approved' | 'rejected';

interface AccessRequest {
  id: string;
  full_name: string;
  company: string;
  email: string;
  phone: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reject_reason: string | null;
  client_id: string | null;
}

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function AccessRequestsTab() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status>('pending');
  const [search, setSearch] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AccessRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await accessRequestApi.list();
      setRequests(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    return requests
      .filter((r) => r.status === statusFilter)
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          r.full_name.toLowerCase().includes(q) ||
          r.company.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q)
        );
      });
  }, [requests, statusFilter, search]);

  const counts = useMemo(() => {
    return {
      pending: requests.filter((r) => r.status === 'pending').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
    };
  }, [requests]);

  const handleApprove = async (req: AccessRequest) => {
    if (!window.confirm(`Approve ${req.full_name} (${req.email})? An invitation email will be sent.`)) return;
    setActioningId(req.id);
    try {
      await accessRequestApi.approve(req.id);
      await fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || 'Approval failed');
    } finally {
      setActioningId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setActioningId(rejectTarget.id);
    try {
      await accessRequestApi.reject(rejectTarget.id, rejectReason);
      setRejectTarget(null);
      setRejectReason('');
      await fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || 'Rejection failed');
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="access-requests-tab">
      {/* Status pills + search */}
      <Card className="border-navy-200">
        <CardContent className="pt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {(['pending', 'approved', 'rejected'] as Status[]).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className={
                  statusFilter === s
                    ? 'bg-navy-900 hover:bg-navy-800'
                    : 'border-navy-200 text-navy-700'
                }
                data-testid={`access-requests-filter-${s}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <Badge
                  variant="secondary"
                  className={`ml-2 px-1.5 py-0 text-[10px] ${
                    statusFilter === s ? 'bg-white text-navy-900' : 'bg-navy-100 text-navy-700'
                  }`}
                >
                  {counts[s]}
                </Badge>
              </Button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400" />
            <Input
              placeholder="Search by name, company, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 border-navy-200 h-9"
              data-testid="access-requests-search"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-navy-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-navy-200">
          <CardContent className="pt-12 pb-12 text-center text-navy-500">
            <Mail className="h-10 w-10 mx-auto mb-3 text-navy-300" />
            <p className="text-sm">No {statusFilter} access requests.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-navy-200">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-navy-50">
                  <TableHead className="text-navy-700">Applicant</TableHead>
                  <TableHead className="text-navy-700">Contact</TableHead>
                  <TableHead className="text-navy-700">Submitted</TableHead>
                  {statusFilter !== 'pending' && (
                    <TableHead className="text-navy-700">Reviewed</TableHead>
                  )}
                  <TableHead className="text-right text-navy-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} data-testid={`access-request-row-${r.id}`}>
                    <TableCell>
                      <div className="font-medium text-navy-900">{r.full_name}</div>
                      <div className="text-xs text-navy-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3" />
                        {r.company || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-navy-800 flex items-center gap-1">
                        <Mail className="h-3 w-3 text-navy-400" />
                        {r.email}
                      </div>
                      <div className="text-xs text-navy-500 flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" />
                        {r.phone || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-navy-600">
                      {formatDate(r.submitted_at)}
                    </TableCell>
                    {statusFilter !== 'pending' && (
                      <TableCell className="text-xs text-navy-600">
                        <div>{formatDate(r.reviewed_at)}</div>
                        {r.reviewed_by && (
                          <div className="text-navy-400">by {r.reviewed_by}</div>
                        )}
                        {r.reject_reason && (
                          <div className="text-red-600 mt-0.5">“{r.reject_reason}”</div>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right whitespace-nowrap">
                      {statusFilter === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setRejectTarget(r); setRejectReason(''); }}
                            disabled={actioningId === r.id}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                            data-testid={`access-request-reject-${r.id}`}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(r)}
                            disabled={actioningId === r.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            data-testid={`access-request-approve-${r.id}`}
                          >
                            {actioningId === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve</>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={
                            r.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }
                        >
                          {r.status}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) setRejectTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject access request</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  Reject <strong>{rejectTarget.full_name}</strong> ({rejectTarget.email})?
                  An optional reason will be saved for your records (not emailed).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            data-testid="access-request-reject-reason"
            className="border-navy-200"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              onClick={submitReject}
              disabled={!!actioningId}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="access-request-confirm-reject"
            >
              {actioningId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
