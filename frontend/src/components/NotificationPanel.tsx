"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getToken } from '@/lib/tokenStorage';
import {
  Mail,
  Send,
  Eye,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  Paperclip,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface NotificationStatus {
  type: string;
  description: string;
  status_trigger: string;
  is_available: boolean;
  is_sent: boolean;
  can_send: boolean;
  last_sent?: {
    sent_at: string;
    sent_by: string;
    status: string;
    recipient: string;
  };
}

interface NotificationPreview {
  notification_type: string;
  description: string;
  job_number: number;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  html_body: string;
  attachments: Array<{ type: string; name: string; url: string }>;
  can_send: boolean;
  current_status: string;
}

interface NotificationPanelProps {
  jobId: string;
  currentStatus: string;
  onNotificationSent?: () => void;
}

const notificationLabels: Record<string, string> = {
  stones_accepted: "1. Stones Accepted",
  verbal_uploaded: "2. Verbal Results",
  stones_returned: "3. Stones Returned",
  cert_uploaded: "4. Certificates Scanned",
  cert_returned: "5. Certificates Arrived",
};

export function NotificationPanel({ jobId, currentStatus, onNotificationSent }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<NotificationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<NotificationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sendError, setSendError] = useState('');

  const fetchNotificationStatus = useCallback(async () => {
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/jobs/${jobId}/notifications/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notification status:', error);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchNotificationStatus();
  }, [fetchNotificationStatus, currentStatus]);

  const handlePreview = async (notificationType: string) => {
    setPreviewLoading(true);
    setSendError('');
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/jobs/${jobId}/notifications/preview/${notificationType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPreview(data);
        setRecipientEmail(data.recipient_email || '');
        setPreviewOpen(true);
      }
    } catch (error) {
      console.error('Failed to fetch preview:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSend = async () => {
    if (!preview || !recipientEmail) return;
    
    setSendLoading(true);
    setSendError('');
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/jobs/${jobId}/notifications/send/${preview.notification_type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          notification_type: preview.notification_type,
          recipient_email: recipientEmail,
        }),
      });
      
      if (response.ok) {
        setPreviewOpen(false);
        fetchNotificationStatus();
        onNotificationSent?.();
      } else {
        const error = await response.json();
        setSendError(error.detail || 'Failed to send notification');
      }
    } catch (error) {
      setSendError('Failed to send notification');
      console.error('Failed to send notification:', error);
    } finally {
      setSendLoading(false);
    }
  };

  const getStatusIcon = (notif: NotificationStatus) => {
    if (notif.is_sent) {
      return <Check className="h-4 w-4 text-navy-600" />;
    }
    if (notif.is_available) {
      return <Clock className="h-4 w-4 text-amber-500" />;
    }
    return <AlertCircle className="h-4 w-4 text-gray-300" />;
  };

  const getStatusBadge = (notif: NotificationStatus) => {
    if (notif.is_sent) {
      return <Badge variant="success" className="text-xs">Sent</Badge>;
    }
    if (notif.is_available && notif.status_trigger === currentStatus) {
      return <Badge variant="warning" className="text-xs">Ready to Send</Badge>;
    }
    if (notif.is_available) {
      return <Badge variant="secondary" className="text-xs">Available</Badge>;
    }
    return <Badge variant="outline" className="text-xs text-gray-400">Pending</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-navy-600" />
      </div>
    );
  }

  // Find the notification that matches the current status and hasn't been sent
  const pendingNotification = notifications.find(
    n => n.status_trigger === currentStatus && !n.is_sent && n.is_available
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="h-5 w-5 text-navy-600" />
        <Label className="text-base font-semibold">Email Notifications</Label>
      </div>

      {/* Pending notification alert */}
      {pendingNotification && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-amber-800">
                Notification Ready: {notificationLabels[pendingNotification.type]}
              </p>
              <p className="text-sm text-amber-600 mt-1">
                {pendingNotification.description}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => handlePreview(pendingNotification.type)}
              disabled={previewLoading}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="review-send-button"
            >
              {previewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Eye className="h-4 w-4 mr-1" />
              )}
              Review & Send
            </Button>
          </div>
        </div>
      )}

      {/* Notification list */}
      <div className="space-y-2">
        {notifications.map((notif) => (
          <div
            key={notif.type}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              notif.is_sent
                ? 'bg-green-50 border-green-200'
                : notif.is_available
                ? 'bg-white border-navy-200'
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {getStatusIcon(notif)}
              <div>
                <p className={`font-medium text-sm ${notif.is_available ? 'text-navy-800' : 'text-gray-400'}`}>
                  {notificationLabels[notif.type]}
                </p>
                {notif.last_sent && (
                  <p className="text-xs text-gray-500">
                    Sent {new Date(notif.last_sent.sent_at).toLocaleString()} by {notif.last_sent.sent_by}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(notif)}
              {notif.is_available && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handlePreview(notif.type)}
                  disabled={previewLoading}
                  className="h-8 px-2"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Preview & Send Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Review Email Notification
            </DialogTitle>
            <DialogDescription>
              Preview the email before sending to the client
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="flex-1 overflow-y-auto space-y-4 py-4">
              {/* Email details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-navy-500">Subject</Label>
                  <p className="font-medium text-navy-800">{preview.subject}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Recipient Email</Label>
                  <Input
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="recipient@email.com"
                    className="mt-1"
                    data-testid="recipient-email-input"
                  />
                </div>
              </div>

              {/* Attachments */}
              {preview.attachments.length > 0 && (
                <div>
                  <Label className="text-navy-500">Attachments</Label>
                  <div className="flex gap-2 mt-1">
                    {preview.attachments.map((att) => (
                      <Badge key={att.name} variant="outline" className="flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {att.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Email Preview */}
              <div>
                <Label className="text-navy-500 mb-2 block">Email Preview</Label>
                <div className="border rounded-lg overflow-hidden bg-gray-50">
                  <iframe
                    srcDoc={preview.html_body}
                    className="w-full h-96 bg-white"
                    title="Email Preview"
                  />
                </div>
              </div>

              {/* Warning if API key not configured */}
              {!preview.can_send && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-amber-800 text-sm">
                    <strong>Note:</strong> Resend API key is not configured. Email will be logged but not actually sent.
                  </p>
                </div>
              )}

              {/* Error message */}
              {sendError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm">{sendError}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sendLoading || !recipientEmail}
              className="bg-navy-800 hover:bg-navy-700"
              data-testid="send-email-button"
            >
              {sendLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default NotificationPanel;
