import type { Batch, UrlCheck } from '@/lib/api';

export function StatusBadge({ status }: { status: Batch['status'] | UrlCheck['status'] }) {
  const labels: Record<typeof status, string> = {
    PENDING: 'Pending', RUNNING: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
    QUEUED: 'Queued', SUCCESS: 'Healthy', FAILED: 'Failed',
  };
  return <span className={`status-badge status-${status.toLowerCase()}`}><span className="status-dot" />{labels[status]}</span>;
}
