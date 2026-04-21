"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dashboardApi, shipmentsApi, jobsApi } from '@/lib/api';
import { useAuthStore, useBranchFilterStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
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
  Package, 
  Briefcase, 
  Users, 
  TrendingUp, 
  CheckCircle,
  Gem,
  FileText,
  ExternalLink,
  Eye,
} from 'lucide-react';

interface DashboardStats {
  total_jobs: number;
  jobs_by_status: Record<string, number>;
  total_clients: number;
  total_value: number;
  total_fee: number;
}

interface Stone {
  id: string;
  sku: string;
  stone_type: string;
  weight: number;
  shape: string;
  value: number;
  fee: number;
  certificate_group?: number;
  certificate_scan_url?: string;
}

interface Job {
  id: string;
  job_number: number;
  client_id: string;
  client_name?: string;
  branch_name?: string;
  service_type: string;
  status: string;
  notes?: string;
  stones: Stone[];
  total_stones: number;
  total_value: number;
  total_fee: number;
  signed_memo_url?: string;
  created_at: string;
}

interface Shipment {
  id: string;
  shipment_number: number;
  shipment_type: string;
  courier: string;
  source_address: string;
  destination_address: string;
  tracking_number?: string;
  status: string;
  job_ids: string[];
  total_jobs: number;
  total_stones: number;
  total_value: number;
  notes?: string;
  created_at: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';

  // Job modal state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [viewCertScanOpen, setViewCertScanOpen] = useState(false);
  const [viewingStone, setViewingStone] = useState<Stone | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [clientsPanelOpen, setClientsPanelOpen] = useState(false);
  const [activeClients, setActiveClients] = useState<Array<{
    id: string; name: string; email: string; company: string;
    active_jobs: number; total_stones: number; total_fee: number; statuses: string[];
  }>>([]);
  const router = useRouter();

  // Shipment modal state
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [shipmentModalOpen, setShipmentModalOpen] = useState(false);
  const [shipmentJobs, setShipmentJobs] = useState<Job[]>([]);
  const { selectedBranchId } = useBranchFilterStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const branchParam = selectedBranchId ? { branch_id: selectedBranchId } : {};
        const [statsData, shipmentsData, jobsData] = await Promise.all([
          dashboardApi.getStats(branchParam),
          shipmentsApi.getAll(branchParam),
          jobsApi.getAll(branchParam),
        ]);
        setStats(statsData);
        setRecentShipments(shipmentsData.slice(0, 5));
        setRecentJobs(jobsData.slice(0, 5));
        setAllJobs(jobsData);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedBranchId]);

  const getStatusColor = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-[#d4dbe4] text-[#486581]',
      stones_accepted: 'bg-[#b8c5d4] text-[#243b53]',
      sent_to_lab: 'bg-[#8da2b8] text-white',
      verbal_uploaded: 'bg-[#6b8aaa] text-white',
      stones_returned: 'bg-[#4a7191] text-white',
      cert_uploaded: 'bg-[#305a78] text-white',
      cert_returned: 'bg-[#1d3f57] text-white',
      done: 'bg-[#141417] text-white',
      pending: 'bg-brand-red text-white',
      in_transit: 'bg-navy-700 text-white',
      delivered: 'bg-navy-900 text-white',
    };
    return styles[status] || 'bg-navy-100 text-navy-600';
  };

  const formatJobStatus = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Draft',
      stones_accepted: 'Stones Accepted',
      sent_to_lab: 'Sent to Lab',
      verbal_uploaded: 'Verbal Uploaded',
      stones_returned: 'Stones Returned',
      cert_uploaded: 'Cert. Uploaded',
      cert_returned: 'Cert. Returned',
      done: 'Done',
    };
    return labels[status] || status.replace('_', ' ');
  };

  const openJobModal = (job: Job) => {
    setSelectedJob(job);
    setJobModalOpen(true);
  };

  const openShipmentModal = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    const jobs = allJobs.filter(j => shipment.job_ids.includes(j.id));
    setShipmentJobs(jobs);
    setShipmentModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    return <Badge className={getStatusColor(status)}>{formatJobStatus(status)}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-navy-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="dashboard-page">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className={`border-navy-200 cursor-pointer hover:border-navy-300 transition-all ${pipelineOpen ? 'md:col-span-2 lg:col-span-4' : ''}`}
          data-testid="stats-total-jobs"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-testid^="pipeline-"]')) return;
            setPipelineOpen(!pipelineOpen);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-navy-600">Total Jobs</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-navy-900">{stats?.total_jobs || 0}</span>
              <Briefcase className="h-5 w-5 text-navy-400" />
            </div>
          </CardHeader>
          {pipelineOpen && (
            <CardContent className="pt-2 pb-3">
              {(() => {
                const STATUS_PIPELINE = [
                  { key: 'draft', label: 'Draft', step: 1, color: '#d4dbe4', text: '#486581' },
                  { key: 'stones_accepted', label: 'Stones Accepted', step: 2, color: '#b8c5d4', text: '#243b53' },
                  { key: 'sent_to_lab', label: 'Sent to Lab', step: 3, color: '#8da2b8', text: '#fff' },
                  { key: 'verbal_uploaded', label: 'Verbal Uploaded', step: 4, color: '#6b8aaa', text: '#fff' },
                  { key: 'stones_returned', label: 'Stones Returned', step: 5, color: '#4a7191', text: '#fff' },
                  { key: 'cert_uploaded', label: 'Cert. Uploaded', step: 6, color: '#305a78', text: '#fff' },
                  { key: 'cert_returned', label: 'Cert. Returned', step: 7, color: '#1d3f57', text: '#fff' },
                  { key: 'done', label: 'Done', step: 8, color: '#141417', text: '#fff' },
                ];
                const counts = stats?.jobs_by_status || {};
                const totalJobs = stats?.total_jobs || 0;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
                    {STATUS_PIPELINE.map((stage) => {
                      const count = (counts as Record<string, number>)[stage.key] || 0;
                      const pct = totalJobs > 0 ? (count / totalJobs) * 100 : 0;
                      return (
                        <div
                          key={stage.key}
                          className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded cursor-pointer hover:bg-navy-50 transition-colors"
                          onClick={() => router.push(`/dashboard/jobs?status=${stage.key}`)}
                          data-testid={`pipeline-${stage.key}`}
                        >
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                            style={{ backgroundColor: stage.color, color: stage.text }}
                          >
                            {stage.step}
                          </div>
                          <span className="text-sm text-navy-800 w-32 shrink-0">{stage.label}</span>
                          <div className="flex-1 h-1.5 bg-navy-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct)}%`, backgroundColor: stage.color }}
                            />
                          </div>
                          <span className="text-sm font-bold tabular-nums text-navy-900 w-6 text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          )}
        </Card>

        {isAdmin && (
        <Card
          className={`border-navy-200 cursor-pointer hover:border-navy-300 transition-all ${clientsPanelOpen ? 'md:col-span-2 lg:col-span-3' : ''}`}
          data-testid="stats-total-clients"
          onClick={async (e) => {
            if ((e.target as HTMLElement).closest('[data-testid^="active-client-"]')) return;
            if (!clientsPanelOpen) {
              try {
                const data = await dashboardApi.getClientsWithActiveJobs(
                  selectedBranchId ? { branch_id: selectedBranchId } : undefined
                );
                setActiveClients(data);
              } catch { /* ignore */ }
            }
            setClientsPanelOpen(!clientsPanelOpen);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-navy-600">Total Clients</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-navy-900">{stats?.total_clients || 0}</span>
              <Users className="h-5 w-5 text-navy-400" />
            </div>
          </CardHeader>
          {clientsPanelOpen && (
            <CardContent className="pt-2 pb-3">
              <p className="text-xs text-navy-500 mb-2 font-medium">Clients with active jobs</p>
              {activeClients.length === 0 ? (
                <p className="text-sm text-navy-400 italic py-2">No clients with active jobs</p>
              ) : (
                <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
                  {activeClients.map((client) => (
                    <div
                      key={client.id}
                      className="flex items-center gap-3 py-2 px-2 -mx-2 rounded cursor-pointer hover:bg-navy-50 transition-colors"
                      onClick={() => router.push(`/dashboard/clients`)}
                      data-testid={`active-client-${client.id}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-navy-200 flex items-center justify-center text-[10px] font-bold text-navy-700 shrink-0">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-navy-900 truncate">{client.name}</span>
                          <span className="text-xs text-navy-500 shrink-0 ml-2">{client.active_jobs} job{client.active_jobs !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex gap-1 mt-0.5">
                          {(() => {
                            const statusColors: Record<string, string> = {
                              draft: '#d4dbe4', stones_accepted: '#b8c5d4', sent_to_lab: '#8da2b8',
                              verbal_uploaded: '#6b8aaa', stones_returned: '#4a7191', cert_uploaded: '#305a78',
                              cert_returned: '#1d3f57',
                            };
                            const uniqueStatuses = Array.from(new Set(client.statuses));
                            return uniqueStatuses.map((s) => (
                              <div key={s} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: statusColors[s] || '#d4dbe4' }} />
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
        )}

        <Card className="border-navy-200" data-testid="stats-total-value">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-navy-600">Total Value</CardTitle>
            <TrendingUp className="h-5 w-5 text-navy-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-navy-900">
              ${(stats?.total_value || 0).toLocaleString()}
            </div>
            <p className="text-xs text-navy-500 mt-1">Stone value processed</p>
          </CardContent>
        </Card>

        <Card className="border-navy-200" data-testid="stats-total-fees">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-navy-600">Total Fees</CardTitle>
            <CheckCircle className="h-5 w-5 text-navy-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-navy-900">
              ${(stats?.total_fee || 0).toLocaleString()}
            </div>
            <p className="text-xs text-navy-500 mt-1">Revenue generated</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Shipments */}
        <Card className="border-navy-200" data-testid="recent-shipments-card">
          <CardHeader className="border-b border-navy-200">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
                <Package className="h-5 w-5 text-navy-600" />
                Recent Shipments
              </CardTitle>
              <a href="/dashboard/shipments" className="text-sm text-navy-600 hover:text-navy-900">
                View all
              </a>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentShipments.length === 0 ? (
              <div className="p-6 text-center text-navy-500">No shipments yet</div>
            ) : (
              <div className="divide-y divide-navy-100">
                {recentShipments.map((shipment) => (
                  <div
                    key={shipment.id}
                    className="p-4 hover:bg-navy-50 transition-colors cursor-pointer"
                    onClick={() => openShipmentModal(shipment)}
                    data-testid={`shipment-row-${shipment.shipment_number}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-navy-900">
                          Shipment #{shipment.shipment_number}
                        </p>
                        <p className="text-sm text-navy-500">
                          {shipment.courier} → {shipment.destination_address}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge className={getStatusColor(shipment.status)}>
                          {shipment.status}
                        </Badge>
                        <p className="text-xs text-navy-500 mt-1">
                          {shipment.total_jobs} job(s)
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <Card className="border-navy-200" data-testid="recent-jobs-card">
          <CardHeader className="border-b border-navy-200">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-navy-600" />
                Recent Jobs
              </CardTitle>
              <a href="/dashboard/jobs" className="text-sm text-navy-600 hover:text-navy-900">
                View all
              </a>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentJobs.length === 0 ? (
              <div className="p-6 text-center text-navy-500">No jobs yet</div>
            ) : (
              <div className="divide-y divide-navy-100">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-4 hover:bg-navy-50 transition-colors cursor-pointer"
                    onClick={() => openJobModal(job)}
                    data-testid={`job-row-${job.job_number}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-navy-900">
                          Job #{job.job_number}
                        </p>
                        <p className="text-sm text-navy-500">
                          {job.client_name || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge className={getStatusColor(job.status)}>
                          {formatJobStatus(job.status)}
                        </Badge>
                        <p className="text-xs text-navy-500 mt-1">
                          {job.total_stones} stone(s)
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Job Details Modal */}
      <Dialog open={jobModalOpen} onOpenChange={setJobModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800 flex items-center justify-between">
              <span>Job #{selectedJob?.job_number}</span>
              <a 
                href={`/dashboard/jobs?jobId=${selectedJob?.id}`}
                className="text-sm text-navy-600 hover:text-navy-800 flex items-center gap-1"
              >
                <ExternalLink className="h-4 w-4" />
                Open Full View
              </a>
            </DialogTitle>
          </DialogHeader>

          {selectedJob && (
            <div className="space-y-4 py-4">
              {/* Job Details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-navy-500 text-xs">Client</Label>
                  <p className="font-medium text-navy-900 text-sm">{selectedJob.client_name || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Branch</Label>
                  <p className="font-medium text-navy-900 text-sm">{selectedJob.branch_name || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Service Type</Label>
                  <p className="font-medium text-navy-900 text-sm">{selectedJob.service_type}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedJob.status)}</div>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Total Value</Label>
                  <p className="font-medium text-navy-900 text-sm">${selectedJob.total_value.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Total Fee</Label>
                  <p className="font-medium text-navy-900 text-sm">${selectedJob.total_fee.toLocaleString()}</p>
                </div>
              </div>

              {/* Notes */}
              {selectedJob.notes && (
                <div>
                  <Label className="text-navy-500">Notes</Label>
                  <p className="font-medium text-navy-900">{selectedJob.notes}</p>
                </div>
              )}

              {/* Stones Table */}
              <div className="space-y-2 border-t pt-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Gem className="h-4 w-4" />
                  Stones ({selectedJob.stones?.length || 0})
                </Label>
                
                {/* Mobile Cards */}
                <div className="md:hidden space-y-2">
                  {selectedJob.stones?.map((stone) => (
                    <div key={stone.id} className="border border-navy-200 rounded-lg p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-navy-900">{stone.sku}</span>
                        <span className="text-xs font-medium text-navy-900">${stone.fee.toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-navy-500 mt-0.5">{stone.stone_type} &middot; {stone.weight} ct &middot; {stone.shape}</div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-navy-50">
                        <TableHead className="text-navy-700">SKU</TableHead>
                        <TableHead className="text-navy-700">Type</TableHead>
                        <TableHead className="text-navy-700">Weight</TableHead>
                        <TableHead className="text-navy-700">Shape</TableHead>
                        <TableHead className="text-navy-700">Value</TableHead>
                        <TableHead className="text-navy-700">Fee</TableHead>
                        <TableHead className="text-navy-700 w-20">Cert</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedJob.stones?.map((stone) => (
                        <TableRow key={stone.id} className="hover:bg-navy-50">
                          <TableCell className="font-mono text-sm">{stone.sku}</TableCell>
                          <TableCell>{stone.stone_type}</TableCell>
                          <TableCell>{stone.weight} ct</TableCell>
                          <TableCell>{stone.shape}</TableCell>
                          <TableCell>${stone.value.toLocaleString()}</TableCell>
                          <TableCell>${stone.fee.toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {stone.certificate_group && (
                                <Badge variant="outline" className="text-xs">
                                  {stone.certificate_group}
                                </Badge>
                              )}
                              {stone.certificate_scan_url && (
                                <button
                                  onClick={() => {
                                    setViewingStone(stone);
                                    setViewCertScanOpen(true);
                                  }}
                                  className="text-navy-600 hover:text-navy-900 p-1 rounded hover:bg-green-50"
                                  title="View Certificate Scan"
                                >
                                  <FileText className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!selectedJob.stones || selectedJob.stones.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-4 text-navy-400">
                            No stones
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setJobModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shipment Details Modal */}
      <Dialog open={shipmentModalOpen} onOpenChange={setShipmentModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800 flex items-center justify-between">
              <span>Shipment #{selectedShipment?.shipment_number}</span>
              <a 
                href={`/dashboard/shipments`}
                className="text-sm text-navy-600 hover:text-navy-800 flex items-center gap-1"
              >
                <ExternalLink className="h-4 w-4" />
                Open Shipments Page
              </a>
            </DialogTitle>
          </DialogHeader>

          {selectedShipment && (
            <div className="space-y-4 py-4">
              {/* Shipment Details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-navy-500 text-xs">Type</Label>
                  <p className="font-medium text-navy-900 text-sm">{selectedShipment.shipment_type}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Courier</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.courier}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusColor(selectedShipment.status)}>
                      {selectedShipment.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-navy-500">From</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.source_address}</p>
                </div>
                <div>
                  <Label className="text-navy-500">To</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.destination_address}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Tracking #</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.tracking_number || '-'}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Total Jobs</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.total_jobs}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Total Stones</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.total_stones}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Total Value</Label>
                  <p className="font-medium text-navy-900">${selectedShipment.total_value.toLocaleString()}</p>
                </div>
              </div>

              {/* Notes */}
              {selectedShipment.notes && (
                <div>
                  <Label className="text-navy-500">Notes</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.notes}</p>
                </div>
              )}

              {/* Jobs in Shipment */}
              <div className="space-y-2 border-t pt-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Jobs in Shipment ({shipmentJobs.length})
                </Label>
                
                {/* Mobile Cards */}
                <div className="md:hidden space-y-2">
                  {shipmentJobs.map((job) => (
                    <div key={job.id} className="border border-navy-200 rounded-lg p-2.5 active:bg-navy-50" onClick={() => { setShipmentModalOpen(false); setTimeout(() => openJobModal(job), 100); }}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-navy-900 text-sm">#{job.job_number}</span>
                        {getStatusBadge(job.status)}
                      </div>
                      <div className="text-xs text-navy-500 mt-0.5">{job.client_name || '-'} &middot; {job.total_stones} stones &middot; ${job.total_value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-navy-50">
                        <TableHead className="text-navy-700">Job #</TableHead>
                        <TableHead className="text-navy-700">Client</TableHead>
                        <TableHead className="text-navy-700">Stones</TableHead>
                        <TableHead className="text-navy-700">Value</TableHead>
                        <TableHead className="text-navy-700">Status</TableHead>
                        <TableHead className="text-navy-700 w-20">View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shipmentJobs.map((job) => (
                        <TableRow key={job.id} className="hover:bg-navy-50">
                          <TableCell className="font-medium">#{job.job_number}</TableCell>
                          <TableCell>{job.client_name || 'N/A'}</TableCell>
                          <TableCell>{job.total_stones}</TableCell>
                          <TableCell>${job.total_value.toLocaleString()}</TableCell>
                          <TableCell>{getStatusBadge(job.status)}</TableCell>
                          <TableCell>
                            <button
                              onClick={() => {
                                setShipmentModalOpen(false);
                                setTimeout(() => openJobModal(job), 100);
                              }}
                              className="text-navy-600 hover:text-navy-800 p-1 rounded hover:bg-navy-100"
                              title="View Job"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {shipmentJobs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4 text-navy-400">
                            No jobs in this shipment
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShipmentModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certificate Scan Viewer */}
      <Dialog open={viewCertScanOpen} onOpenChange={setViewCertScanOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Certificate Scan - {viewingStone?.sku}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ minHeight: '500px', maxHeight: '75vh' }}>
            {viewingStone?.certificate_scan_url && (
              viewingStone.certificate_scan_url.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={viewingStone.certificate_scan_url}
                  className="w-full h-full rounded-lg"
                  style={{ minHeight: '500px', maxHeight: '75vh' }}
                  title={`Certificate for ${viewingStone.sku}`}
                />
              ) : (
                <img
                  src={viewingStone.certificate_scan_url}
                  alt={`Certificate for ${viewingStone.sku}`}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewCertScanOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
