export type UrlCheck = {
  id: string;
  url: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  httpStatus: number | null;
  responseTimeMs: number | null;
  pageTitle: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  completedAt: string | null;
};

export type Batch = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
  totalUrls: number;
  completedUrls: number;
  failedUrls: number;
  cancelledUrls: number;
  createdAt: string;
  updatedAt: string;
  urlChecks?: UrlCheck[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers },
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listBatches: () => request<Batch[]>('/batches'),
  getBatch: (id: string) => request<Batch>(`/batches/${encodeURIComponent(id)}`),
  createBatch: (urls: string[]) => request<Batch>('/batches', { method: 'POST', body: JSON.stringify({ urls }) }),
  uploadCsv: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<Batch>('/batches/csv', { method: 'POST', body: form });
  },
  cancelBatch: (id: string) => request<Batch>(`/batches/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  retryFailed: (id: string) => request<{ batchId: string; retriedCount: number }>(`/batches/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
};
