/* ============ izvoz filtriranih podataka: CSV, Excel (.xlsx), PDF ============
   Svaki prikaz daje getData() -> { id, title, filters:[[naziv, vrijednost]], cols:[{h, t}], rows:[[...]] }
   t: 'int' (cijeli broj), 'dec' (1 decimala), 'pct' (već u postocima), 'year' (godina), inače tekst. */
const Xport = (() => {
  const today = () => new Date().toISOString().slice(0, 10);
  const stamp = () => { const [y, m, d] = today().split('-'); return LANG === 'en' ? `${+d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m - 1]} ${y}` : `${+d}. ${+m}. ${y}.`; };
  const fname = (d, ext) => `erasmus-kompas_${fold(d.id).replace(/[^a-z0-9]+/g, '-')}_${today()}.${ext}`;
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 800); };
  const shown = (c, v) => v == null || v === '' ? '' : c.t === 'int' ? fmt(Math.round(v)) : c.t === 'dec' ? dec(v) : c.t === 'pct' ? dec(v) + ' %' : String(v);
  const SRC = () => tr('Izvor: Erasmus+ Kompas (erasmus-plus.ec.europa.eu, data.gov.hr, MZOM). Neovisan projekt, nije službena stranica Europske komisije.');

  /* ---- CSV ---- */
  const cell = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const toCSV = (d) => new Blob(['\uFEFF' + [d.cols.map((c) => cell(c.h)).join(','), ...d.rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });

  /* ---- XLSX (OOXML u ZIP-u bez kompresije) ---- */
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
    for (const [name, str] of files) {
      const nb = enc.encode(name), data = enc.encode(str), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      cd.push(new Uint8Array(ch.buffer), nb); off += 30 + nb.length + data.length;
    }
    const size = cd.reduce((a, p) => a + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const xe = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const colL = (i) => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const sstr = (ref, v, s = 0) => `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
  function toXLSX(d) {
    const nc = d.cols.length, nr = d.rows.length, ST = { int: 2, dec: 3, pct: 3 };
    const widths = d.cols.map((c, i) => Math.min(60, Math.max(String(c.h).length + 2, ...d.rows.slice(0, 300).map((r) => String(shown(c, r[i])).length + 2), 8)));
    let rows = `<row r="1" ht="30" customHeight="1">${d.cols.map((c, i) => sstr(colL(i) + 1, c.h, 1)).join('')}</row>`;
    d.rows.forEach((r, ri) => { rows += `<row r="${ri + 2}">${d.cols.map((c, i) => { const v = r[i], ref = colL(i) + (ri + 2); if (v == null || v === '') return ''; return typeof v === 'number' && c.t !== undefined ? `<c r="${ref}"${ST[c.t] ? ` s="${ST[c.t]}"` : ''}><v>${v}</v></c>` : sstr(ref, v); }).join('')}</row>`; });
    const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${nr ? `<autoFilter ref="A1:${colL(nc - 1)}${nr + 1}"/>` : ''}</worksheet>`;
    const info = [[d.title, 4], ['', 0], [tr('Primijenjeni filteri'), 5], ...d.filters.map(([k, v]) => [`${k}: ${v}`, 0]), ['', 0], [`${tr('Broj redaka')}: ${fmt(nr)}`, 0], [`${tr('Izvezeno')}: ${stamp()}`, 0], [SRC(), 0]];
    const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="110" customWidth="1"/></cols><sheetData>${info.map(([t, s], i) => t === '' ? `<row r="${i + 1}"/>` : `<row r="${i + 1}">${sstr('A' + (i + 1), t, s)}</row>`).join('')}</sheetData></worksheet>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="165" formatCode="0.0"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF0B2A5B"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF004494"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF004494"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return zip([
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS}"><sheets><sheet name="${xe(tr('Podaci'))}" sheetId="1" r:id="rId1"/><sheet name="${xe(tr('O izvozu'))}" sheetId="2" r:id="rId2"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${NS}/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', styles], ['xl/worksheets/sheet1.xml', sheet1], ['xl/worksheets/sheet2.xml', sheet2]
    ]);
  }

  /* ---- PDF (Helvetica, vlastiti pisač; bez vanjskih biblioteka) ---- */
  const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const M1 = { 'č': 1, 'ć': 2, 'đ': 3, 'Č': 4, 'Ć': 5, 'Đ': 6 };
  const WIN = { '€': 0x80, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'Š': 0x8A, 'š': 0x9A, 'Ž': 0x8E, 'ž': 0x9E, 'Œ': 0x8C, 'œ': 0x9C };
  const bytes = (s) => { let o = ''; for (const ch of String(s).normalize('NFC')) { const c = ch.codePointAt(0); let b; if (M1[ch]) b = M1[ch]; else if (WIN[ch]) b = WIN[ch]; else if (c >= 32 && c < 127) b = c; else if (c >= 160 && c < 256) b = c; else if (ch === '→') { o += '->'; continue; } else { const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); b = base !== ch && base.length === 1 && base.charCodeAt(0) < 127 ? base.charCodeAt(0) : 63; } o += String.fromCharCode(b); } return o; };
  const bw = (b, size) => { let w = 0; for (let i = 0; i < b.length; i++) { const c = b.charCodeAt(i); w += c >= 32 && c < 127 ? HW[c - 32] : 556; } return w * size / 1000; };
  const lit = (b) => '(' + b.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, (c) => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0')) + ')';
  const wrap = (txt, w, size, maxLines) => {
    const words = bytes(txt).split(/(?<= )/), lines = []; let cur = '';
    for (let wd of words) {
      while (bw(wd, size) > w) { let k = wd.length; while (k > 1 && bw(wd.slice(0, k) + '-', size) > w) k--; if (cur) { lines.push(cur); cur = ''; } lines.push(wd.slice(0, k) + '-'); wd = wd.slice(k); }
      if (bw(cur + wd, size) > w && cur) { lines.push(cur.trimEnd()); cur = wd; } else cur += wd;
    }
    if (cur || !lines.length) lines.push(cur.trimEnd());
    if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (l.length && bw(l + '\x85', size) > w) l = l.slice(0, -1); lines[maxLines - 1] = l + '\x85'; }
    return lines;
  };
  function toPDF(d) {
    const land = d.cols.length > 5, W = land ? 842 : 595, H = land ? 595 : 842, M = 38, fs = 8.5, lh = 11, avail = W - 2 * M, MAXR = 3000;
    const rows = d.rows.slice(0, MAXR);
    /* širine stupaca: najmanje najdulja riječ, željeno prema sadržaju, ostatak se raspodjeljuje */
    const isNum = (c) => c.t === 'int' || c.t === 'dec' || c.t === 'pct';
    const wordsW = (t) => Math.max(0, ...bytes(t).split(/\s+/).filter(Boolean).map((w) => bw(w, fs)));
    const sample = rows.slice(0, 300);
    const minW = d.cols.map((c, i) => Math.max(isNum(c) || c.t === 'year' ? Math.max(0, ...sample.map((r) => bw(bytes(shown(c, r[i])), fs))) : Math.min(80, Math.max(0, ...sample.map((r) => wordsW(shown(c, r[i]))))), wordsW(c.h) * 1.08, 24) + 12);
    const prefW = d.cols.map((c, i) => { const vals = sample.map((r) => bw(bytes(shown(c, r[i])), fs)); const mx = Math.max(0, ...vals), avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; return Math.max(minW[i], (isNum(c) || c.t === 'year' ? mx : Math.min(mx, Math.max(avg * 1.25, 70), 250)) + 12); });
    const sMin = minW.reduce((a, b) => a + b, 0), sPref = prefW.reduce((a, b) => a + b, 0);
    let cw; if (sPref <= avail) { const extra = avail - sPref; cw = prefW.map((w) => w + extra * w / sPref); } else if (sMin >= avail) cw = minW.map((w) => w * avail / sMin); else { const f = (avail - sMin) / (sPref - sMin); cw = minW.map((w, i) => w + (prefW[i] - w) * f); }
    const cx = []; cw.reduce((x, w, i) => (cx[i] = x, x + w), M);
    const hl = d.cols.map((c, i) => wrap(c.h, cw[i] - 8, fs * 1.08, 3)), hn = Math.max(...hl.map((l) => l.length)), hH = hn * lh + 9;
    const pages = []; let cur = null, y = 0;
    const T = (x, yy, b, size, bold) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${lit(b)} Tj ET\n`;
    const hdr = () => { let o = `0 0.267 0.58 rg ${M} ${y - hH} ${avail} ${hH} re f\n1 1 1 rg `; hl.forEach((ls, i) => ls.forEach((l, j) => { const x = isNum(d.cols[i]) ? cx[i] + cw[i] - 4 - bw(l, fs * 1.08) : cx[i] + 4; o += T(x, y - 12 - j * lh, l, fs, true); })); y -= hH; return o; };
    const newPage = (first) => {
      cur = ''; pages.push(cur); y = H - M;
      if (first) {
        cur += '0 0.267 0.58 rg ' + `${M} ${H - M - 4} 22 4 re f\n` + '1 0.839 0.09 rg ' + `${M + 22} ${H - M - 4} 10 4 re f\n`;
        cur += '0.043 0.165 0.357 rg ' + T(M + 40, H - M - 5, bytes('Erasmus+ Kompas'), 9, true); y -= 26;
        const tl = wrap(d.title, avail, 17, 2); cur += '0.043 0.165 0.357 rg '; for (const l of tl) { cur += T(M, y - 12, l, 17, true); y -= 21; }
        y -= 4; cur += '0.337 0.404 0.51 rg ';
        const meta = [`${tr('Izvezeno')}: ${stamp()} · ${fmt(d.rows.length)} ${tr('redaka')}${d.rows.length > MAXR ? (LANG === 'en' ? ` (only the first ${fmt(MAXR)} in the PDF)` : ` (u PDF-u prvih ${fmt(MAXR)})`) : ''}`, ...d.filters.map(([a, b]) => `${a}: ${b}`)];
        for (const m of meta) for (const l of wrap(m, avail, 9, 2)) { cur += T(M, y - 9, l, 9, false); y -= 12; }
        y -= 8;
      }
      cur += hdr();
    };
    newPage(true);
    rows.forEach((r, ri) => {
      const cells = d.cols.map((c, i) => wrap(shown(c, r[i]), cw[i] - 8, fs, c.t ? 1 : 3)), n = Math.max(...cells.map((x) => x.length)), rh = n * lh + 5;
      if (y - rh < M + 22) newPage(false);
      if (ri % 2) cur += `0.949 0.961 0.976 rg ${M} ${y - rh} ${avail} ${rh} re f\n`;
      cur += '0.114 0.165 0.267 rg '; cells.forEach((ls, i) => { const c = d.cols[i], num = c.t === 'int' || c.t === 'dec' || c.t === 'pct'; ls.forEach((l, j) => { const x = num ? cx[i] + cw[i] - 4 - bw(l, fs) : cx[i] + 4; cur += T(x, y - 10 - j * lh, l, fs, false); }); });
      cur += `0.85 0.88 0.925 RG 0.4 w ${M} ${y - rh} m ${M + avail} ${y - rh} l S\n`;
      y -= rh; pages[pages.length - 1] = cur;
    });
    pages[pages.length - 1] = cur;
    const N = pages.length, src = bytes(SRC());
    pages.forEach((p, i) => { pages[i] = p + '0.337 0.404 0.51 rg ' + T(M, 22, wrap(SRC(), avail - 80, 7, 1)[0], 7, false) + T(W - M - 60, 22, bytes(`${tr('Stranica')} ${i + 1}/${N}`), 7, false); });
    const objs = [];
    const enc = '<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [1 /ccaron /cacute /dcroat /Ccaron /Cacute /Dcroat] >>';
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding ${enc} >>`;
    objs[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding ${enc} >>`;
    const kids = []; pages.forEach((p, i) => { const po = 5 + i * 2, co = po + 1; kids.push(`${po} 0 R`); objs[po] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${co} 0 R >>`; objs[co] = `<< /Length ${p.length} >>\nstream\n${p}endstream`; });
    objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${N} >>`;
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const off = [];
    for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
    const xr = out.length; out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + off.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Title ${lit(bytes(d.title))} /Producer (Erasmus+ Kompas) >> >>\nstartxref\n${xr}\n%%EOF`;
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
    return new Blob([u], { type: 'application/pdf' });
  }

  const FORMATS = { csv: ['CSV', toCSV, 'csv'], xlsx: ['Excel', toXLSX, 'xlsx'], pdf: ['PDF', toPDF, 'pdf'] };
  /* u engleskom sučelju prevode se naslov, zaglavlja, filteri i tekstualne ćelije (nazivi iz podataka ostaju) */
  const trData = (d) => LANG !== 'en' ? d : { ...d, title: tr(d.title), cols: d.cols.map((c) => ({ ...c, h: tr(c.h) })), filters: d.filters.map(([k, v]) => [tr(k), tr(String(v))]), rows: d.rows.map((r) => r.map((v) => (typeof v === 'string' ? tr(v) : v))) };
  const run = (fmtKey, d0) => { const [, f, ext] = FORMATS[fmtKey], d = trData(d0); save(f(d), fname(d0, ext)); };
  const ICON = { csv: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>', xlsx: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16M4 15h16M10 4v16"/>', pdf: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 17c2-1 3-3 3-5 0-1-1-1-1 0 0 2 2 4 4 4"/>' };
  const BTN = { csv: ['CSV', 'Za analizu i uvoz u druge alate'], xlsx: ['Excel', 'Tablica za izvješća (.xlsx)'], pdf: ['PDF', 'Pregledno izvješće za ispis'] };

  function bar(id) {
    const el = document.createElement('div'); el.className = 'exportbar'; el.setAttribute('role', 'group'); el.setAttribute('aria-labelledby', id + '-t');
    el.innerHTML = `<div class="xinfo"><b id="${id}-t">Izvoz podataka</b><span class="xcount" aria-live="polite"></span></div><div class="xbtns">${Object.keys(BTN).map((k) => `<button type="button" data-f="${k}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg><span><b>${BTN[k][0]}</b><small>${BTN[k][1]}</small></span></button>`).join('')}</div>`;
    return el;
  }
  let n = 0;
  /* mount(root, getData, { after: selektor, into: element }) */
  function mount(root, get, o = {}) {
    const el = bar('xb' + (++n)), anchor = o.into || $(o.after || '.filters', root);
    if (o.into) o.into.append(el); else if (anchor) anchor.after(el); else root.prepend(el);
    const info = $('.xcount', el), btns = $$('button', el);
    const upd = () => { let d; try { d = get(); } catch (e) { return; } const nr = d.rows.length; info.textContent = nr ? `${fmt(nr)} ${tr('redaka prema trenutnim filterima')}` : tr('Nema redaka za izvoz'); btns.forEach((b) => { b.disabled = !nr; }); };
    let q = 0; const soon = () => { clearTimeout(q); q = setTimeout(upd, 0); };
    ['click', 'input', 'change'].forEach((ev) => root.addEventListener(ev, soon));
    el.addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (!b || b.disabled) return; const d = get(); run(b.dataset.f, d); info.textContent = `${tr('Preuzimanje')} ${FORMATS[b.dataset.f][0]}: ${fmt(d.rows.length)} ${tr('redaka')}`; });
    upd(); soon(); return { update: upd, el };
  }
  return { mount, run, toCSV, toXLSX, toPDF, fname, stamp };
})();
