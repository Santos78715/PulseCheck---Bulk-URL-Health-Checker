'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, type Batch, type UrlCheck } from '@/lib/api';
import { Icon } from '@/components/icons';
import { StatusBadge } from '@/components/status-badge';

function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function host(value: string) { try { return new URL(value).hostname; } catch { return value; } }

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');

  const load = useCallback(async () => {
    try { setBatch(await api.getBatch(id)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load this batch.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    const events = new EventSource(`/api/batches/${encodeURIComponent(id)}/events`);
    const update = () => void load();
    events.addEventListener('batch.updated', update);
    events.addEventListener('url.updated', update);
    events.onerror = () => { /* Polling remains active if the stream disconnects. */ };
    return () => { window.clearInterval(timer); events.close(); };
  }, [id, load]);

  const counts = useMemo(() => {
    const checks = batch?.urlChecks ?? [];
    return {
      success: checks.filter((item) => item.status === 'SUCCESS').length,
      failed: checks.filter((item) => item.status === 'FAILED').length,
      running: checks.filter((item) => item.status === 'RUNNING').length,
      queued: checks.filter((item) => item.status === 'QUEUED').length,
      cancelled: checks.filter((item) => item.status === 'CANCELLED').length,
    };
  }, [batch]);
  const filtered = (batch?.urlChecks ?? []).filter((check) => {
    const matchesText = check.url.toLowerCase().includes(query.toLowerCase());
    return matchesText && (filter === 'ALL' || check.status === filter);
  });

  const runAction = async (action: 'cancel' | 'retry') => {
    setBusy(true); setActionError('');
    try { if (action === 'cancel') await api.cancelBatch(id); else await api.retryFailed(id); await load(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'The action could not be completed.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="detail-shell"><div className="detail-loading"><span className="spinner" />Loading batch…</div></div>;
  if (error || !batch) return <div className="detail-shell"><div className="detail-error"><span className="metric-icon metric-orange"><Icon name="alert" /></span><h1>Couldn’t load this batch</h1><p>{error || 'This batch may have been removed.'}</p><button className="button button-dark" onClick={() => void load()}>Try again</button><Link href="/" className="back-link">Back to overview</Link></div></div>;

  const progress = batch.totalUrls ? Math.min(100, Math.round(batch.completedUrls / batch.totalUrls * 100)) : 0;
  const running = batch.status === 'RUNNING' || batch.status === 'PENDING';

  return <div className="detail-shell">
    <header className="detail-topbar"><Link href="/" className="brand"><span className="brand-mark"><Icon name="pulse" size={19} /></span><span>pulse<span className="brand-light">check</span></span></Link><div className="breadcrumbs"><Link href="/">Overview</Link><Icon name="chevron" size={14} /><strong>Batch details</strong></div><Link className="detail-back" href="/"><Icon name="arrow" size={15} />All batches</Link></header>
    <main className="detail-main">
      <div className="detail-breadcrumb"><Link href="/">Workspace</Link><Icon name="chevron" size={13} /><Link href="/#batches">Batches</Link><Icon name="chevron" size={13} /><span>{batch.id.slice(0, 8).toUpperCase()}</span></div>
      <section className="detail-title-row"><div><div className="detail-title-line"><h1>Batch {batch.id.slice(0, 8).toUpperCase()}</h1><StatusBadge status={batch.status} /></div><p>Created {formatDate(batch.createdAt)} <span className="muted-dot">·</span> ID: <code>{batch.id}</code></p></div><div className="detail-actions"><button className="button button-outline" onClick={() => void load()} title="Refresh batch"><Icon name="refresh" size={15} />Refresh</button>{running && <button className="button button-danger" disabled={busy} onClick={() => void runAction('cancel')}><Icon name="x" size={15} />{busy ? 'Working…' : 'Cancel batch'}</button>}</div></section>
      {actionError && <div className="notice notice-error"><Icon name="alert" size={16} /><span>{actionError}</span><button className="notice-dismiss" onClick={() => setActionError('')} aria-label="Dismiss"><Icon name="x" size={14} /></button></div>}
      <section className="detail-progress-card"><div className="progress-heading"><div><span className="eyebrow">BATCH PROGRESS</span><h2>{batch.completedUrls.toLocaleString()} <span>of {batch.totalUrls.toLocaleString()} URLs checked</span></h2></div><strong className="progress-percent">{progress}%</strong></div><div className="detail-progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-legend"><span><i className="legend-dot legend-success" />{counts.success} healthy</span><span><i className="legend-dot legend-failed" />{counts.failed} failed</span><span><i className="legend-dot legend-running" />{counts.running} checking</span><span><i className="legend-dot legend-queued" />{counts.queued} queued</span>{counts.cancelled > 0 && <span><i className="legend-dot legend-cancelled" />{counts.cancelled} cancelled</span>}</div></section>
      <section className="detail-stats"><div><span className="detail-stat-icon detail-stat-green"><Icon name="check" size={16} /></span><span><small>Healthy</small><strong>{counts.success}</strong></span></div><div><span className="detail-stat-icon detail-stat-orange"><Icon name="alert" size={16} /></span><span><small>Failed</small><strong>{counts.failed}</strong></span></div><div><span className="detail-stat-icon detail-stat-blue"><Icon name="activity" size={16} /></span><span><small>In progress</small><strong>{counts.running}</strong></span></div><div><span className="detail-stat-icon detail-stat-gray"><Icon name="clock" size={16} /></span><span><small>Queued</small><strong>{counts.queued}</strong></span></div></section>
      <section className="results-section"><div className="results-heading"><div><span className="eyebrow">URL CHECKS</span><h2>Results <span className="batch-count">{batch.urlChecks?.length ?? 0}</span></h2></div><div className="results-tools"><label className="search-box"><Icon name="search" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a URL…" aria-label="Find a URL" /></label><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter URL status"><option value="ALL">All statuses</option><option value="SUCCESS">Healthy</option><option value="FAILED">Failed</option><option value="RUNNING">Checking</option><option value="QUEUED">Queued</option><option value="CANCELLED">Cancelled</option></select></div></div>
        <div className="table-card results-table-card"><div className="table-scroll"><table><thead><tr><th>WEBSITE</th><th>STATUS</th><th>HTTP</th><th>RESPONSE TIME</th><th>ATTEMPTS</th><th /></tr></thead><tbody>
          {filtered.length === 0 ? <tr><td colSpan={6}><div className="table-state">{query || filter !== 'ALL' ? 'No URLs match your filters.' : 'No URL checks in this batch.'}</div></td></tr> : filtered.map((check: UrlCheck) => <tr key={check.id}><td><div className="url-cell"><span className="url-host-icon"><Icon name="globe" size={15} /></span><span><strong>{host(check.url)}</strong><small>{check.url}</small></span></div></td><td><StatusBadge status={check.status} /></td><td>{check.httpStatus ? <span className={`http-code ${check.httpStatus < 400 ? 'http-good' : 'http-bad'}`}>{check.httpStatus}</span> : <span className="table-dash">—</span>}</td><td>{check.responseTimeMs != null ? <span className="response-time">{check.responseTimeMs.toLocaleString()}<small> ms</small></span> : <span className="table-dash">—</span>}</td><td><span className="attempt-count">{check.attempts}</span></td><td>{check.status === 'FAILED' && check.error ? <span className="error-detail" title={check.error}><Icon name="alert" size={14} /></span> : null}</td></tr>)}
        </tbody></table></div><div className="table-footer"><span>Showing {filtered.length} of {batch.urlChecks?.length ?? 0} URLs</span><span className="live-label"><span />Live updates</span></div></div>
        {counts.failed > 0 && <div className="retry-callout"><div className="retry-callout-icon"><Icon name="refresh" size={17} /></div><div><strong>{counts.failed} {counts.failed === 1 ? 'URL needs' : 'URLs need'} another look</strong><small>Retry the failed checks in this batch.</small></div><button className="button button-outline" disabled={busy} onClick={() => void runAction('retry')}>{busy ? 'Retrying…' : 'Retry failed'}<Icon name="arrow" size={14} /></button></div>}
      </section>
      <footer className="page-footer detail-footer"><span>© {new Date().getFullYear()} PulseCheck</span><span>Built for a healthier internet <span className="footer-heart">♥</span></span><Link href="/">Back to overview <Icon name="arrow" size={12} /></Link></footer>
    </main>
  </div>;
}
