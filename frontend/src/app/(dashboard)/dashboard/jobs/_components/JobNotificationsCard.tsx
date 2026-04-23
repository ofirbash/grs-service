import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Mail, MessageSquare, CheckCircle2, Clock, Loader2,
} from 'lucide-react';
import type { NotificationStatus } from '../_types';
import { NOTIFICATION_LABELS } from '../_helpers';

interface JobNotificationsCardProps {
  jobStatus: string;
  loading: boolean;
  statuses: NotificationStatus[];
  sendingSmsType: string | null;
  onPreview: (type: string) => void;
  onSendSms: (type: string) => void;
}

/** Notifications card inside the View Job dialog's Actions sidebar. */
export const JobNotificationsCard: React.FC<JobNotificationsCardProps> = ({
  jobStatus, loading, statuses, sendingSmsType, onPreview, onSendSms,
}) => {
  const available = statuses.filter((n) => n.is_available);

  return (
    <div className="rounded-lg border border-navy-200 p-3 space-y-2">
      <Label className="text-sm font-semibold flex items-center gap-2">
        <Mail className="h-3.5 w-3.5" />
        Notifications
      </Label>
      {loading ? (
        <div className="flex items-center gap-2 text-navy-500 py-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-xs">Loading...</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {available.length === 0 ? (
            <p className="text-xs text-navy-400 italic">
              No notifications for &ldquo;{jobStatus.replace(/_/g, ' ')}&rdquo;
            </p>
          ) : (
            available.map((notification) => (
              <div
                key={notification.type}
                className={`p-2 rounded border text-xs ${
                  notification.is_sent ? 'bg-navy-50 border-navy-200' : 'bg-white border-navy-200'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  {notification.is_sent ? (
                    <CheckCircle2 className="h-3 w-3 text-navy-600 shrink-0" />
                  ) : (
                    <Clock className="h-3 w-3 text-navy-400 shrink-0" />
                  )}
                  <span className="font-medium text-navy-900 truncate">
                    {NOTIFICATION_LABELS[notification.type] || notification.type}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={notification.is_sent ? 'outline' : 'default'}
                    onClick={() => onPreview(notification.type)}
                    className={`h-6 px-2 text-[10px] flex-1 ${
                      notification.is_sent
                        ? 'border-navy-300'
                        : 'bg-brand-red hover:bg-brand-red-dark'
                    }`}
                    data-testid={`preview-notification-${notification.type}`}
                  >
                    <Mail className="h-2.5 w-2.5 mr-0.5" />
                    {notification.is_sent ? 'Resend' : 'Email'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSendSms(notification.type)}
                    disabled={sendingSmsType === notification.type}
                    className="h-6 px-2 text-[10px] flex-1 border-navy-300"
                    data-testid={`send-sms-${notification.type}`}
                  >
                    {sendingSmsType === notification.type ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <><MessageSquare className="h-2.5 w-2.5 mr-0.5" />SMS</>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
