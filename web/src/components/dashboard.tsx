'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { api, type Batch } from '@/lib/api';
import { Icon } from './icons';
import { StatusBadge } from './status-badge';

function shortId(id: string) { return id.slice(0, 8).toUpperCase(); }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function getInitials() { return 'SP'; }

function Sidebar({ active = 'Overview' }: { active?: string }) {
  const links = [
    { label: 'Overview', icon: 'grid' as const, href: '/' },
    { label: 'All batches', icon: 'layers' as const, href: '/#batches' },
  ];
  return <aside className="sidebar">
    <Link href="/" className="brand"><span className="brand-mark"><Icon name="pulse" size={19} /></span><span>pulse<span className="brand-light">check</span></span></Link>
    <div className="workspace-label">WORKSPACE</div>
    <div className="workspace-switcher"><span className="workspace-avatar">P</span><span className="workspace-copy"><strong>Personal workspace</strong><small>Free plan</small></span><span className="switch-chevron">⌄</span></div>
    <div className="nav-label">MENU</div>
    <nav className="nav-list" aria-label="Main navigation">
      {links.map((link) => <Link key={link.label} href={link.href} aria-label={link.label} className={`nav-link ${active === link.label ? 'active' : ''}`}><Icon name={link.icon} size={17} /><span>{link.label}</span>{link.label === 'All batches' && <span className="nav-shortcut">↵</span>}</Link>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="usage-card"><div className="usage-top"><span>Batch capacity</span><span>1,000 URLs</span></div><div className="usage-track"><span /></div><small>Maximum URLs per batch</small></div>
      <button className="nav-link nav-button" type="button" title="Settings are coming soon"><Icon name="settings" size={17} /><span>Settings</span></button>
      <div className="profile-row"><div className="profile-avatar">{getInitials()}</div><div className="profile-copy"><strong>Santosh Pokhrel</strong><small>Free plan</small></div><button className="icon-button profile-menu" aria-label="Profile menu" title="Profile menu"><span>···</span></button></div>
    </div>
  </aside>;
}

function MetricCard({ label, value, hint, icon, tone }: { label: string; value: string; hint: string; icon: 'globe' | 'check' | 'alert' | 'activity'; tone: string }) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-label">{label}</span><span className={`metric-icon ${tone}`}><Icon name={icon} size={17} /></span></div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div></article>;
}

function NewBatchCard({ onCreated }: { onCreated: (batch: Batch) => void }) {
  const [urls, setUrls] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const parsedUrls = useMemo(() => urls.split(/[\n,\s]+/).map((value) => value.trim()).filter(Boolean), [urls]);

  const selectFile = (selected?: File) => {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.csv')) { setError('Choose a .csv file to upload.'); return; }
    setFile(selected); setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!file && !parsedUrls.length) { setError('Add at least one URL or choose a CSV file.'); return; }
    if (!file && parsedUrls.length > 1000) { setError('A batch can contain up to 1,000 URLs.'); return; }
    const invalid = parsedUrls.find((value) => { try { const url = new URL(value); return !['http:', 'https:'].includes(url.protocol); } catch { return true; } });
    if (!file && invalid) { setError(`“${invalid}” is not a valid HTTP or HTTPS URL.`); return; }
    if (!file && new Set(parsedUrls).size !== parsedUrls.length) { setError('Remove duplicate URLs before starting the batch.'); return; }
    setBusy(true);
    try { const batch = file ? await api.uploadCsv(file) : await api.createBatch(parsedUrls); onCreated(batch); setUrls(''); setFile(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the batch.'); }
    finally { setBusy(false); }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]); };

  return <section className="new-batch-card">
    <div className="section-heading create-heading"><div><span className="eyebrow">QUICK START</span><h2>Run a new check</h2><p>Paste your URLs or upload a CSV. We’ll take it from there.</p></div><span className="create-heading-icon"><Icon name="pulse" size={19} /></span></div>
    <form onSubmit={submit}>
      <label className="field-label" htmlFor="url-list">Website URLs <span>One URL per line</span></label>
      <div className="textarea-wrap"><textarea id="url-list" value={urls} onChange={(event) => { setUrls(event.target.value); if (file) setFile(null); }} placeholder={'https://acme.com\nhttps://docs.acme.com\nhttps://status.acme.com'} rows={4} disabled={busy || !!file} /><span className="url-count"><Icon name="globe" size={13} />{parsedUrls.length} / 1,000</span></div>
      <div className="composer-bottom">
        <label className={`csv-drop ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0])} />
          <span className="csv-icon"><Icon name={file ? 'check' : 'upload'} size={15} /></span><span className="csv-copy"><strong>{file ? file.name : 'Upload CSV'}</strong><small>{file ? 'Ready to import' : 'or drag and drop · max 2 MB'}</small></span>{file && <button type="button" className="clear-file" aria-label="Remove CSV" onClick={(event) => { event.preventDefault(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}><Icon name="x" size={14} /></button>}
        </label>
        <button className="button button-primary run-button" type="submit" disabled={busy}><span>{busy ? 'Starting…' : 'Start batch'}</span><Icon name="arrow" size={16} /></button>
      </div>
      {error && <div className="inline-error"><Icon name="alert" size={15} />{error}</div>}
    </form>
  </section>;
}

export function Dashboard() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [created, setCreated] = useState('');
  const [today, setToday] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try { setBatches(await api.listBatches()); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load batches.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { setToday(new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase()); void load(true); const timer = window.setInterval(() => void load(true), 5000); return () => window.clearInterval(timer); }, [load]);

  const active = batches.filter((batch) => batch.status === 'PENDING' || batch.status === 'RUNNING').length;
  const totalUrls = batches.reduce((sum, batch) => sum + batch.totalUrls, 0);
  const completedUrls = batches.reduce((sum, batch) => sum + batch.completedUrls, 0);
  const failedUrls = batches.reduce((sum, batch) => sum + batch.failedUrls, 0);
  const successRate = completedUrls ? Math.round(((completedUrls - failedUrls) / completedUrls) * 100) : 100;
  const visibleBatches = batches.filter((batch) => batch.id.toLowerCase().includes(query.toLowerCase()) || batch.status.toLowerCase().includes(query.toLowerCase()));

  const handleCreated = (batch: Batch) => { setCreated(batch.id); setBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)]); window.setTimeout(() => setCreated(''), 6000); };

  return <div className="app-shell"><Sidebar />
    <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14} /><strong>Overview</strong></div><div className="topbar-actions"><span className={`connection-indicator ${error ? 'connection-error' : ''}`} title={error || 'Connected to the batch API'}><span />{error ? 'API unavailable' : loading ? 'Connecting…' : 'API connected'}</span><span className="topbar-divider" /><button className={`icon-button refresh-button ${refreshing ? 'spinning' : ''}`} onClick={() => void load()} title="Refresh batches" aria-label="Refresh batches"><Icon name="refresh" size={17} /></button><button className="topbar-avatar" aria-label="Signed in as Santosh Pokhrel">SP</button></div></header>
      <div className="page-wrap">
        <section className="welcome-row"><div><div className="date-label">{today || 'YOUR WORKSPACE'}</div><h1>Good morning, Santosh <span className="wave">✳</span></h1><p>Here’s what’s happening with your website checks.</p></div><a className="button button-dark" href="#new-batch"><Icon name="plus" size={16} />New batch</a></section>
        {error && <div className="notice notice-error"><Icon name="alert" size={17} /><span>{error} <button onClick={() => void load()}>Try again</button></span></div>}
        {created && <div className="notice notice-success"><Icon name="check" size={17} /><span>Batch <strong>{shortId(created)}</strong> started successfully. <Link href={`/batches/${created}`}>View batch <Icon name="arrow" size={13} /></Link></span><button className="notice-dismiss" onClick={() => setCreated('')} aria-label="Dismiss"><Icon name="x" size={15} /></button></div>}
        <section className="metrics-grid" aria-label="Batch metrics">
          <MetricCard label="URLs monitored" value={totalUrls.toLocaleString()} hint="Across recent batches" icon="globe" tone="metric-purple" />
          <MetricCard label="Healthy rate" value={`${successRate}%`} hint={completedUrls ? `${(completedUrls - failedUrls).toLocaleString()} checks passed` : 'No completed checks yet'} icon="check" tone="metric-green" />
          <MetricCard label="Failed checks" value={failedUrls.toLocaleString()} hint={failedUrls ? 'Needs your attention' : 'Everything looks good'} icon="alert" tone="metric-orange" />
          <MetricCard label="Active batches" value={active.toString()} hint="Currently processing" icon="activity" tone="metric-blue" />
        </section>
        <div id="new-batch" className="content-grid"><NewBatchCard onCreated={handleCreated} />
          <aside className="side-info"><div className="tip-card"><div className="tip-icon"><Icon name="shield" size={18} /></div><span className="eyebrow">BUILT FOR RELIABILITY</span><h3>Know before your customers do.</h3><p>PulseCheck checks every URL from your list and flags downtime, slow responses, and errors.</p><div className="tip-stat"><span className="tip-stat-mark"><Icon name="clock" size={14} /></span><span>Checks run in parallel</span><span className="tip-stat-value">5 at a time</span></div><div className="tip-stat"><span className="tip-stat-mark"><Icon name="refresh" size={14} /></span><span>Automatic retries</span><span className="tip-stat-value">Up to 4×</span></div></div><div className="support-card"><span className="support-mark"><Icon name="activity" size={17} /></span><div><strong>Checks run automatically</strong><small>Results update while work is in progress</small></div><span className="support-dot" /></div></aside>
        </div>
        <section id="batches" className="batch-section"><div className="batch-header"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Recent batches <span className="batch-count">{batches.length}</span></h2></div><div className="batch-tools"><label className="search-box"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search batches…" aria-label="Search batches" /></label><button className={`icon-button table-refresh ${refreshing ? 'spinning' : ''}`} onClick={() => void load()} title="Refresh list" aria-label="Refresh batch list"><Icon name="refresh" size={16} /></button></div></div>
          <div className="table-card"><div className="table-scroll"><table><thead><tr><th>BATCH</th><th>STATUS</th><th>URLS</th><th>PROGRESS</th><th>CREATED</th><th /></tr></thead><tbody>
            {loading ? <tr><td colSpan={6}><div className="table-state"><span className="spinner" />Loading your batches…</div></td></tr> : visibleBatches.length === 0 ? <tr><td colSpan={6}><div className="empty-state"><span className="empty-icon"><Icon name="layers" size={20} /></span><strong>{query ? 'No matching batches' : 'No batches yet'}</strong><span>{query ? 'Try another search.' : 'Start your first batch above to see URL health at a glance.'}</span>{!query && <a href="#new-batch" className="empty-link">Create a batch <Icon name="arrow" size={14} /></a>}</div></td></tr> : visibleBatches.map((batch) => <tr key={batch.id} className="batch-row"><td><Link className="batch-link" href={`/batches/${batch.id}`}><span className="batch-symbol"><Icon name="globe" size={15} /></span><span><strong>Batch {shortId(batch.id)}</strong><small>{batch.id}</small></span></Link></td><td><StatusBadge status={batch.status} /></td><td><span className="url-number">{batch.totalUrls.toLocaleString()} <small>URLs</small></span></td><td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${batch.totalUrls ? Math.min(100, batch.completedUrls / batch.totalUrls * 100) : 0}%` }} /></div><span>{batch.completedUrls}/{batch.totalUrls}</span></div></td><td className="date-cell">{formatDate(batch.createdAt)}</td><td><Link className="row-action" href={`/batches/${batch.id}`} aria-label={`View batch ${shortId(batch.id)}`}><Icon name="arrow" size={16} /></Link></td></tr>)}
          </tbody></table></div><div className="table-footer"><span>Showing {visibleBatches.length} of {batches.length} batches</span><span className="live-label"><span />Live updates</span></div></div>
        </section>
        <footer className="page-footer"><span>© {new Date().getFullYear()} PulseCheck</span><span>Built for a healthier internet <span className="footer-heart">♥</span></span><span>Bulk URL health monitoring</span></footer>
      </div>
    </main>
  </div>;
}
