import React from 'react'
import md from '../../docs/buyback-flywheel.md?raw'

// Minimal markdown renderer — just enough for our docs file:
// # / ## headings, | tables |, ``` fences, `code`, **bold**, - bullets.
function inline(s, key = 'k') {
  return s.split(/(`[^`]+`)/g).map((p, i) =>
    p.startsWith('`') && p.endsWith('`') && p.length > 2
      ? <code key={`${key}-${i}`}>{p.slice(1, -1)}</code>
      : p.split(/(\*\*[^*]+\*\*)/g).map((q, j) =>
          q.startsWith('**') && q.endsWith('**') && q.length > 4
            ? <b key={`${key}-${i}-${j}`}>{q.slice(2, -2)}</b>
            : <React.Fragment key={`${key}-${i}-${j}`}>{q}</React.Fragment>
        )
  )
}

function Table({ rows }) {
  const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  const head = cells(rows[0])
  const body = rows.slice(2).filter((r) => r.trim().startsWith('|')).map(cells)
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead><tr>{head.map((h, i) => <th key={i}>{inline(h, `h${i}`)}</th>)}</tr></thead>
        <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c, `c${i}${j}`)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function renderBlocks(src) {
  const lines = src.split('\n')
  const out = []
  let i = 0, key = 0
  while (i < lines.length) {
    const ln = lines[i]
    if (ln.startsWith('```')) {
      const buf = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++ }
      i++
      out.push(<pre key={key++} className="doc-code">{buf.join('\n')}</pre>)
      continue
    }
    if (ln.trim().startsWith('|')) {
      const buf = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { buf.push(lines[i]); i++ }
      out.push(<Table key={key++} rows={buf} />)
      continue
    }
    if (ln.startsWith('# ')) { out.push(<h1 key={key++} className="doc-h1">{inline(ln.slice(2))}</h1>); i++; continue }
    if (ln.startsWith('## ')) { out.push(<h2 key={key++} className="doc-h2">{inline(ln.slice(3))}</h2>); i++; continue }
    if (/^-\s/.test(ln)) {
      const buf = []
      while (i < lines.length && /^(-\s|\s{2,})/.test(lines[i])) { buf.push(lines[i]); i++ }
      out.push(<ul key={key++} className="doc-list">{buf.filter((b) => /-\s/.test(b)).map((b, j) => <li key={j}>{inline(b.replace(/^-\s/, ''), `l${key}${j}`)}</li>)}</ul>)
      continue
    }
    if (ln.trim() === '') { i++; continue }
    const buf = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].trim().startsWith('|') && !/^- /.test(lines[i])) { buf.push(lines[i]); i++ }
    out.push(<p key={key++} className="doc-p">{inline(buf.join(' '), `p${key}`)}</p>)
  }
  return out
}

export default function DocsPage({ onBack }) {
  return (
    <section className="hero" style={{ maxWidth: 860 }}>
      <button className="btn ghost rise d1" onClick={onBack}>← BACK</button>
      <div className="bezel rise d2" style={{ width: '100%' }}>
        <div className="core doc-core">
          <div className="panel-label">DOCS <span className="tag">buyback flywheel</span></div>
          <article className="doc-body">{renderBlocks(md)}</article>
        </div>
      </div>
    </section>
  )
}
