"use client";

import { useEffect, useState } from 'react';
import { dashboardApi, shipmentsApi, jobsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
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
  Clock, 
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
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';
  
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Job modal state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [viewCertScanOpen, setViewCertScanOpen] = useState(false);
  const [viewingStone, setViewingStone] = useState<Stone | null>(null);

  // Shipment modal state
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [shipmentModalOpen, setShipmentModalOpen] = useState(false);
  const [shipmentJobs, setShipmentJobs] = useState<Job[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, shipmentsData, jobsData] = await Promise.all([
          dashboardApi.getStats(),
          shipmentsApi.getAll(),
          jobsApi.getAll(),
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
  }, []);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'warning',
      in_transit: 'default',
      delivered: 'success',
      stones_accepted: 'secondary',
      sent_to_lab: 'default',
      verbal_uploaded: 'default',
      stones_returned: 'warning',
      certificates_scanned: 'success',
      certificates_sent: 'success',
      done: 'success',
      received: 'secondary',
    };
    return colors[status] || 'secondary';
  };

  const formatJobStatus = (status: string) => {
    const labels: Record<string, string> = {
      received: 'Received',
      stones_accepted: 'Stones Accepted',
      sent_to_lab: 'Sent to Lab',
      verbal_uploaded: 'Verbal Uploaded',
      stones_returned: 'Stones Returned',
      certificates_scanned: 'Cert. Scanned',
      certificates_sent: 'Cert. Sent',
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
    // Find jobs in this shipment
    const jobs = allJobs.filter(j => shipment.job_ids.includes(j.id));
    setShipmentJobs(jobs);
    setShipmentModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
      received: 'secondary',
      stones_accepted: 'secondary',
      sent_to_lab: 'default',
      verbal_uploaded: 'default',
      stones_returned: 'warning',
      certificates_scanned: 'success',
      certificates_sent: 'success',
      done: 'success',
      pending: 'warning',
      in_transit: 'default',
      delivered: 'success',
    };
    return <Badge variant={variants[status] || 'secondary'}>{formatJobStatus(status)}</Badge>;
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
        <Card className="border-navy-100" data-testid="stats-total-jobs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-navy-600">Total Jobs</CardTitle>
            <Briefcase className="h-5 w-5 text-navy-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-navy-900">{stats?.total_jobs || 0}</div>
            <p className="text-xs text-navy-500 mt-1">Active work orders</p>
          </CardContent>
        </Card>

        <Card className="border-navy-100" data-testid="stats-total-clients">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-navy-600">Total Clients</CardTitle>
            <Users className="h-5 w-5 text-navy-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-navy-900">{stats?.total_clients || 0}</div>
            <p className="text-xs text-navy-500 mt-1">Registered clients</p>
          </CardContent>
        </Card>

        <Card className="border-navy-100" data-testid="stats-total-value">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-navy-600">Total Value</CardTitle>
            <TrendingUp className="h-5 w-5 text-gold-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-navy-900">
              ${(stats?.total_value || 0).toLocaleString()}
            </div>
            <p className="text-xs text-navy-500 mt-1">Stone value processed</p>
          </CardContent>
        </Card>

        <Card className="border-navy-100" data-testid="stats-total-fees">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-navy-600">Total Fees</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-500" />
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
        <Card className="border-navy-100" data-testid="recent-shipments-card">
          <CardHeader className="border-b border-navy-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
                <Package className="h-5 w-5 text-navy-600" />
                Recent Shipments
              </CardTitle>
              <a href="/dashboard/shipments" className="text-sm text-navy-600 hover:text-navy-800">
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
                        <p className="font-medium text-navy-800">
                          Shipment #{shipment.shipment_number}
                        </p>
                        <p className="text-sm text-navy-500">
                          {shipment.courier} → {shipment.destination_address}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={getStatusColor(shipment.status) as "default" | "secondary" | "destructive" | "outline" | "success" | "warning"}>
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
        <Card className="border-navy-100" data-testid="recent-jobs-card">
          <CardHeader className="border-b border-navy-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-navy-600" />
                Recent Jobs
              </CardTitle>
              <a href="/dashboard/jobs" className="text-sm text-navy-600 hover:text-navy-800">
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
                        <p className="font-medium text-navy-800">
                          Job #{job.job_number}
                        </p>
                        <p className="text-sm text-navy-500">
                          {job.client_name || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={getStatusColor(job.status) as "default" | "secondary" | "destructive" | "outline" | "success" | "warning"}>
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

      {/* Jobs by Status */}
      {stats?.jobs_by_status && Object.keys(stats.jobs_by_status).length > 0 && (
        <Card className="border-navy-100" data-testid="jobs-by-status-card">
          <CardHeader className="border-b border-navy-100">
            <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
              <Clock className="h-5 w-5 text-navy-600" />
              Jobs by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.jobs_by_status).map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center gap-2 px-4 py-2 bg-navy-50 rounded-lg"
                >
                  <Badge variant={getStatusColor(status) as "default" | "secondary" | "destructive" | "outline" | "success" | "warning"}>
                    {formatJobStatus(status)}
                  </Badge>
                  <span className="font-semibold text-navy-800">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Details Modal */}
      <Dialog open={jobModalOpen} onOpenChange={setJobModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
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
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-navy-500">Client</Label>
                  <p className="font-medium text-navy-800">{selectedJob.client_name || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Branch</Label>
                  <p className="font-medium text-navy-800">{selectedJob.branch_name || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Service Type</Label>
                  <p className="font-medium text-navy-800">{selectedJob.service_type}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedJob.status)}</div>
                </div>
                <div>
                  <Label className="text-navy-500">Total Value</Label>
                  <p className="font-medium text-navy-800">${selectedJob.total_value.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Total Fee</Label>
                  <p className="font-medium text-navy-800">${selectedJob.total_fee.toLocaleString()}</p>
                </div>
              </div>

              {/* Notes */}
              {selectedJob.notes && (
                <div>
                  <Label className="text-navy-500">Notes</Label>
                  <p className="font-medium text-navy-800">{selectedJob.notes}</p>
                </div>
              )}

              {/* Stones Table */}
              <div className="space-y-2 border-t pt-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Gem className="h-4 w-4" />
                  Stones ({selectedJob.stones?.length || 0})
                </Label>
                
                <div className="border rounded-lg overflow-hidden">
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
                                  className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50"
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
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
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-navy-500">Type</Label>
                  <p className="font-medium text-navy-800">{selectedShipment.shipment_type}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Courier</Label>
                  <p className="font-medium text-navy-800">{selectedShipment.courier}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Status</Label>
                  <div className="mt-1">
                    <Badge variant={getStatusColor(selectedShipment.status) as "default" | "secondary" | "destructive" | "outline" | "success" | "warning"}>
                      {selectedShipment.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-navy-500">From</Label>
                  <p className="font-medium text-navy-800">{selectedShipment.source_address}</p>
                </div>
                <div>
                  <Label className="text-navy-500">To</Label>
                  <p className="font-medium text-navy-800">{selectedShipment.destination_address}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Tracking #</Label>
                  <p className="font-medium text-navy-800">{selectedShipment.tracking_number || '-'}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Total Jobs</Label>
                  <p className="font-medium text-navy-800">{selectedShipment.total_jobs}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Total Stones</Label>
                  <p className="font-medium text-navy-800">{selectedShipment.total_stones}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Total Value</Label>
                  <p className="font-medium text-navy-800">${selectedShipment.total_value.toLocaleString()}</p>
                </div>
              </div>

              {/* Notes */}
              {selectedShipment.notes && (
                <div>
                  <Label className="text-navy-500">Notes</Label>
                  <p className="font-medium text-navy-800">{selectedShipment.notes}</p>
                </div>
              )}

              {/* Jobs in Shipment */}
              <div className="space-y-2 border-t pt-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Jobs in Shipment ({shipmentJobs.length})
                </Label>
                
                <div className="border rounded-lg overflow-hidden">
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
        <DialogContent className="max-w-5xl max-h-[95vh]">
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
