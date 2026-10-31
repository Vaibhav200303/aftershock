import React, { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from '../store.js';
import { islandId, runPreferences, switchIsland } from './api.js';
import './world.css';

const fmt = x => x == null ? '—' : Number(x || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const SECTIONS = [['council', 'Village council'], ['runs', 'Run history'], ['experiment', 'Next experiment']];
const ISLANDS = [
  { id: 'day', name: 'Sunhaven', icon: 'sun', note: 'Food & timber', setting: 'Sunlit village' },
  { id: 'night', name: 'Moonharbor', icon: 'moon', note: 'Crafts & warmth', setting: 'Lantern terraces' },
];
const ICONS = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M20 14A8.5 8.5 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z" />,
  council: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></>,
  runs: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6m-6 4h6m-6 4h3" /></>,
  experiment: <><path d="M9 3h6m-5 0v6L4 19a1.4 1.4 0 0 0 1.2 2h13.6a1.4 1.4 0 0 0 1.2-2L14 9V3M7 15h10" /><path d="M10 18h.01" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  book: <><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1v15" /><path d="M5 8h4m6 0h4M5 12h4m6 0h4" /></>,
};
function Icon({ name, className = '' }) {
  return <svg className={`archive-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}
function EmptyState({ title, children, action, onAction, journal = false }) {
  return <div className={`world-empty ${journal ? 'world-empty-journal' : ''}`}>
    {journal ? <img src="/images/archive/journal.png" alt="" width="240" height="160" /> : <span className="archive-empty-icon"><Icon name="runs" /></span>}
    <h4>{title}</h4><p>{children}</p>
    {action && <button className="archive-primary" onClick={onAction}><Icon name="experiment" />{action}<Icon name="arrow" /></button>}
  </div>;
}
function Council({ lessons, filter, setFilter, busy, review, memoryConfigured, onExperiment }) {
  const filtered = lessons.filter(l => filter === 'all' || l.status === filter);
  return <>
    <div className="archive-section-heading"><div><h3>Village council</h3><p>Discover what your villagers learned. Review the evidence before sharing a lesson with future villages.</p></div><span className="archive-total">{lessons.length} {lessons.length === 1 ? 'observation' : 'observations'}</span></div>
    <div className="archive-filters" role="group" aria-label="Filter observations">
      {[['all', 'All observations'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span>{key === 'all' ? lessons.length : lessons.filter(l => l.status === key).length}</span></button>)}
    </div>
    {!lessons.length ? <EmptyState journal title="Your village’s story starts here" action="Set up an experiment" onAction={onExperiment}>Run a disaster experiment to collect the council’s first observations.</EmptyState> : !filtered.length ? <EmptyState title={`No ${filter} observations`}>Choose another filter to see the rest of the council’s findings.</EmptyState> : <div className="archive-lessons">{filtered.map(l => <article className="archive-lesson" key={l.id}>
      <div className="world-row"><strong><Icon name="council" />{l.role}</strong><span className={`archive-status status-${l.status}`}>{l.status}</span></div>
      <p className="archive-lesson-text">{l.text}</p>
      <details className="archive-evidence"><summary>View source evidence <span>Rounds {l.startRound}–{l.endRound}</span></summary><dl><dt>Run</dt><dd>{l.runId}</dd><dt>Rounds</dt><dd>{l.startRound}–{l.endRound}</dd><dt>Food reserves</dt><dd>{l.evidence.foodBefore} → {l.evidence.foodAfter}</dd><dt>Wood reserves</dt><dd>{l.evidence.woodBefore} → {l.evidence.woodAfter}</dd><dt>Hungry / cold agent-rounds</dt><dd>{l.evidence.hungry} / {l.evidence.cold}</dd></dl></details>
      <div className="archive-lesson-footer"><p className="world-help">Memory publication: <b>{l.publication}</b></p><div className="world-actions">{l.status === 'pending' && <><button className="archive-primary" disabled={busy !== null} onClick={() => review(l, 'approve')}>{busy === l.id ? 'Saving…' : 'Approve public lesson'}</button><button disabled={busy !== null} onClick={() => review(l, 'reject')}>Reject</button></>}{l.status === 'approved' && l.publication !== 'verified' && memoryConfigured && <button disabled={busy !== null} onClick={() => review(l, 'retry')}>{busy === l.id ? 'Publishing…' : 'Retry Meko publication'}</button>}</div></div>
    </article>)}</div>}
  </>;
}
function RunHistory({ runs, onExperiment }) {
  return <>
    <div className="archive-section-heading"><div><h3>Run history</h3><p>Compare how this island responds, with and without shared memories.</p></div><span className="archive-total">{runs.length} saved {runs.length === 1 ? 'run' : 'runs'}</span></div>
    {!runs.length ? <EmptyState title="No chapters saved yet" action="Set up an experiment" onAction={onExperiment}>Start a village to record its economy, outcomes, and disaster recovery.</EmptyState> : <>
      <div className="archive-comparison-note"><Icon name="runs" /><p>For a fair comparison, match the island, seed, model, population, and scenario. Run length and manual changes matter; model decisions can vary.</p></div>
      <div className="world-table" role="region" aria-label="Saved run outcomes" tabIndex="0"><table><caption>Saved outcomes for this island</caption><thead><tr><th scope="col">Run</th><th scope="col">Memory</th><th scope="col">Scenario</th><th scope="col">Rounds</th><th scope="col">Hungry / cold<br />agent-rounds</th><th scope="col">Food / wood</th><th scope="col">GDP</th><th scope="col">Debt</th><th scope="col">Recovery<br />round</th></tr></thead><tbody>{runs.map(r => <tr key={r.id}><td><details><summary><span className="archive-run-id">{r.id.slice(0, 8)}</span><span className="archive-run-status">{r.status}</span></summary><p>Seed {r.seed} · {r.agents} villagers · {r.model}</p><p>Comparison group {r.matchKey?.slice(0, 12)}</p><p>Conditions: {(r.conditions || []).map(c => `r${c.round}: ${c.signature || 'baseline'}`).join('; ')}</p></details></td><td><span className={`archive-memory ${r.memoryEnabled ? 'memory-on' : ''}`}>{r.memoryEnabled ? 'On' : 'Off'}</span></td><td>{r.scenario}</td><td>{r.round}</td><td>{fmt(r.metrics.hungryAgentRounds)} / {fmt(r.metrics.coldAgentRounds)}</td><td>{fmt(r.metrics.food)} / {fmt(r.metrics.wood)}</td><td>{fmt(r.metrics.lastGdp)}</td><td>{fmt(r.metrics.debt)}</td><td>{fmt(r.metrics.recoveryRound)}</td></tr>)}</tbody></table></div>
      <p className="world-help archive-table-note">Recovery is the first hunger-free and cold-free round after a shock ends. Scroll the table to see all outcomes.</p>
    </>}
  </>;
}
function Experiment({ prefs, preference, activeIsland, id }) {
  return <>
    <div className="archive-section-heading"><div><h3>Next experiment</h3><p>Choose the conditions for your next village. Your current run keeps its original settings.</p></div><span className="archive-total">Applies on Start</span></div>
    <div className="archive-experiment-layout"><div className="world-form">
      <label htmlFor="archive-scenario">Scenario<span className="archive-field-help">Explore freely or run a controlled disaster.</span><select id="archive-scenario" value={prefs.scenario} onChange={e => preference('scenario', e.target.value)}><option value="free">Free play · no automatic end</option><option value="cold">Cold snap · 12-round experiment</option><option value="blight">Blight · 12-round experiment</option></select></label>
      <label htmlFor="archive-seed">Starting seed<span className="archive-field-help">Use the same seed when comparing runs.</span><input id="archive-seed" type="number" min="0" max="2147483647" value={prefs.seed} onChange={e => preference('seed', Number(e.target.value))} /></label>
      <label className="world-check"><input type="checkbox" checked={prefs.memoryEnabled} onChange={e => preference('memoryEnabled', e.target.checked)} /><span><b>Recall approved observations</b><small>Let model agents use this island’s reviewed disaster memories.</small></span></label>
      <p className="archive-saved"><Icon name="check" />Choices saved for the next village</p>
    </div><aside className="archive-experiment-guide"><Icon name="experiment" /><h4>One experiment, two perspectives</h4><ol><li>Run with memory recall off.</li><li>Review the council’s evidence and approve a lesson.</li><li>Repeat the same setup with recall on.</li></ol><p>Disaster experiments begin their shock before round 3 and return to normal before round 8.</p></aside></div>
    <p className="archive-method-note">Both modes record outcomes. Memory is retrieved once per round for the village and supplied to real model agents. Scripted villagers do not learn from text; improvement is measured, never assumed.</p>
    {activeIsland && activeIsland !== id && <p className="archive-notice" role="status">The other island is active. Stop it before starting this economy.</p>}
  </>;
}
export default function WorldHub() {
  const [open, setOpen] = useState(false), [tab, setTab] = useState('council'), [filter, setFilter] = useState('all');
  const [data, setData] = useState(null), [activeIsland, setActiveIsland] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(null);
  const [prefs, setPrefs] = useState(() => ({ memoryEnabled: true, scenario: 'free', seed: 12345, ...runPreferences() }));
  const close = useRef(null), panel = useRef(null), content = useRef(null), loadVersion = useRef(0);
  const id = islandId(), name = id === 'night' ? 'Moonharbor' : 'Sunhaven';
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const r = await fetch('/learning');
      if (!r.ok) throw Error('Could not load village history. Please try again.');
      const next = await r.json();
      if (version === loadVersion.current) { setData(next); setError(''); }
    } catch (e) { if (version === loadVersion.current) setError(e.message); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, []);
  useEffect(() => subscribe(s => setActiveIsland(s.activeIsland ?? null)), []);
  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(load, 5000), previous = document.activeElement, overflow = document.body.style.overflow;
    const host = panel.current.closest('.world-veil').parentElement;
    const background = [...document.body.children].filter(el => el !== host && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)).map(el => [el, el.inert]);
    background.forEach(([el]) => { el.inert = true; });
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); }
      if (e.key === 'Tab') {
        const items = [...panel.current.querySelectorAll('button:not(:disabled),a,input,select,summary,[tabindex="0"]')].filter(el => el.getClientRects().length);
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { clearInterval(timer); loadVersion.current++; window.removeEventListener('keydown', key, true); background.forEach(([el, inert]) => { el.inert = inert; }); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [open, load]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [tab]);
  function preference(key, value) {
    const next = { ...prefs, [key]: value };
    try { localStorage.setItem('aftershock.run-options', JSON.stringify(next)); setPrefs(next); setError(''); }
    catch { setError('Your browser could not save these choices. Allow local storage and try again.'); }
  }
  async function review(lesson, action) {
    if (action === 'approve' && !confirm('Approve this exact observation for public village memory? If Meko is connected it will be sent to this island’s datapack.')) return;
    setBusy(lesson.id);
    try {
      const r = await fetch('/learning/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lesson.id, action }) });
      if (!r.ok) throw Error('Could not save the review. Please try again.');
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  }
  function navigate(key, focus = false) {
    setTab(key);
    if (focus) document.getElementById(`archive-tab-${key}`)?.focus();
  }
  function tabKey(event, key) {
    const current = SECTIONS.findIndex(([id]) => id === key);
    const next = ['ArrowDown', 'ArrowRight'].includes(event.key) ? (current + 1) % SECTIONS.length : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? (current + SECTIONS.length - 1) % SECTIONS.length : event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1 : null;
    if (next !== null) { event.preventDefault(); navigate(SECTIONS[next][0], true); }
  }
  const lessons = data?.lessons || [], runs = data?.runs || [];
  const databaseConnected = data?.storage?.storage === 'yugabyte', memoryConnected = data?.memory?.connected;
  return <>
    <div className="world-controls"><button onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} inert={open ? '' : undefined}><Icon name={id === 'night' ? 'moon' : 'sun'} />{name}<span>Village archive</span></button></div>
    {open && <div className="world-veil" onClick={() => setOpen(false)}><section ref={panel} className="world-hub" role="dialog" aria-modal="true" aria-labelledby="archive-title" onClick={e => e.stopPropagation()}>
      <header className="archive-header"><span className="archive-header-icon"><Icon name="book" /></span><div><h2 id="archive-title">Village archive</h2><p>Every island has a story.</p></div><button ref={close} className="archive-close" onClick={() => setOpen(false)} aria-label="Close village archive"><Icon name="close" /></button></header>
      <div className="archive-layout"><aside className="archive-sidebar">
        <div className="world-islands" role="group" aria-label="Choose island">{ISLANDS.map(island => <button key={island.id} className={`archive-island island-${island.id}`} aria-pressed={id === island.id} title={`${island.setting}. One simulation runs at a time; switching views leaves it running.`} aria-label={`${island.name}, ${island.note}${id === island.id ? ', current island' : ''}`} onClick={() => id !== island.id && switchIsland(island.id)}><span className="archive-island-icon"><Icon name={island.icon} /></span><span className="archive-island-copy"><b>{island.name}</b><small>{island.note}</small>{activeIsland === island.id && <em>Simulation active</em>}</span>{id === island.id && <Icon className="archive-island-check" name="check" />}</button>)}</div>
        <nav className="archive-nav" role="tablist" aria-label="Archive sections">{SECTIONS.map(([key, label]) => <button key={key} id={`archive-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="archive-panel" tabIndex={tab === key ? 0 : -1} onKeyDown={e => tabKey(e, key)} onClick={() => navigate(key)}><Icon name={key} /><span>{label}</span>{key === 'council' && lessons.some(l => l.status === 'pending') && <span className="archive-nav-count">{lessons.filter(l => l.status === 'pending').length}</span>}</button>)}</nav>
        <p className="archive-island-note"><Icon name={id === 'night' ? 'moon' : 'sun'} /><span><b>{name}</b> keeps its own economy and memories.</span></p>
      </aside>
      <main ref={content} className="world-content" id="archive-panel" role="tabpanel" aria-labelledby={`archive-tab-${tab}`} tabIndex="0" aria-busy={loading}>
        {error && <div className="archive-error" role="alert"><p>{error}</p><button onClick={load}>Retry</button></div>}
        {loading ? <div className="archive-loading" role="status"><Icon name="book" /><p>Opening the village archive…</p></div> : !data ? <EmptyState title="The archive is unavailable">Use Retry above to reconnect to your village’s history.</EmptyState> : <>
          {tab === 'council' && <Council lessons={lessons} filter={filter} setFilter={setFilter} busy={busy} review={review} memoryConfigured={data?.memory?.configured} onExperiment={() => navigate('experiment', true)} />}
          {tab === 'runs' && <RunHistory runs={runs} onExperiment={() => navigate('experiment', true)} />}
          {tab === 'experiment' && <Experiment prefs={prefs} preference={preference} activeIsland={activeIsland} id={id} />}
        </>}
      </main></div>
      <footer className="archive-footer"><span className="archive-footer-note">Your village’s past, ready for its next chapter.</span><div className="world-service" aria-label="Archive connections"><span className={databaseConnected ? 'service-connected' : 'service-local'} title={databaseConnected ? 'Run history is stored in YugabyteDB.' : data?.storage?.databaseConfigured ? 'Database reconnecting. Local checkpoints remain safe.' : 'Run history is saved locally.'}><i aria-hidden="true" />YugabyteDB <b>{!data ? 'Checking…' : databaseConnected ? 'Connected' : data?.storage?.databaseConfigured ? 'Reconnecting' : 'Local backup'}</b></span><span className={memoryConnected ? 'service-connected' : 'service-local'} title="Meko stores approved public disaster observations for this island."><i aria-hidden="true" />Meko <b>{!data ? 'Checking…' : memoryConnected ? 'Connected' : data?.memory?.configured ? 'Connecting' : 'Not configured'}</b></span></div></footer>
    </section></div>}
  </>;
}
