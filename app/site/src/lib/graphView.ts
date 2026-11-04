// Interactive concept network for the graph page.
// Three views, one stage: all groups (bubbles) -> one group (its main concepts, one sector per kind) -> one concept (what goes with it).
// Circles are concepts or groups; a line means "occur in the same projects more often than chance", never cause and effect.
// Kind is shown by colour AND shape AND the sector label; only three kinds have a validated hue (dataviz skill: five hues cannot be told
// apart for every viewer), the other two are neutral tones, so shape and label carry the meaning, not colour alone.
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force';

export type Kind = 'approach' | 'target_group' | 'output' | 'problem' | 'topic';
type Row = [string, Kind, string, string | null, number, number, number, number, number, number, string];
const KINDS: Kind[] = ['approach', 'target_group', 'output', 'problem', 'topic'];

interface Vn {
  id: string; idx: number; label: string; full: string; kind: Kind | 'group'; r: number; x: number; y: number;
  tx: number; ty: number; fx?: number | null; fy?: number | null; n: number; center?: boolean; deco?: boolean;
}
interface Vl { source: Vn; target: Vn; w: number; weak?: boolean }
type State = { mode: 'overview' } | { mode: 'group'; comm: string } | { mode: 'focus'; idx: number };
type Zoom = { k: number; x: number; y: number };

export interface Texts {
  gAll: string; gHowTo: string; gLegendSize: string; gLegendLine: string; gStage: string; gProjects: string; gProjectsFor: (n: number) => string; gKinds: Record<string, string>; gKindOne: Record<string, string>;
  gZoomIn: string; gZoomOut: string; gZoomReset: string; gMore: string; gLess: string; gShowOverview: (n: number) => string; gShowGroup: (name: string, n: number) => string; gShowConcept: (name: string, n: number) => string; gGroup: string; gNoLinks: string;
}
export interface Opts { root: HTMLElement; g: any; lang: 'en' | 'hr'; t: Texts; onConcept: (i: number) => void; onNone: () => void }

const SVG = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number> = {}, parent?: Element) => {
  const e = document.createElementNS(SVG, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent?.append(e);
  return e as SVGElement;
};
const shape = (kind: string, r: number) => {
  const q = r * 1.18;
  switch (kind) {
    case 'target_group': return `M${-r},${-r}h${2 * r}v${2 * r}h${-2 * r}z`;
    case 'output': return `M0,${-q}L${q},0L0,${q}L${-q},0z`;
    case 'problem': return `M0,${-q}L${q},${q * 0.8}L${-q},${q * 0.8}z`;
    case 'topic': { const p = [0, 1, 2, 3, 4, 5].map((k) => `${(q * Math.cos(Math.PI / 3 * k)).toFixed(1)},${(q * Math.sin(Math.PI / 3 * k)).toFixed(1)}`); return `M${p.join('L')}z`; }
    default: return `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;      // approach and groups: circle
  }
};

export function mountGraph(o: Opts) {
  const { root, g, lang, t } = o;
  const nodes = g.nodes as Row[];
  const nf = new Intl.NumberFormat(lang === 'hr' ? 'hr-HR' : 'en-GB');
  const pick = (a: [string, string | null] | undefined) => (a ? (lang === 'hr' && a[1] ? a[1] : a[0]) : '');
  const nameOf = (i: number) => (lang === 'hr' && nodes[i][3] ? nodes[i][3]! : nodes[i][2]);
  const commTitle = (k: any) => (k.name && (lang === 'hr' ? k.name[1] || k.name[0] : k.name[0])) || [k.top_approach[0], k.top_target_group[0], k.top_topic[0]].filter(Boolean).slice(0, 2).map(pick).join(' · ');
  const cut = (s: string, m: number) => (s.length > m ? s.slice(0, m - 1).trimEnd() + '…' : s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- data: neighbours of each concept, and cross-group weights
  const adj: [number, number, number][][] = nodes.map(() => []);
  const edge = new Map<number, number>();
  for (const [a, b, n] of g.edges as number[][]) {
    const cos = n / Math.sqrt(nodes[a][4] * nodes[b][4]);
    adj[a].push([b, n, cos]); adj[b].push([a, n, cos]);
    edge.set(Math.min(a, b) * 10000 + Math.max(a, b), cos);
  }
  const commIds = new Set((g.communities as any[]).map((k) => k.id));
  const commW = new Map<string, number>();
  for (const [a, b, n] of g.edges as number[][]) {
    const ca = nodes[a][10], cb = nodes[b][10];
    if (ca && cb && ca !== cb && commIds.has(ca) && commIds.has(cb)) {
      const key = ca < cb ? ca + '|' + cb : cb + '|' + ca;
      commW.set(key, (commW.get(key) ?? 0) + n / Math.sqrt(nodes[a][4] * nodes[b][4]));
    }
  }

  // ---- skeleton
  root.innerHTML = '';
  root.classList.add('gv');
  const crumbs = document.createElement('nav'); crumbs.className = 'gv-crumbs'; crumbs.setAttribute('aria-label', t.gStage);
  const legend = document.createElement('div'); legend.className = 'gv-legend';
  legend.innerHTML = KINDS.map((k) => `<span class="gv-key k-${k}"><svg width="18" height="18" viewBox="-10 -10 20 20" aria-hidden="true"><path d="${shape(k, 6.5)}"/></svg>${t.gKinds[k]}</span>`).join('') +
    `<span class="gv-key gv-note">${t.gLegendSize}</span><span class="gv-key gv-note">${t.gLegendLine}</span>`;
  const stage = document.createElement('div'); stage.className = 'gv-stage';
  const svg = el('svg', { role: 'group', 'aria-label': t.gStage }) as SVGSVGElement;
  const tip = document.createElement('div'); tip.className = 'gv-tip'; tip.hidden = true; tip.setAttribute('aria-hidden', 'true');
  const bar = document.createElement('div'); bar.className = 'gv-zoombar';
  const mk = (txt: string, label: string, fn: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); bar.append(b); return b; };
  stage.append(svg, tip, bar);
  const how = document.createElement('p'); how.className = 'gv-how'; how.textContent = t.gHowTo;
  const live = document.createElement('p'); live.className = 'gv-live'; live.setAttribute('role', 'status');
  root.append(crumbs, legend, stage, how, live);

  let state: State = { mode: 'overview' };
  let first = true;                                   // the first draw must not erase a #link the page was opened with
  let more = false;                                   // group view: show more concepts per kind
  let zoom: Zoom = { k: 1, x: 0, y: 0 };
  let zoomEl: SVGElement | null = null;
  let W = 900, H = 560;
  let sim: any = null;
  let cur: Vn[] = [];
  const pos = new Map<string, [number, number]>();

  function stageSize() {
    W = Math.max(300, Math.round(stage.clientWidth || 900));
    H = W < 600 ? Math.round(Math.min(640, W * 1.7)) : Math.round(Math.min(620, W * 0.62));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H));
  }

  // ---- zoom and pan: buttons, Ctrl+wheel, drag on the background (a plain wheel keeps scrolling the page)
  const applyZoom = () => zoomEl?.setAttribute('transform', `translate(${zoom.x.toFixed(1)},${zoom.y.toFixed(1)}) scale(${zoom.k.toFixed(3)})`);
  function zoomAt(f: number, cx = W / 2, cy = H / 2) {
    const k = Math.max(0.6, Math.min(4, zoom.k * f));
    zoom = { k, x: cx - ((cx - zoom.x) / zoom.k) * k, y: cy - ((cy - zoom.y) / zoom.k) * k };
    applyZoom();
  }
  const clientToSvg = (e: { clientX: number; clientY: number }) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM()!.inverse()); return [q.x, q.y] as [number, number]; };
  mk('+', t.gZoomIn, () => zoomAt(1.4)); mk('−', t.gZoomOut, () => zoomAt(1 / 1.4)); mk('⟲', t.gZoomReset, () => { zoom = { k: 1, x: 0, y: 0 }; applyZoom(); });
  const moreBtn = mk('', t.gMore, () => { more = !more; render(); }); moreBtn.className = 'gv-more'; moreBtn.hidden = true;
  svg.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); const [x, y] = clientToSvg(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y); }, { passive: false });
  let pan: { sx: number; sy: number; zx: number; zy: number } | null = null;
  svg.addEventListener('pointerdown', (e) => { if ((e.target as Element).closest('.gv-node')) return; pan = { sx: e.clientX, sy: e.clientY, zx: zoom.x, zy: zoom.y }; svg.setPointerCapture(e.pointerId); svg.classList.add('panning'); });
  svg.addEventListener('pointermove', (e) => { if (!pan) return; const sc = W / stage.clientWidth; zoom.x = pan.zx + (e.clientX - pan.sx) * sc; zoom.y = pan.zy + (e.clientY - pan.sy) * sc; applyZoom(); });
  const endPan = () => { pan = null; svg.classList.remove('panning'); };
  svg.addEventListener('pointerup', endPan); svg.addEventListener('pointercancel', endPan);

  // ---- models
  function overviewModel() {
    const ks = g.communities as any[];
    const vn: Vn[] = ks.map((k, i) => ({ id: k.id, idx: i, label: cut(commTitle(k), W < 600 ? 20 : 30), full: commTitle(k), kind: 'group', r: 10 + Math.sqrt(k.n) * 1.45, x: 0, y: 0, tx: W / 2, ty: H / 2, n: k.n }));
    const byId = new Map(vn.map((v) => [v.id, v]));
    const ws = [...commW.entries()].sort((a, b) => b[1] - a[1]).slice(0, 48);
    const max = ws[0]?.[1] ?? 1;
    const links: Vl[] = ws.map(([key, w]) => { const [a, b] = key.split('|'); return { source: byId.get(a)!, target: byId.get(b)!, w: w / max }; });
    return { vn, links, layout: 'force' as const };
  }
  function sectors(items: { v: Vn; kind: Kind; strength: number }[], cx: number, cy: number, rx: number, ry: number, inner: number) {
    // one angular sector per kind, wide as its share of the circles; stronger = nearer the middle
    const by = new Map<Kind, typeof items>();
    for (const it of items) by.set(it.kind, [...(by.get(it.kind) ?? []), it]);
    const kinds = KINDS.filter((k) => by.has(k));
    const wts = kinds.map((k) => 1.5 + by.get(k)!.length);
    const total = wts.reduce((a, b) => a + b, 0);
    let a0 = -Math.PI / 2 - (wts[0] / total) * Math.PI;
    const marks: { kind: Kind; x: number; y: number }[] = [];
    kinds.forEach((k, ki) => {
      const span = (wts[ki] / total) * 2 * Math.PI;
      const list = by.get(k)!.sort((p, q) => q.strength - p.strength);
      list.forEach((it, j) => {
        const f = list.length > 1 ? j / (list.length - 1) : 0;
        const ring = inner + (1 - inner) * (0.1 + 0.9 * f) - (j % 2 ? 0 : (1 - inner) * 0.1);
        const ang = a0 + span * ((j + 0.5) / list.length);
        it.v.tx = cx + rx * ring * Math.cos(ang); it.v.ty = cy + ry * ring * Math.sin(ang);
      });
      const am = a0 + span / 2;
      marks.push({ kind: k, x: cx + (rx + 6) * Math.cos(am) * 1.0, y: cy + (ry + 30) * Math.sin(am) });
      a0 += span;
    });
    return marks;
  }
  const rOf = (n: number) => Math.max(6.5, Math.min(22, 4 + Math.sqrt(n) * 0.8));
  function groupModel(comm: string) {
    const members = nodes.map((n, i) => ({ n, i })).filter((x) => x.n[10] === comm);
    const chosen: number[] = [];
    for (const k of KINDS) members.filter((x) => x.n[1] === k).sort((a, b) => b.n[4] - a.n[4]).slice(0, (W < 600 ? 4 : 7) * (more ? 2 : 1)).forEach((x) => chosen.push(x.i));
    const vn: Vn[] = chosen.map((i) => ({ id: nodes[i][0], idx: i, label: cut(nameOf(i), W < 600 ? 16 : 28), full: nameOf(i), kind: nodes[i][1], r: rOf(nodes[i][4]), x: 0, y: 0, tx: 0, ty: 0, n: nodes[i][4] }));
    const byIdx = new Map(vn.map((v) => [v.idx, v]));
    const links: Vl[] = [];
    for (const v of vn) for (const [j, , cos] of adj[v.idx]) if (j > v.idx && byIdx.has(j)) links.push({ source: v, target: byIdx.get(j)!, w: cos });
    links.sort((a, b) => b.w - a.w);
    const rank = new Map<Vn, number>(), keep: Vl[] = [];                      // every circle keeps its two strongest lines, the rest is hairball
    for (const l of links) { const a = rank.get(l.source) ?? 0, b = rank.get(l.target) ?? 0; if (a < 2 || b < 2) { keep.push(l); rank.set(l.source, a + 1); rank.set(l.target, b + 1); } }
    const marks = sectors(vn.map((v) => ({ v, kind: v.kind as Kind, strength: v.n })), W / 2, H / 2, W / 2 - (W < 600 ? 66 : 110), H / 2 - 62, 0.3);
    return { vn, links: keep, layout: 'sectors' as const, marks };
  }
  function focusModel(i: number) {
    const rel = [...adj[i]].sort((a, b) => b[2] - a[2]);
    const take: [number, number, number][] = [];
    const per = new Map<Kind, number>();
    for (const r of rel) { const k = nodes[r[0]][1]; if ((per.get(k) ?? 0) < (W < 600 ? 4 : 6)) { take.push(r); per.set(k, (per.get(k) ?? 0) + 1); } }
    const c: Vn = { id: nodes[i][0], idx: i, label: cut(nameOf(i), 40), full: nameOf(i), kind: nodes[i][1], r: Math.max(16, rOf(nodes[i][4]) + 4), x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, fx: W / 2, fy: H / 2, n: nodes[i][4], center: true };
    const vn: Vn[] = [c, ...take.map(([j]) => ({ id: nodes[j][0], idx: j, label: cut(nameOf(j), W < 600 ? 16 : 28), full: nameOf(j), kind: nodes[j][1], r: rOf(nodes[j][4]), x: 0, y: 0, tx: 0, ty: 0, n: nodes[j][4] }))];
    const links: Vl[] = take.map(([j, , cos], k) => ({ source: c, target: vn[k + 1], w: cos }));
    for (let a = 1; a < vn.length; a++) for (let b = a + 1; b < vn.length; b++) {
      const w = edge.get(Math.min(vn[a].idx, vn[b].idx) * 10000 + Math.max(vn[a].idx, vn[b].idx));
      if (w) links.push({ source: vn[a], target: vn[b], w, weak: true });
    }
    const strength = new Map(take.map(([j, , cos]) => [j, cos]));
    const marks = sectors(vn.slice(1).map((v) => ({ v, kind: v.kind as Kind, strength: strength.get(v.idx) ?? 0 })), W / 2, H / 2, W / 2 - (W < 600 ? 66 : 110), H / 2 - 62, 0.34);
    return { vn, links, layout: 'sectors' as const, marks };
  }

  // ---- draw
  function render(spawn?: [number, number]) {
    for (const v of cur) pos.set(v.id, [v.x, v.y]);
    sim?.stop();
    stageSize();
    const m: any = state.mode === 'overview' ? overviewModel() : state.mode === 'group' ? groupModel(state.comm) : focusModel(state.idx);
    const vn: Vn[] = m.vn, links: Vl[] = m.links;
    const s0: [number, number] = spawn ?? [W / 2, H / 2];
    vn.forEach((v, k) => {
      const p = pos.get(v.id);
      if (v.center) { v.x = W / 2; v.y = H / 2; }
      else if (p) { v.x = Math.min(W - 10, p[0]); v.y = Math.min(H - 10, p[1]); }
      else { const a = (k / vn.length) * 6.283; v.x = s0[0] + Math.cos(a) * 20; v.y = s0[1] + Math.sin(a) * 20; }
    });
    svg.replaceChildren();
    zoom = { k: 1, x: 0, y: 0 };
    const zg = el('g', { class: 'gv-zoom' }, svg); zoomEl = zg;
    const gm = el('g', { class: 'gv-marks' }, zg);
    if (m.marks) for (const mk of m.marks) { const tx = el('text', { x: mk.x, y: mk.y, class: `gv-sector k-${mk.kind}`, 'text-anchor': 'middle' }, gm); tx.textContent = t.gKinds[mk.kind]; }
    const ge = el('g', { class: 'gv-edges' }, zg);
    const gn = el('g', { class: 'gv-nodes' }, zg);
    const lineEls = links.map((l) => el('line', { class: 'gv-edge' + (l.weak ? ' weak' : ''), 'stroke-width': (l.weak ? 1 : state.mode === 'overview' ? 1 + l.w * 7 : 1 + Math.min(l.w, 0.6) * 9).toFixed(1) }, ge));
    const nodeEls = new Map<Vn, SVGElement>();
    const labelEls = new Map<Vn, SVGElement>();
    const incident = new Map<Vn, { lines: SVGElement[]; nb: Set<Vn> }>();
    for (const v of vn) incident.set(v, { lines: [], nb: new Set() });
    links.forEach((l, k) => { incident.get(l.source)!.lines.push(lineEls[k]); incident.get(l.target)!.lines.push(lineEls[k]); incident.get(l.source)!.nb.add(l.target); incident.get(l.target)!.nb.add(l.source); });
    for (const v of vn) {
      const aria = `${v.full}, ${v.kind === 'group' ? t.gGroup : t.gKindOne[v.kind]}, ${nf.format(v.n)} ${t.gProjectsFor(v.n)}`;
      const grp = el('g', { class: `gv-node k-${v.kind}${v.center ? ' center' : ''}`, tabindex: v.center ? -1 : 0, role: 'button', 'aria-label': aria }, gn);
      if (v.center) grp.setAttribute('aria-current', 'true');
      el('circle', { class: 'gv-hit', r: v.r + 9 }, grp);
      el('path', { d: shape(v.kind === 'group' ? 'approach' : v.kind, v.r) }, grp);
      const label = el('text', { class: 'gv-label', y: v.r * (v.kind === 'problem' || v.kind === 'output' ? 1.18 : 1) + 14, 'text-anchor': 'middle' }, grp);
      label.textContent = v.label;
      labelEls.set(v, label);
      nodeEls.set(v, grp);
      grp.addEventListener('pointerenter', () => hl(v, true));
      grp.addEventListener('pointerleave', () => hl(v, false));
      grp.addEventListener('focus', () => hl(v, true));
      grp.addEventListener('blur', () => hl(v, false));
      grp.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); activate(v, true); } });
      drag(grp, v);
    }
    function hl(v: Vn, on: boolean) {
      svg.classList.toggle('hl', on);
      const inc = incident.get(v)!;
      nodeEls.get(v)!.classList.toggle('on', on);
      inc.nb.forEach((nb) => nodeEls.get(nb)!.classList.toggle('on', on));
      inc.lines.forEach((ln) => ln.classList.toggle('on', on));
      if (on) {
        tip.hidden = false;
        tip.innerHTML = `<b></b><span></span>`;
        (tip.firstChild as HTMLElement).textContent = v.full;
        (tip.lastChild as HTMLElement).textContent = `${v.kind === 'group' ? t.gGroup : t.gKindOne[v.kind]} · ${nf.format(v.n)} ${t.gProjectsFor(v.n)}`;
        const sc = stage.clientWidth / W;
        tip.style.left = Math.max(8, Math.min(stage.clientWidth - 230, (v.x * zoom.k + zoom.x) * sc + 14)) + 'px';
        tip.style.top = Math.max(8, (v.y * zoom.k + zoom.y) * sc - v.r * sc * zoom.k - 52) + 'px';
      } else tip.hidden = true;
    }
    function drag(grp: SVGElement, v: Vn) {
      let start: [number, number] | null = null, moved = false;
      const at = (e: PointerEvent) => { const [x, y] = clientToSvg(e); return [(x - zoom.x) / zoom.k, (y - zoom.y) / zoom.k] as [number, number]; };
      grp.addEventListener('pointerdown', (e) => { if (v.center) { start = [e.clientX, e.clientY]; moved = false; return; } start = [e.clientX, e.clientY]; moved = false; grp.setPointerCapture(e.pointerId); });
      grp.addEventListener('pointermove', (e) => {
        if (!start || v.center) return;
        if (!moved && Math.hypot(e.clientX - start[0], e.clientY - start[1]) < 5) return;
        moved = true; const [x, y] = at(e as PointerEvent);
        v.fx = Math.max(v.r, Math.min(W - v.r, x)); v.fy = Math.max(v.r, Math.min(H - v.r - 16, y));
        sim?.alphaTarget(0.2).restart();
      });
      grp.addEventListener('pointerup', (e) => {
        if (!start) return;
        const wasMoved = moved; start = null; moved = false;
        if (!v.center) { try { grp.releasePointerCapture(e.pointerId); } catch { /* already released */ } }
        if (wasMoved) { v.fx = null; v.fy = null; sim?.alphaTarget(0); } else activate(v);
      });
      grp.addEventListener('pointercancel', () => { start = null; moved = false; v.fx = null; v.fy = null; sim?.alphaTarget(0); });
    }
    cur = vn;

    const mx = W < 600 ? 50 : 4;
    function paint() {
      for (const v of vn) {
        v.x = Math.max(v.r + mx, Math.min(W - v.r - mx, v.x)); v.y = Math.max(v.r + 4, Math.min(H - v.r - 20, v.y));
        nodeEls.get(v)!.setAttribute('transform', `translate(${v.x.toFixed(1)},${v.y.toFixed(1)})`);
      }
      links.forEach((l, k) => { const ln = lineEls[k]; ln.setAttribute('x1', l.source.x.toFixed(1)); ln.setAttribute('y1', l.source.y.toFixed(1)); ln.setAttribute('x2', l.target.x.toFixed(1)); ln.setAttribute('y2', l.target.y.toFixed(1)); });
    }
    sim = forceSimulation(vn as any)
      .force('collide', forceCollide<any>().radius((d: Vn) => d.r + (m.layout === 'force' ? 34 : 17)).strength(0.9));
    if (m.layout === 'force') {
      sim.force('link', forceLink(links as any).distance((l: any) => 150 + (1 - l.w) * 220).strength((l: any) => 0.04 + l.w * 0.2))
        .force('charge', forceManyBody().strength(-520))
        .force('x', forceX(W / 2).strength(0.05)).force('y', forceY(H / 2).strength(0.08));
    } else {
      sim.force('x', forceX<any>((d: Vn) => d.tx).strength((d: Vn) => (d.center ? 0 : 0.22)))
        .force('y', forceY<any>((d: Vn) => d.ty).strength((d: Vn) => (d.center ? 0 : 0.22)))
        .force('charge', forceManyBody().strength(-40));
    }
    function declutter() {            // a label that would sit on top of a bigger concept's label is hidden (it still shows on hover or focus)
      const placed: [number, number, number, number][] = [];
      for (const v of [...vn].sort((a, b) => Number(!!b.center) - Number(!!a.center) || b.n - a.n)) {
        const w = v.label.length * 6.4, x0 = v.x - w / 2, y0 = v.y + v.r * (v.kind === 'problem' || v.kind === 'output' ? 1.18 : 1) + 3, x1 = x0 + w, y1 = y0 + 15;
        const hit = placed.some((b) => x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]);
        labelEls.get(v)!.classList.toggle('off', hit && !v.center);
        if (!hit || v.center) placed.push([x0, y0, x1, y1]);
      }
    }
    let ticks = 0;
    sim.on('tick', () => { paint(); if (++ticks % 20 === 0) declutter(); }).on('end', declutter);
    if (reduce) { sim.stop(); for (let k = 0; k < 320; k++) sim.tick(); paint(); declutter(); } else sim.alpha(1).restart();
    crumbsFor();
    announce(vn);
    moreBtn.hidden = state.mode !== 'group';
    moreBtn.textContent = more ? t.gLess : t.gMore;
    moreBtn.setAttribute('aria-label', moreBtn.textContent);
    const hash = state.mode === 'group' ? '#group-' + state.comm : state.mode === 'focus' ? '#' + encodeURIComponent(nodes[state.idx][0]) : '';
    if (!first) try { history.replaceState(null, '', location.pathname + location.search + hash); } catch { /* not allowed in a sandbox: the view just is not linkable */ }
  }

  // ---- navigation
  function activate(v: Vn, byKey = false) {
    if (state.mode === 'overview') { state = { mode: 'group', comm: v.id }; more = false; o.onNone(); render([v.x, v.y]); }
    else if (!v.center) { state = { mode: 'focus', idx: v.idx }; o.onConcept(v.idx); render([v.x, v.y]); }
    else return;
    if (byKey) focusStage();
  }
  function focusStage() { svg.querySelector<SVGElement>('.gv-node.center')?.focus?.(); }
  function crumbsFor() {
    const items: [string, (() => void) | null][] = [[t.gAll, state.mode === 'overview' ? null : () => { state = { mode: 'overview' }; o.onNone(); render(); }]];
    let comm = '';
    if (state.mode === 'group') comm = state.comm;
    if (state.mode === 'focus' && commIds.has(nodes[state.idx][10])) comm = nodes[state.idx][10];
    if (comm) {
      const k = (g.communities as any[]).find((x) => x.id === comm);
      items.push([`${t.gGroup}: ${cut(commTitle(k), 40)}`, state.mode === 'group' ? null : () => { state = { mode: 'group', comm }; o.onNone(); render(); }]);
    }
    if (state.mode === 'focus') items.push([cut(nameOf(state.idx), 44), null]);
    crumbs.replaceChildren();
    items.forEach(([label, fn], k) => {
      if (k) crumbs.append(Object.assign(document.createElement('span'), { textContent: '›', className: 'gv-sep', ariaHidden: 'true' }));
      if (fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'linkish'; b.textContent = label; b.addEventListener('click', fn); crumbs.append(b); }
      else { const s = document.createElement('span'); s.className = 'gv-here'; s.textContent = label; s.setAttribute('aria-current', 'page'); crumbs.append(s); }
    });
  }
  function announce(vn: Vn[]) {
    if (state.mode === 'overview') live.textContent = t.gShowOverview(vn.length);
    else if (state.mode === 'group') live.textContent = t.gShowGroup(commTitle((g.communities as any[]).find((x) => x.id === (state as any).comm)), vn.length);
    else live.textContent = vn.length > 1 ? t.gShowConcept(nameOf((state as any).idx), vn.length - 1) : t.gNoLinks;
  }

  let lastW = 0;
  new ResizeObserver(() => { const w = stage.clientWidth; if (Math.abs(w - lastW) > 40) { lastW = w; render(); } }).observe(stage);
  render();
  first = false;
  lastW = stage.clientWidth;

  return {
    focus(i: number) { state = { mode: 'focus', idx: i }; render(); },
    group(id: string) { if (commIds.has(id)) { state = { mode: 'group', comm: id }; render(); } },
    overview() { state = { mode: 'overview' }; render(); },
  };
}
