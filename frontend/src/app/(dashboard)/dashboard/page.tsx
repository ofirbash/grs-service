"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { dashboardApi, shipmentsApi, jobsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Briefcase, Users, TrendingUp, Clock, CheckCircle } from 'lucide-react';

interface DashboardStats {
  total_jobs: number;
  jobs_by_status: Record<string, number>;
  total_clients: number;
  total_value: number;
  total_fee: number;
}

interface RecentShipment {
  id: string;
  shipment_number: number;
  status: string;
  courier: string;
  total_jobs: number;
  destination_address: string;
}

interface RecentJob {
  id: string;
  job_number: number;
  status: string;
  client_name: string;
  total_stones: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentShipments, setRecentShipments] = useState<RecentShipment[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);

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
    };
    return colors[status] || 'secondary';
  };

  const formatJobStatus = (status: string) => {
    const labels: Record<string, string> = {
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
                    onClick={() => router.push(`/dashboard/jobs?jobId=${job.id}`)}
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
    </div>
  );
}
