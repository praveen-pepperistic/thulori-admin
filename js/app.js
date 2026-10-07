/* Thulori admin panel — a small single-page app over the Thulori API (/api/admin/*).
   Views: Orders (work queues + filters), Order, Book workspace, Payments, New order, Customers.
   Every action here changes what the customer sees on the website, and every checkpoint can
   be set by hand for things that happened outside it (WhatsApp, UPI, a phone call…). */
(() => {
  'use strict';
  const CFG = window.THULORI_ADMIN || {};
  const BASE = String(CFG.apiBase || '').replace(/\/$/, '');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const fmtD = d => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtDT = d => d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
  const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const app = $('#app');
  // Team-facing names for the 6+1 stages (the website shows the customer's wording, e.g. “Your proof”).
  const STAGES = ['Photos & stories', 'Writing', 'Design', 'Proof with customer', 'Printing', 'Shipped', 'Delivered'];
  const ED = { vidhai: 'Vidhai', thulir: 'Thulir', malar: 'Malar' };
  const METHODS = { upi: 'UPI', bank_transfer: 'Bank transfer', card: 'Card', netbanking: 'Net banking', cash: 'Cash', cashfree: 'Cashfree', other: 'Other' };
  const COURIERS = ['Delhivery', 'Blue Dart', 'DTDC', 'India Post', 'Shiprocket', 'Professional Couriers', 'Ekart', 'XpressBees'];
  let ME = null, META = null;
  const DEMO = window.ThuloriDemo || null; // preview page only: sample data, no server

  /* routing works from in-page links even where the host frame won't change location.hash */
  let CUR = location.hash || '#/orders';
  function go(h) { CUR = h; try { if (location.hash !== h) location.hash = h; } catch (e) {} route(); }

  /* ---------------- API ---------------- */
  async function api(method, path, body) {
    if (DEMO) {
      try { return await DEMO.handle(method, path, body); }
      catch (e) { const er = new Error(e.message || 'Something went wrong.'); er.status = e.status || 500; er.code = e.code; er.fields = e.fields; throw er; }
    }
    let r;
    try {
      r = await fetch(BASE + '/api/admin' + path, { method, credentials: 'include', headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) { const er = new Error('Can’t reach the Thulori API. Check your connection and the API_BASE setting.'); er.status = 0; throw er; }
    let data = null; try { data = await r.json(); } catch (e) {}
    if (!r.ok) {
      const e = (data && data.error) || {};
      const er = new Error(e.message || `Request failed (${r.status}).`); er.status = r.status; er.code = e.code; er.fields = e.details && e.details.fields;
      if (r.status === 401 && !path.startsWith('/auth/')) { ME = null; renderLogin('Your session ended — please sign in again.'); }
      throw er;
    }
    return data;
  }
  const get = p => api('GET', p), post = (p, b) => api('POST', p, b || {}), patch = (p, b) => api('PATCH', p, b || {}), del = p => api('DELETE', p);
  const qs = o => { const u = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null) u.set(k, v); }); const s = u.toString(); return s ? '?' + s : ''; };
  function upload(u, file, onp) {
    if (DEMO) { onp && onp(1); return DEMO.put(u.url, file); }
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest(); x.open(u.method || 'PUT', u.url);
      Object.entries(u.headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
      x.upload.onprogress = e => onp && e.lengthComputable && onp(e.loaded / e.total);
      x.onload = () => x.status < 300 ? res() : rej(new Error('Upload failed (' + x.status + ')'));
      x.onerror = () => rej(new Error('Upload failed — check your connection.'));
      x.send(file);
    });
  }

  /* ---------------- small UI helpers ---------------- */
  let toastT;
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, err ? 6000 : 3200); }
  const isAdmin = () => ME && ME.role === 'admin';
  function orderPill(s) {
    return { pending_payment: '<span class="pill pill--sun">Awaiting payment</span>', failed: '<span class="pill pill--coral">Payment failed</span>', paid: '<span class="pill pill--leaf">Paid</span>', cancelled: '<span class="pill pill--plain">Cancelled</span>', refunded: '<span class="pill pill--plain">Refunded</span>' }[s] || esc(s);
  }
  function stagePill(stage, proofStatus) {
    if (stage === 2 && proofStatus === 'changes_requested') return '<span class="pill pill--coral">Changes requested</span>';
    const cls = stage === 0 || stage === 3 ? 'pill--sun' : stage === 1 || stage === 2 || stage === 4 ? 'pill--sky' : 'pill--leaf';
    return `<span class="pill ${cls}">${esc(STAGES[stage])}</span>`;
  }
  const waLink = p => { const d = String(p || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length === 10 ? '91' + d : d}` : ''; };
  const steps = stage => `<ol class="steps" aria-label="Stage: ${esc(STAGES[stage])}">${STAGES.map((s, i) => `<li class="${i < stage ? 'is-done' : i === stage ? 'is-now' : ''}">${esc(s)}</li>`).join('')}</ol>`;
  const field = (id, label, input, cls = '') => `<div class="f ${cls}"><label for="${id}">${label}</label>${input}<p class="f__err" id="${id}-err"></p></div>`;
  const opts = (map, sel, blank) => (blank != null ? `<option value="">${esc(blank)}</option>` : '') + Object.entries(map).map(([k, v]) => `<option value="${esc(k)}"${String(sel) === String(k) ? ' selected' : ''}>${esc(v)}</option>`).join('');
  const stateOpts = (sel, blank) => (blank != null ? `<option value="">${esc(blank)}</option>` : '') + (META ? META.states : []).map(s => `<option${s === sel ? ' selected' : ''}>${esc(s)}</option>`).join('');
  function showFieldErrors(root, e, map = {}) {
    $$('.f__err', root).forEach(x => { x.textContent = ''; });
    if (e.fields) Object.entries(e.fields).forEach(([k, m]) => { const id = map[k] || k; const el = $('#' + CSS.escape(id) + '-err', root); if (el) el.textContent = m; });
  }

  /* dialog: body HTML with a <form>; onSubmit(form, data) resolves to close */
  function dialog({ title, body, submit = 'Save', danger = false, wide = false, onOpen, onSubmit, fieldMap }) {
    const d = $('#dlg');
    d.className = 'dlg' + (wide ? ' dlg--wide' : '');
    d.innerHTML = `<form class="dlg__in" novalidate><div class="dlg__h"><h2 id="dlg-h">${esc(title)}</h2><button type="button" class="dlg__x" data-close aria-label="Close">×</button></div>${body}<p class="err" data-dlg-err role="alert"></p><div class="dlg__f"><button type="button" class="btn btn--ghost" data-close>Cancel</button>${submit ? `<button class="btn ${danger ? 'btn--danger' : ''}" type="submit">${esc(submit)}</button>` : ''}</div></form>`;
    const form = $('form', d), errEl = $('[data-dlg-err]', d);
    $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close()));
    form.addEventListener('submit', async e => {
      e.preventDefault(); errEl.textContent = '';
      const btn = $('[type=submit]', form); btn.disabled = true;
      try { await onSubmit(form, Object.fromEntries(new FormData(form))); d.close(); }
      catch (er) { errEl.textContent = er.message; showFieldErrors(form, er, fieldMap); }
      finally { btn.disabled = false; }
    });
    d.showModal();
    onOpen && onOpen(form);
    const first = $('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea', form); first && first.focus();
    return form;
  }
  const confirmDlg = (title, text, label, fn, danger) => dialog({ title, body: `<p>${text}</p>`, submit: label, danger, onSubmit: fn });

  // lightbox
  const lb = $('#lb');
  function openLb(src, cap) { $('img', lb).src = src; $('.lb__cap', lb).textContent = cap || ''; lb.hidden = false; $('.lb__x', lb).focus(); }
  lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('[data-lb-close]')) lb.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) lb.hidden = true; });
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-lb]'); if (t) { e.preventDefault(); openLb(t.dataset.lb, t.dataset.cap); return; }
    const r = e.target.closest('tr[data-href]'); if (r && !e.target.closest('a,button')) { go(r.dataset.href); return; }
    const a = e.target.closest('a[href^="#/"]'); if (a && !e.defaultPrevented) { e.preventDefault(); go(a.getAttribute('href')); return; }
    if (DEMO) demoLinks(e);
  });
  // Preview: downloads and the invoice page open inside the panel instead.
  function demoLinks(e) {
    const a = e.target.closest('a'); if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('demo-invoice:')) { e.preventDefault(); showInvoice(DEMO.invoice(href.slice(13))); return; }
    const st = href.match(/\/books\/([^/]+)\/stories\.txt/);
    if (st) { e.preventDefault(); dialog({ title: 'Stories for the writer', wide: true, submit: '', body: `<p class="hint">In the live panel this downloads as a text file.</p><pre style="white-space:pre-wrap;max-height:60vh;overflow:auto;background:var(--ivory);padding:14px;border-radius:9px;font:13px/1.5 var(--f-body)">${esc(DEMO.stories(st[1]))}</pre>`, onSubmit: async () => {} }); return; }
    if (href.includes('/api/admin/') || a.hasAttribute('data-dl')) { e.preventDefault(); toast(href.includes('.zip') ? 'In the live panel this downloads every original photo as one zip file.' : href.includes('.csv') ? 'In the live panel this downloads the filtered payments as a CSV for your accountant.' : 'In the live panel this downloads the original file.'); }
  }
  function showInvoice(i) {
    if (!i) return;
    const c = DEMO.company, b = i.billTo, a = b.address, t = i.tax, money = n => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    dialog({ title: `Invoice ${i.number}`, wide: true, submit: '', onSubmit: async () => {}, body: `
      <p class="hint">This is the page the customer opens from the emailed link (and from their order page).</p>
      <div style="border:1px solid var(--line);border-radius:12px;padding:22px;display:grid;gap:16px">
        ${i.status === 'void' ? '<p class="err">VOID</p>' : ''}
        <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:2px solid var(--maroon);padding-bottom:14px"><div><strong style="font:700 24px var(--f-display)">${esc(c.brand)}</strong><div>${esc(c.name)}</div><div class="muted small">GSTIN: to be added · ${esc(c.state)}</div><div class="muted small">${esc(c.email)} · ${esc(c.phone)}</div></div>
        <div style="text-align:right"><div class="lbl">Tax invoice</div><strong>${esc(i.number)}</strong><div class="muted small">${fmtD(i.date)} · Order ${esc(i.orderNumber)}</div></div></div>
        <div class="form__row"><div><div class="lbl">Billed to</div><strong>${esc(b.name)}</strong><br>${esc(a.line1)}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pin)}<br><span class="muted small">${esc(b.phone)} · ${esc(b.email)}</span></div><div><div class="lbl">Place of supply</div>${esc(a.state)}<div class="lbl" style="margin-top:8px">Tax</div>${t.intra ? `CGST ${t.rate / 2}% + SGST ${t.rate / 2}%` : `IGST ${t.rate}%`}</div></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Description</th><th>HSN</th><th class="n">Qty</th><th class="n">Rate (₹)</th><th class="n">Taxable (₹)</th></tr></thead><tbody>${i.lines.map(l => `<tr><td>${esc(l.desc)}</td><td>${esc(l.hsn)}</td><td class="n">${l.qty}</td><td class="n">${money(l.unit)}</td><td class="n">${money(l.amount)}</td></tr>`).join('')}</tbody></table></div>
        <dl class="dl" style="margin-left:auto;min-width:min(320px,100%)"><dt>Taxable value</dt><dd class="num" style="text-align:right">₹${money(i.subtotal)}</dd>${t.intra ? `<dt>CGST ${t.rate / 2}%</dt><dd class="num" style="text-align:right">₹${money(t.cgst)}</dd><dt>SGST ${t.rate / 2}%</dt><dd class="num" style="text-align:right">₹${money(t.sgst)}</dd>` : `<dt>IGST ${t.rate}%</dt><dd class="num" style="text-align:right">₹${money(t.igst)}</dd>`}<dt><strong>Total</strong></dt><dd class="num" style="text-align:right"><strong>₹${money(i.total)}</strong></dd><dt>Paid</dt><dd class="num" style="text-align:right">₹${money(Math.min(i.paid, i.total))}</dd>${i.total - i.paid > 0.004 ? `<dt><strong>Balance due</strong></dt><dd class="num" style="text-align:right"><strong>₹${money(i.total - i.paid)}</strong></dd>` : ''}</dl>
      </div>` });
  }

  /* ---------------- sign in ---------------- */
  function renderLogin(msg) {
    app.innerHTML = `<div class="login"><div class="login__card">
      <div class="login__brand"><img src="assets/logo.svg" alt="Thulori" width="90" height="34"><span>Admin</span></div>
      <h1>Sign in</h1>
      ${msg ? `<p class="hint">${esc(msg)}</p>` : ''}
      <form class="form" data-login novalidate>
        ${field('lg-email', 'Email', '<input id="lg-email" name="email" type="email" autocomplete="username" required>')}
        ${field('lg-pw', 'Password', '<input id="lg-pw" name="password" type="password" autocomplete="current-password" required>')}
        <p class="err" data-err role="alert"></p>
        <button class="btn" type="submit">Continue</button>
      </form>
      <form class="form" data-code novalidate hidden>
        <p data-code-msg></p>
        ${field('lg-code', '6-digit code', '<input id="lg-code" name="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>')}
        <p class="err" data-err role="alert"></p>
        <button class="btn" type="submit">Sign in</button>
        <button class="link" type="button" data-back>Use a different account</button>
      </form>
      <p class="small muted">For the Thulori team only. Customers sign in on the website.</p>
    </div></div>`;
    if (DEMO) { $('.login__card h1').insertAdjacentHTML('afterend', '<p class="hint"><strong>Preview with sample data.</strong> Sign in with any email and password, then any 6-digit code. Nothing you do here is saved or sent.</p>'); $('#lg-email').value = 'owner@thulori.com'; $('#lg-pw').value = 'preview'; setTimeout(() => { const c = $('#lg-code'); if (c) c.value = '123456'; }); }
    else if (!BASE) { $('.login__card h1').insertAdjacentHTML('afterend', '<p class="hint">Set <code>API_BASE</code> in <code>admin/.env</code> (or the host's environment variables) to the Thulori API address, then run <code>sh config-from-env.sh</code>.</p>'); }
    const lf = $('[data-login]'), cf = $('[data-code]'); let challenge = null;
    lf.addEventListener('submit', async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(lf)), err = $('[data-err]', lf); err.textContent = '';
      $('[type=submit]', lf).disabled = true;
      try {
        const r = await post('/auth/login', { email: f.email.trim(), password: f.password });
        if (r.user) { ME = r.user; boot(); return; }
        challenge = r.challenge; lf.hidden = true; cf.hidden = false;
        $('[data-code-msg]', cf).textContent = `We’ve emailed a sign-in code to ${r.sentTo}. It works for 10 minutes.`; $('#lg-code').focus();
      } catch (er) { err.textContent = er.message; } finally { $('[type=submit]', lf).disabled = false; }
    });
    cf.addEventListener('submit', async e => {
      e.preventDefault(); const err = $('[data-err]', cf); err.textContent = '';
      try { const r = await post('/auth/verify', { challenge, code: $('#lg-code').value.trim() }); ME = r.user; boot(); }
      catch (er) { err.textContent = er.message; if (er.code === 'code_expired') { cf.hidden = true; lf.hidden = false; } }
    });
    $('[data-back]', cf).addEventListener('click', () => { cf.hidden = true; lf.hidden = false; $('#lg-email').focus(); });
    $('#lg-email').focus();
  }

  /* ---------------- shell + router ---------------- */
  function shell(active) {
    if (!$('.shell')) {
      app.innerHTML = `<div class="shell"><aside class="side">
        <div class="side__logo"><img src="assets/logo.svg" alt="Thulori" width="84" height="32"><span>Admin</span></div>
        <nav class="nav" aria-label="Admin">
          <a href="#/orders" data-nav="orders">Orders <span class="nav__n" data-todo-n hidden></span></a>
          ${isAdmin() ? '<a href="#/payments" data-nav="payments">Payments</a>' : ''}
          <a href="#/customers" data-nav="customers">Customers</a>
          <a href="#/new" data-nav="new">New order</a>
        </nav>
        ${DEMO ? '<p class="side__demo">Preview with sample orders. Changes last until you reload.</p>' : ''}
        <div class="side__me"><strong>${esc(ME.name || ME.email)}</strong><small>${esc(ME.email)} · ${esc(ME.role)}</small><button type="button" data-signout>Sign out</button></div>
      </aside><main class="main" id="main"></main></div>`;
      $('[data-signout]').addEventListener('click', async () => { try { await post('/auth/logout'); } catch (e) {} ME = null; renderLogin('Signed out.'); });
    }
    $$('[data-nav]').forEach(a => a.classList.toggle('is-on', a.dataset.nav === active));
    const m = $('#main'); m.innerHTML = '<p class="muted">Loading…</p>'; return m;
  }
  async function refreshMeta() {
    META = await get('/summary');
    const todo = ['attention', 'to_write', 'changes_requested', 'to_print'].reduce((t, k) => t + (META.buckets[k] ? META.buckets[k].count : 0), 0);
    const n = $('[data-todo-n]'); if (n) { n.textContent = todo; n.hidden = !todo; }
  }
  async function route() {
    if (!ME) return;
    const [path, query] = (CUR.slice(1) || '/orders').split('?');
    const params = new URLSearchParams(query || '');
    const parts = path.split('/').filter(Boolean);
    try {
      if (parts[0] === 'order' && parts[1]) return await viewOrder(decodeURIComponent(parts[1]));
      if (parts[0] === 'book' && parts[1]) return await viewBook(parts[1]);
      if (parts[0] === 'payments' && isAdmin()) return await viewPayments(params);
      if (parts[0] === 'new') return await viewNew();
      if (parts[0] === 'customers') return await viewCustomers(params);
      return await viewOrders(params);
    } catch (e) {
      if (e.status === 401) return;
      const m = $('#main'); if (m) m.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p><p><a class="link" href="#/orders">Back to orders</a></p></div>`;
    }
  }
  addEventListener('hashchange', () => { if (location.hash && location.hash !== CUR) { CUR = location.hash; route(); } });
  const reload = () => route();

  /* ================= ORDERS ================= */
  const TODO = new Set(['attention', 'to_write', 'changes_requested', 'to_print']);
  const QUEUE_ORDER = ['attention', 'refunding', 'to_write', 'changes_requested', 'to_print', 'unpaid', 'awaiting_photos', 'in_design', 'proof_out', 'shipped', 'delivered', 'cancelled'];
  async function viewOrders(p) {
    const m = shell('orders'); await refreshMeta();
    const f = { q: p.get('q') || '', bucket: p.get('bucket') || '', status: p.get('status') || '', edition: p.get('edition') || '', state: p.get('state') || '', from: p.get('from') || '', to: p.get('to') || '', source: p.get('source') || '', sort: p.get('sort') || 'new', page: p.get('page') || '1' };
    const data = await get('/orders' + qs(f));
    const B = META.buckets;
    m.innerHTML = `
      <div class="top"><div><h1>Orders</h1><p>${data.total} order${data.total === 1 ? '' : 's'}${f.bucket && B[f.bucket] ? ` · ${esc(B[f.bucket].label)}` : ''}${isAdmin() ? ` · ${inr(data.value)} in total` : ''}</p></div>
        <div class="btns"><a class="btn btn--sun" href="#/new">+ New order</a></div></div>
      ${isAdmin() ? `<div class="money"><div class="tile"><span class="tile__l">Received today</span><span class="tile__n">${inr(META.money.today)}</span></div><div class="tile"><span class="tile__l">This month · ${META.money.monthCount} payment${META.money.monthCount === 1 ? '' : 's'}</span><span class="tile__n">${inr(META.money.month)}</span></div>${META.failedMessages ? `<div class="tile"><span class="tile__l">Messages that failed (7 days)</span><span class="tile__n" style="color:var(--coral-d)">${META.failedMessages}</span></div>` : ''}</div>` : ''}
      <div class="tiles" role="group" aria-label="Work queues">${QUEUE_ORDER.filter(k => B[k] && (B[k].count || !['attention', 'refunding'].includes(k))).map(k => `<a class="tile${TODO.has(k) ? ' tile--todo' : ''}${f.bucket === k ? ' is-on' : ''}" href="#/orders${qs({ bucket: f.bucket === k ? '' : k })}"><span class="tile__n">${B[k].count}</span><span class="tile__l">${esc(B[k].label)}</span></a>`).join('')}</div>
      <section class="card">
        <form class="filters" data-filters>
          ${field('fq', 'Search', `<input id="fq" name="q" type="search" value="${esc(f.q)}" placeholder="Order no., name, phone, email, child">`, 'f--grow')}
          ${field('fstatus', 'Payment', `<select id="fstatus" name="status">${opts({ pending_payment: 'Awaiting payment', paid: 'Paid', failed: 'Failed', cancelled: 'Cancelled', refunded: 'Refunded' }, f.status, 'Any')}</select>`)}
          ${field('fed', 'Edition', `<select id="fed" name="edition">${opts(ED, f.edition, 'Any')}</select>`)}
          ${field('fst', 'State', `<select id="fst" name="state">${stateOpts(f.state, 'Any')}</select>`)}
          ${field('ffrom', 'From', `<input id="ffrom" name="from" type="date" value="${esc(f.from)}">`)}
          ${field('fto', 'To', `<input id="fto" name="to" type="date" value="${esc(f.to)}">`)}
          ${field('fsrc', 'Placed', `<select id="fsrc" name="source">${opts({ web: 'On the website', admin: 'By the team' }, f.source, 'Anywhere')}</select>`)}
          ${field('fsort', 'Sort', `<select id="fsort" name="sort">${opts({ new: 'Newest first', old: 'Oldest first', total: 'Highest value' }, f.sort)}</select>`)}
          <input type="hidden" name="bucket" value="${esc(f.bucket)}">
          <div class="btns"><button class="btn" type="submit">Filter</button><a class="btn btn--ghost" href="#/orders">Clear</a></div>
        </form>
      </section>
      <section class="card">
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Storybooks</th><th>Delivery</th><th>Payment</th><th class="n">Total</th></tr></thead><tbody>
        ${data.orders.map(o => `<tr data-href="#/order/${esc(o.number)}">
          <td><a href="#/order/${esc(o.number)}"><strong>${esc(o.number)}</strong></a><span class="sub">${fmtD(o.createdAt)}${o.source === 'admin' ? ' · by team' : ''}</span></td>
          <td>${esc(o.customer.name)}<span class="sub">${esc(o.customer.phone || o.customer.email || '')}</span></td>
          <td>${o.books.map(b => `<div class="bk"><span>${esc(b.child)} · ${esc(ED[b.edition] || b.edition)}</span>${o.status === 'paid' ? stagePill(b.stage, b.proofStatus) : ''}</div>`).join('')}</td>
          <td>${esc(o.city || '')}<span class="sub">${esc(o.state || '')}</span></td>
          <td>${orderPill(o.status)}</td>
          <td class="n">${inr(o.total)}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">No orders match these filters.</td></tr>`}
        </tbody></table></div>
        ${data.total > data.size ? `<div class="pager"><span class="muted">Page ${data.page} of ${Math.ceil(data.total / data.size)}</span><div class="btns">
          ${data.page > 1 ? `<a class="btn btn--ghost btn--sm" href="#/orders${qs({ ...f, page: data.page - 1 })}">‹ Previous</a>` : ''}
          ${data.page * data.size < data.total ? `<a class="btn btn--ghost btn--sm" href="#/orders${qs({ ...f, page: data.page + 1 })}">Next ›</a>` : ''}</div></div>` : ''}
      </section>`;
    $('[data-filters]').addEventListener('submit', e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); go('#/orders' + qs({ ...d, sort: d.sort === 'new' ? '' : d.sort })); });
  }

  /* ================= ORDER ================= */
  async function viewOrder(id) {
    const m = shell('orders');
    if (!META) await refreshMeta();
    const d = await get('/orders/' + encodeURIComponent(id));
    const o = d.order, c = d.customer || {}, a = o.address || {};
    const unpaid = o.status === 'pending_payment' || o.status === 'failed';
    const live = o.status !== 'cancelled' && o.status !== 'refunded';
    const allApproved = d.books.every(b => b.stage >= 4);
    m.innerHTML = `
      <div class="top"><div><p class="crumb"><a href="#/orders">Orders</a> ›</p><h1>${esc(o.number)}</h1>
        <p>${orderPill(o.status)} · Placed ${fmtDT(o.createdAt)}${o.source === 'admin' ? ' by the team' : ' on the website'}${o.paidAt ? ` · Paid ${fmtD(o.paidAt)}` : ''}</p></div>
        <div class="btns">
          ${unpaid && isAdmin() ? '<button class="btn btn--sun" data-act="paid">Mark as paid</button>' : ''}
          ${unpaid ? '<button class="btn btn--ghost" data-act="remind">Send payment reminder</button>' : ''}
          ${unpaid && o.provider === 'cashfree' ? '<button class="btn btn--ghost" data-act="recheck">Re-check with Cashfree</button>' : ''}
          ${o.status === 'paid' && !o.shipping ? `<button class="btn ${allApproved ? 'btn--sun' : 'btn--ghost'}" data-act="ship">Ship order</button>` : ''}
          ${o.shipping && !o.shipping.deliveredAt ? '<button class="btn btn--sun" data-act="deliver">Mark delivered</button>' : ''}
          ${live && !o.shipping && isAdmin() ? '<button class="btn btn--danger" data-act="cancel">Cancel order</button>' : ''}
        </div></div>
      ${o.status === 'cancelled' ? `<p class="hint">Cancelled ${fmtD(o.cancelledAt)}${o.cancelReason ? ' — ' + esc(o.cancelReason) : ''}.${d.refundable > 0 ? ` <strong>${inr(d.refundable)} is still with us</strong> — refund it below.` : ''}</p>` : ''}
      ${issuesHtml(d)}
      ${d.processing ? '<p class="hint">A payment is still being confirmed by the customer’s bank. Don’t ask them to pay again — it settles on its own within minutes (sometimes a few hours).</p>' : ''}
      <div class="grid2">
        <div class="stack">
          <section class="card"><div class="card__h"><h2>Storybooks</h2></div><div class="stack">
          ${d.books.map(b => `<div class="book">
            <div class="book__h"><div><strong>${esc(b.child)}’s storybook</strong><div class="muted">${esc(ED[b.edition] || b.edition)} edition</div></div><div>${o.status === 'paid' ? stagePill(b.stage) : '<span class="pill pill--plain">Opens after payment</span>'}</div></div>
            ${steps(b.stage)}
            <div class="meta"><span><b>${b.photos}</b> photos${b.unread ? ` (${b.unread} unread)` : ''}</span><span><b>${b.stories}</b> of ${b.cards} answered</span><span>Letter: <b>${b.letter ? 'yes' : 'no'}</b></span>${b.submittedAt ? `<span>Sent to us ${fmtD(b.submittedAt)}</span>` : ''}</div>
            <div class="btns"><a class="btn btn--sm" href="#/book/${b.id}">Open workspace</a>${o.status === 'paid' && b.stage !== 3 && b.stage < 5 ? `<button class="btn btn--ghost btn--sm" data-stage="${b.id}">Set checkpoint…</button>` : ''}</div>
          </div>`).join('')}
          </div></section>

          <section class="card"><div class="card__h"><h2>Payments</h2><div class="btns">${isAdmin() && unpaid ? '<button class="btn btn--sm btn--sun" data-act="paid">Mark as paid</button>' : ''}${isAdmin() && d.refundable > 0 ? '<button class="btn btn--sm btn--ghost" data-act="refund">Refund…</button>' : ''}</div></div>
            <dl class="dl"><dt>Order total</dt><dd><strong>${inr(o.total)}</strong> <span class="muted small">(${inr(o.subtotal)} + ${o.gstRate}% GST ${inr(o.tax)})</span></dd><dt>Received</dt><dd>${inr(o.paid)}${o.refunded ? ` <span class="muted small">after ${inr(o.refunded)} refunded</span>` : ''}</dd>
            ${o.provider === 'cashfree' ? `<dt>Cashfree order</dt><dd>${esc(o.providerOrderId || '—')}</dd>` : ''}</dl>
            ${d.payments.length ? `<div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>How</th><th>Reference</th><th class="n">Amount</th></tr></thead><tbody>
              ${d.payments.map(p => `<tr><td>${fmtDT(p.at)}<span class="sub">${p.by ? 'by ' + esc(p.by) : esc(p.provider)}</span></td><td>${p.kind === 'refund' ? '<span class="pill pill--coral">Refund</span>' : '<span class="pill pill--leaf">Payment</span>'}</td><td>${esc(METHODS[p.method] || p.method || p.provider)}</td><td>${esc(p.ref || '—')}${p.note ? `<span class="sub">${esc(p.note)}</span>` : ''}</td><td class="n">${p.kind === 'refund' ? '−' : ''}${inr(p.amount)}</td></tr>`).join('')}
            </tbody></table></div>` : '<p class="muted" style="margin-top:10px">No payments yet.</p>'}
            ${refundsHtml(d)}
            ${(d.attempts || []).length > 1 ? `<details class="small" style="margin-top:12px"><summary class="muted">${d.attempts.length} payment attempts on the gateway</summary><ul class="plain">${d.attempts.map(x => `<li>${esc(x.id)} · ${inr(x.amount)} · ${esc({ open: 'open', paid: 'paid', closed: 'closed' }[x.status] || x.status)} · ${fmtDT(x.at)}</li>`).join('')}</ul></details>` : ''}
          </section>

          ${isAdmin() ? `<section class="card"><div class="card__h"><h2>Invoices</h2>${o.status === 'paid' || o.paid > 0 ? '<button class="btn btn--sm" data-act="invoice">Create invoice</button>' : ''}</div>
            ${d.invoices.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Date</th><th>Sent</th><th class="n">Total</th><th></th></tr></thead><tbody>
              ${d.invoices.map(i => `<tr><td><strong>${esc(i.number)}</strong> ${i.status === 'void' ? '<span class="pill pill--plain">Void</span>' : ''}</td><td>${fmtD(i.date)}</td><td>${i.sentAt ? `${fmtDT(i.sentAt)}<span class="sub">${esc(i.sentTo)}</span>` : '<span class="muted">Not sent</span>'}</td><td class="n">${inr(i.total)}</td>
                <td class="n"><div class="btns" style="justify-content:flex-end"><a class="btn btn--ghost btn--sm" href="${esc(i.url)}" target="_blank" rel="noopener">View</a>${i.status === 'issued' ? `<button class="btn btn--ghost btn--sm" data-inv-send="${i.id}">${i.sentAt ? 'Resend' : 'Email'}</button><button class="btn btn--danger btn--sm" data-inv-void="${i.id}" data-num="${esc(i.number)}">Void</button>` : ''}</div></td></tr>`).join('')}
            </tbody></table></div>` : `<p class="muted">${o.status === 'paid' ? 'No invoice yet — create one when you’re ready.' : 'Invoices can be created once the order is paid.'}</p>`}
          </section>` : ''}

          <section class="card"><div class="card__h"><h2>Messages to the customer</h2></div>
            ${d.messages.length ? `<ul class="tl" data-msgs>${d.messages.map((x, i) => `<li class="${x.status === 'failed' ? 'is-bad' : ''}"${i >= 6 ? ' hidden' : ''}><div><p><strong>${esc(x.template.replace(/_/g, ' '))}</strong> · ${esc(x.channel)} → ${esc(x.to)} · ${x.status === 'failed' ? `<span class="pill pill--coral">Failed</span>` : x.status === 'logged' ? '<span class="pill pill--plain">Logged (not connected)</span>' : '<span class="pill pill--leaf">Sent</span>'}</p>${x.error ? `<small>${esc(x.error)}</small>` : ''}<small>${fmtDT(x.at)}</small></div></li>`).join('')}</ul>${d.messages.length > 6 ? `<button class="link" style="margin-top:10px" data-msgs-all>Show all ${d.messages.length}</button>` : ''}` : '<p class="muted">Nothing sent yet.</p>'}
          </section>
        </div>

        <div class="stack">
          <section class="card"><div class="card__h"><h2>Customer</h2>${!o.shipping ? '<button class="link" data-act="edit">Edit</button>' : ''}</div>
            <dl class="dl"><dt>Name</dt><dd>${esc(o.contact.name)}</dd><dt>Phone</dt><dd>${esc(o.contact.phone)} ${waLink(o.contact.phone) ? `· <a class="link" href="${waLink(o.contact.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</dd><dt>Email</dt><dd>${esc(o.contact.email)}</dd>
            <dt>Account</dt><dd>${c.hasPassword ? 'Active' : '<span class="pill pill--sun">Hasn’t set a password yet</span>'}</dd></dl>
            <div class="lbl" style="margin-top:14px">Deliver to</div>
            <address class="addr">${esc(a.to)}<br>${esc(a.line1)}${a.line2 ? '<br>' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pin)}${a.phone ? '<br>' + esc(a.phone) : ''}</address>
          </section>
          <section class="card"><div class="card__h"><h2>Order</h2></div>
            <dl class="dl">${d.items.map(i => `<dt>${esc(ED[i.edition] || i.edition)}</dt><dd>${esc(i.child)} · ${inr(i.price)}</dd>`).join('')}
            ${o.giftNote ? `<dt>Gift note</dt><dd>“${esc(o.giftNote)}”</dd>` : ''}
            ${o.shipping ? `<dt>Shipped</dt><dd>${esc(o.shipping.courier)} · ${esc(o.shipping.awb)}${o.shipping.url ? ` · <a class="link" href="${esc(o.shipping.url)}" target="_blank" rel="noopener">Track</a>` : ''}<br><span class="muted small">${fmtDT(o.shipping.at)}${o.shipping.deliveredAt ? ' · delivered ' + fmtD(o.shipping.deliveredAt) : ''}</span></dd>` : ''}</dl>
          </section>
          <section class="card"><div class="card__h"><h2>Team notes</h2></div>
            <form class="form" data-note><textarea class="in" name="text" rows="2" placeholder="Only the team sees these — e.g. “Mum prefers calls after 6pm”" aria-label="Add a note"></textarea><div class="btns"><button class="btn btn--sm" type="submit">Add note</button></div></form>
            <div class="stack" style="gap:8px;margin-top:12px">${d.notes.slice().reverse().map(n => `<div class="note">${esc(n.text)}<small>${esc(n.author || 'Team')} · ${fmtDT(n.at)}</small></div>`).join('')}</div>
          </section>
          <section class="card"><div class="card__h"><h2>Activity</h2></div>
            <ul class="tl">${d.activity.map(x => `<li class="${String(x.action).startsWith('admin') ? 'is-man' : ''}"><div><p>${esc(describe(x))}</p><small>${esc(x.who || 'System')} · ${fmtDT(x.at)}</small></div></li>`).join('') || '<li><p class="muted">No activity yet.</p></li>'}</ul>
          </section>
        </div>
      </div>`;

    const act = (k, fn) => $$(`[data-act="${k}"]`, m).forEach(b => b.addEventListener('click', fn));
    const ma = $('[data-msgs-all]', m); ma && ma.addEventListener('click', () => { $$('[data-msgs] li', m).forEach(li => { li.hidden = false; }); ma.remove(); });
    act('paid', () => markPaidDlg(o));
    act('refund', () => refundDlg(o));
    $$('[data-issue-refund]', m).forEach(b => b.addEventListener('click', () => refundDlg(o, b.dataset.issueRefund, Number(b.dataset.amount))));
    $$('[data-issue-resolve]', m).forEach(b => b.addEventListener('click', () => dialog({ title: 'Mark as resolved', submit: 'Mark resolved', body: `<p class="hint">${esc(b.dataset.detail)}</p>${field('is-note', 'What did you do?', '<input id="is-note" name="note" placeholder="e.g. Refunded by UPI, customer confirmed on WhatsApp">')}`, fieldMap: { note: 'is-note' }, onSubmit: async (_f, v) => { await post(`/issues/${b.dataset.issueResolve}/resolve`, { note: v.note.trim() }); toast('Marked as resolved.'); await refreshMeta(); reload(); } })));
    $$('[data-rf-check]', m).forEach(b => b.addEventListener('click', async () => { try { const r = await post(`/refunds/${b.dataset.rfCheck}/check`); toast(r.refund.status === 'succeeded' ? 'Refund has reached the customer.' : r.refund.status === 'failed' ? 'The refund failed — see below.' : 'Still processing at the bank.'); reload(); } catch (e) { toast(e.message, true); } }));
    $$('[data-rf-retry]', m).forEach(b => b.addEventListener('click', () => confirmDlg('Try this refund again?', 'A new refund request goes to Cashfree for the same amount, back to the customer’s original payment method.', 'Retry refund', async () => { await post(`/refunds/${b.dataset.rfRetry}/retry`); toast('Refund sent again.'); await refreshMeta(); reload(); })));
    act('cancel', () => cancelDlg(o));
    act('ship', () => shipDlg(o));
    act('deliver', () => confirmDlg('Mark as delivered?', `Every storybook in ${esc(o.number)} moves to “Delivered”.<br><label class="check" style="margin-top:10px"><input type="checkbox" name="notify" checked> Tell the customer</label>`, 'Mark delivered', async (f) => { await post(`/orders/${o.number}/deliver`, { notify: f.notify.checked }); toast('Marked as delivered.'); reload(); }));
    act('remind', async () => { try { await post(`/orders/${o.number}/remind`); toast('Payment reminder sent.'); reload(); } catch (e) { toast(e.message, true); } });
    act('recheck', async () => { try { const r = await post(`/orders/${o.number}/refresh-payment`); toast(r.status === 'paid' ? 'Cashfree says it’s paid — updated.' : 'Still not paid on Cashfree.'); reload(); } catch (e) { toast(e.message, true); } });
    act('edit', () => editOrderDlg(o));
    act('invoice', () => invoiceDlg(o));
    $$('[data-stage]', m).forEach(b => b.addEventListener('click', () => stageDlg(d.books.find(x => x.id === b.dataset.stage), reload)));
    $$('[data-inv-send]', m).forEach(b => b.addEventListener('click', () => dialog({ title: 'Email invoice', body: field('iv-to', 'Send to', `<input id="iv-to" name="to" type="email" value="${esc(o.contact.email)}">`), submit: 'Send', onSubmit: async (_f, v) => { await post(`/invoices/${b.dataset.invSend}/send`, { to: v.to.trim() || undefined }); toast('Invoice emailed.'); reload(); } })));
    $$('[data-inv-void]', m).forEach(b => b.addEventListener('click', () => confirmDlg('Void this invoice?', `Invoice ${esc(b.dataset.num)} will be marked void (it stays on record, and its number is not reused). Create a new invoice afterwards if needed.`, 'Void invoice', async () => { await post(`/invoices/${b.dataset.invVoid}/void`); toast('Invoice voided.'); reload(); }, true)));
    $('[data-note]', m).addEventListener('submit', async e => { e.preventDefault(); const t = e.target.text.value.trim(); if (!t) return; try { await post(`/orders/${o.number}/notes`, { text: t }); reload(); } catch (er) { toast(er.message, true); } });
  }
  function describe(x) {
    const m = x.meta || {};
    const map = {
      order_created: 'Order placed on the website', admin_order_created: 'Order created by the team', order_paid: `Payment received${m.provider === 'manual' ? ' (recorded by hand)' : m.provider ? ' via ' + m.provider : ''}${m.ref ? ' · ref ' + m.ref : ''}`,
      book_submitted: 'Customer sent photos & stories', proof_changes: `Customer asked for changes (${m.notes || ''} notes)`, proof_approved: `Customer approved proof round ${m.round || ''}`,
      admin_stage: `Moved a book: ${STAGES[m.from] || m.from} → ${STAGES[m.to] || m.to}${m.note ? ' — ' + m.note : ''}`, admin_proof: `Proof round ${m.round} sent (${m.pages} pages)`,
      admin_proof_decision: `Recorded customer’s decision: ${m.decision === 'approved' ? 'approved' : 'changes'} (round ${m.round})${m.note ? ' — ' + m.note : ''}`,
      admin_ship: `Shipped with ${m.courier} · ${m.awb}`, admin_deliver: 'Marked delivered', admin_cancel: `Order cancelled${m.reason ? ' — ' + m.reason : ''}`,
      refund_started: `Refund of ${inr((m.amount || 0) / 100)} started${m.manual ? ' (sent by hand)' : ' through the gateway'}${m.reason ? ' — ' + m.reason : ''}`,
      refund_succeeded: `Refund of ${inr((m.amount || 0) / 100)} reached the customer${m.arn ? ' · bank ref ' + m.arn : ''}`, refund_failed: `Refund of ${inr((m.amount || 0) / 100)} failed${m.reason ? ' — ' + m.reason : ''}`,
      refund_late: 'A refund has been pending for over 10 days', auto_refund: `Cashfree refunded ${inr((m.amount || 0) / 100)} automatically`,
      issue_raised: `Needs attention: ${ISSUE[m.kind] || m.kind}`, issue_resolved: `Resolved: ${ISSUE[m.kind] || m.kind}${m.note ? ' — ' + m.note : ''}`,
      order_expired: 'Closed automatically — payment wasn’t completed', order_cancelled_by_customer: 'Cancelled by the customer',
      admin_refund: `Refund recorded: ${inr((m.amount || 0) / 100)}${m.ref ? ' · ref ' + m.ref : ''}`, admin_order_edit: `Edited ${(m.fields || []).join(', ')}`, admin_payment_reminder: 'Payment reminder sent',
      invoice_created: `Invoice ${m.invoice} created`, invoice_sent: `Invoice ${m.invoice} emailed to ${m.to}`, invoice_void: `Invoice ${m.invoice} voided`,
      admin_photos_added: `${m.count} photos added by the team`,  admin_photo_removed: 'A photo was removed', admin_book_edit: `Book details edited (${(m.fields || []).join(', ')})`,
    };
    return map[x.action] || x.action.replace(/_/g, ' ');
  }

  // ---- order dialogs
  function markPaidDlg(o) {
    dialog({ title: `Mark ${o.number} as paid`, submit: 'Record payment', body: `
      <p class="hint">Use this when the customer paid outside the website — UPI, bank transfer or cash. The customer sees the order as paid straight away and can start adding photos.</p>
      <div class="form__row">${field('mp-method', 'Paid by', `<select id="mp-method" name="method">${opts({ upi: 'UPI', bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', other: 'Other' }, 'upi')}</select>`)}
      ${field('mp-amount', 'Amount (₹)', `<input id="mp-amount" name="amount" type="number" step="0.01" min="1" value="${o.total}">`)}
      ${field('mp-date', 'Paid on', `<input id="mp-date" name="paidOn" type="date" value="${todayISO()}" max="${todayISO()}">`)}</div>
      ${field('mp-ref', 'Reference / UTR', '<input id="mp-ref" name="ref" placeholder="e.g. UPI ref 4321…">')}
      ${field('mp-note', 'Note', '<input id="mp-note" name="note" placeholder="Optional">')}
      <label class="check"><input type="checkbox" name="notify" checked> Email the customer the “payment received” message</label>`,
      onSubmit: async (f, v) => { await post(`/orders/${o.number}/mark-paid`, { method: v.method, amount: Number(v.amount) || undefined, paidOn: v.paidOn || undefined, ref: v.ref.trim() || undefined, note: v.note.trim() || undefined, notify: f.notify.checked }); toast('Payment recorded.'); reload(); } });
  }
  const ISSUE = { duplicate_payment: 'Paid twice', paid_after_cancel: 'Paid after the order was cancelled', refund_failed: 'Refund failed', overpaid: 'Paid more than the total', underpaid: 'Paid less than the total' };
  const RSTATE = { pending: '<span class="pill pill--sun">On its way</span>', succeeded: '<span class="pill pill--leaf">Reached customer</span>', failed: '<span class="pill pill--coral">Failed</span>' };
  function issuesHtml(d) {
    const open = (d.issues || []).filter(i => i.status === 'open');
    if (!open.length) return '';
    return `<section class="alert" role="alert"><h2>Needs attention</h2><ul>${open.map(i => `<li><div><strong>${esc(ISSUE[i.kind] || i.kind)}</strong>${i.amount ? ` · ${inr(i.amount)}` : ''}<p>${esc(i.detail)}</p><small class="muted">${fmtDT(i.at)}</small></div>
      ${isAdmin() ? `<div class="btns">${i.paymentId && d.refundable > 0 ? `<button class="btn btn--sm" data-issue-refund="${i.paymentId}" data-amount="${i.amount || ''}">Refund this payment</button>` : ''}<button class="btn btn--sm btn--ghost" data-issue-resolve="${i.id}" data-detail="${esc(i.detail)}">Mark resolved</button></div>` : ''}</li>`).join('')}</ul></section>`;
  }
  function refundsHtml(d) {
    if (!(d.refunds || []).length) return '';
    return `<div class="lbl" style="margin-top:16px">Refunds</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Started</th><th>Status</th><th>How</th><th>Bank ref / reason</th><th class="n">Amount</th><th></th></tr></thead><tbody>
      ${d.refunds.map(r => `<tr><td>${fmtDT(r.createdAt)}<span class="sub">${r.by ? 'by ' + esc(r.by) : 'automatic'}</span></td><td>${RSTATE[r.status] || esc(r.status)}${r.completedAt ? `<span class="sub">${fmtDT(r.completedAt)}</span>` : ''}</td>
        <td>${r.provider === 'manual' ? esc(METHODS[r.method] || r.method || 'By hand') : 'To original method'}</td>
        <td>${esc(r.arn || '—')}${r.reason ? `<span class="sub">${esc(r.reason)}</span>` : ''}${r.failure ? `<span class="sub err">${esc(r.failure)}</span>` : ''}${r.status === 'pending' && r.lastError ? `<span class="sub">Waiting for the gateway: ${esc(r.lastError)}</span>` : ''}</td>
        <td class="n">${inr(r.amount)}</td>
        <td class="n">${isAdmin() && r.status === 'pending' && r.provider !== 'manual' ? `<button class="btn btn--ghost btn--sm" data-rf-check="${r.id}">Check status</button>` : ''}${isAdmin() && r.status === 'failed' && r.provider !== 'manual' ? `<button class="btn btn--sm" data-rf-retry="${r.id}">Retry</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  const MANUAL_METHODS = { upi: 'UPI', bank_transfer: 'Bank transfer', cash: 'Cash', other: 'Other' };
  async function refundDlg(o, paymentId, amount) {
    let info; try { info = await get(`/orders/${o.number}/refundable`); } catch (e) { return toast(e.message, true); }
    const list = info.payments.filter(p => p.left > 0);
    if (!list.length) return toast('Nothing left to refund on this order.', true);
    const pick = list.find(p => p.id === paymentId) || null;
    const label = p => `${fmtD(p.at)} · ${esc(METHODS[p.method] || p.method || p.provider)}${p.ref ? ' · ' + esc(p.ref) : ''} — ${inr(p.left)} left${p.gateway ? '' : ' (taken by hand)'}`;
    dialog({ title: `Refund — ${o.number}`, submit: 'Refund', danger: true, fieldMap: { amount: 'rf-amount', reason: 'rf-reason' }, body: `
      ${list.length > 1 ? field('rf-pay', 'From which payment', `<select id="rf-pay" name="paymentId"><option value="">Any (newest first)</option>${list.map(p => `<option value="${p.id}"${pick && pick.id === p.id ? ' selected' : ''}>${label(p)}</option>`).join('')}</select>`) : `<input type="hidden" name="paymentId" value="${list[0].id}"><p class="hint">${label(list[0])}</p>`}
      <div class="form__row">${field('rf-amount', 'Amount (₹)', `<input id="rf-amount" name="amount" type="number" step="0.01" min="1" value="${amount || (pick ? pick.left : info.total)}">`)}
      ${field('rf-reason', 'Reason (shown to the customer)', '<input id="rf-reason" name="reason" placeholder="e.g. Paid twice by mistake">')}</div>
      <p class="hint" data-rf-gw>Cashfree sends it back to the customer’s original UPI / card / bank account. It usually lands in 3–7 working days; this page shows when it has.</p>
      <div data-rf-manual hidden><p class="hint">This money was received by hand, so it can’t go back through Cashfree. Send it yourself first, then record how.</p>
        <div class="form__row">${field('rf-method', 'Refunded by', `<select id="rf-method" name="method">${opts(MANUAL_METHODS, 'upi')}</select>`)}${field('rf-ref', 'Reference / UTR', '<input id="rf-ref" name="ref">')}</div></div>
      <label class="check"><input type="checkbox" name="notify" checked> Email the customer</label>`,
      onOpen: f => {
        const sync = () => { const id = f.paymentId.value; const chosen = id ? list.filter(p => p.id === id) : list; const manual = chosen.some(p => !p.gateway); $('[data-rf-manual]', f).hidden = !manual; $('[data-rf-gw]', f).hidden = manual && !chosen.some(p => p.gateway); if (id) f.amount.value = Math.min(Number(f.amount.value) || Infinity, list.find(p => p.id === id).left); };
        f.paymentId.addEventListener && f.paymentId.addEventListener('change', sync); sync();
      },
      onSubmit: async (f, v) => {
        const manual = !$('[data-rf-manual]', f).hidden;
        const r = await post(`/orders/${o.number}/refund`, { amount: Number(v.amount), reason: v.reason.trim(), paymentId: v.paymentId || undefined, notify: f.notify.checked, manual: manual ? { method: v.method, ref: v.ref.trim() || undefined } : undefined });
        const st = r.refunds.map(x => x.status);
        toast(st.includes('failed') ? 'The gateway declined the refund — see the order.' : st.every(x => x === 'succeeded') ? 'Refund done.' : 'Refund started — it will show here when it reaches the customer.', st.includes('failed'));
        await refreshMeta(); reload();
      } });
  }
  async function cancelDlg(o) {
    let info = { payments: [], total: 0 }; if (o.paid > 0) { try { info = await get(`/orders/${o.number}/refundable`); } catch (e) {} }
    const manual = info.payments.some(p => p.left > 0 && !p.gateway);
    dialog({ title: `Cancel ${o.number}?`, submit: 'Cancel order', danger: true, body: `
      ${info.total > 0 ? `<p class="hint"><strong>${inr(info.total)} has been paid.</strong></p><label class="check"><input type="checkbox" name="refund" checked> Refund ${inr(info.total)} in full now</label>
        ${manual ? `<div class="form__row">${field('cn-method', 'Refunded by (for money received by hand)', `<select id="cn-method" name="method">${opts(MANUAL_METHODS, 'upi')}</select>`)}${field('cn-ref', 'Reference', '<input id="cn-ref" name="ref">')}</div>` : ''}` : ''}
      ${field('cn-reason', 'Reason (shown to the customer)', '<input id="cn-reason" name="reason" placeholder="e.g. Ordered twice by mistake">')}
      <label class="check"><input type="checkbox" name="notify" checked> Email the customer</label>`,
      onSubmit: async (f, v) => {
        const refund = !!(f.refund && f.refund.checked);
        const r = await post(`/orders/${o.number}/cancel`, { reason: v.reason.trim() || undefined, notify: f.notify.checked, refund, manual: refund && manual ? { method: v.method, ref: (v.ref || '').trim() || undefined } : undefined });
        toast(r.refunds && r.refunds.length ? 'Order cancelled and refund started.' : r.refundDue > 0 ? `Order cancelled. ${inr(r.refundDue)} still to refund.` : 'Order cancelled.');
        await refreshMeta(); reload();
      } });
  }
  function shipDlg(o, force = false, prev = {}) {
    dialog({ title: `Ship ${o.number}`, submit: force ? 'Ship anyway' : 'Mark as shipped', body: `
      ${force ? '<p class="hint"><strong>Not every book is approved for printing.</strong> Ship anyway only if the customer approved outside the site — better: record their decision in the book workspace first.</p>' : ''}
      <div class="form__row">${field('sh-courier', 'Courier', `<input id="sh-courier" name="courier" list="couriers" required value="${esc(prev.courier || '')}"><datalist id="couriers">${COURIERS.map(x => `<option value="${x}">`).join('')}</datalist>`)}
      ${field('sh-awb', 'Tracking number (AWB)', `<input id="sh-awb" name="awb" required value="${esc(prev.awb || '')}">`)}</div>
      ${field('sh-url', 'Tracking link (optional)', `<input id="sh-url" name="url" type="url" inputmode="url" placeholder="https://… from Shiprocket or the courier" value="${esc(prev.url || '')}">`)}
      <p class="hint">The customer sees the courier, tracking number and a “Track parcel” button on their storybook and order pages.</p>
      <label class="check"><input type="checkbox" name="notify" checked> Email the customer the tracking details</label>`,
      onSubmit: async (f, v) => {
        try { await post(`/orders/${o.number}/ship`, { courier: v.courier.trim(), awb: v.awb.trim(), trackingUrl: (v.url || '').trim() || undefined, notify: f.notify.checked, force }); toast('Shipped — the customer has the tracking number.'); reload(); }
        catch (e) { if (e.code === 'not_approved' && !force) { setTimeout(() => shipDlg(o, true, v)); return; } throw e; }
      } });
  }
  function editOrderDlg(o) {
    const a = o.address || {}, c = o.contact || {};
    dialog({ title: `Edit ${o.number}`, wide: true, fieldMap: { 'contact.name': 'ed-name', 'contact.email': 'ed-email', 'contact.phone': 'ed-phone', 'address.to': 'ed-to', 'address.line1': 'ed-line1', 'address.city': 'ed-city', 'address.state': 'ed-state', 'address.pin': 'ed-pin', 'address.phone': 'ed-aphone' }, body: `
      <div class="lbl">Contact</div>
      <div class="form__row">${field('ed-name', 'Name', `<input id="ed-name" name="name" value="${esc(c.name)}">`)}${field('ed-email', 'Email', `<input id="ed-email" name="email" type="email" value="${esc(c.email)}">`)}${field('ed-phone', 'Phone', `<input id="ed-phone" name="phone" value="${esc(c.phone)}">`)}</div>
      <div class="lbl">Delivery address</div>
      <div class="form__row">${field('ed-to', 'Recipient', `<input id="ed-to" name="to" value="${esc(a.to)}">`)}${field('ed-aphone', 'Phone at address', `<input id="ed-aphone" name="aphone" value="${esc(a.phone || '')}">`)}</div>
      ${field('ed-line1', 'House & street', `<input id="ed-line1" name="line1" value="${esc(a.line1)}">`)}${field('ed-line2', 'Area / landmark', `<input id="ed-line2" name="line2" value="${esc(a.line2 || '')}">`)}
      <div class="form__row">${field('ed-city', 'City', `<input id="ed-city" name="city" value="${esc(a.city)}">`)}${field('ed-state', 'State', `<select id="ed-state" name="state">${stateOpts(a.state)}</select>`)}${field('ed-pin', 'PIN', `<input id="ed-pin" name="pin" inputmode="numeric" value="${esc(a.pin)}">`)}</div>
      ${field('ed-gift', 'Gift note', `<input id="ed-gift" name="gift" value="${esc(o.giftNote || '')}">`)}`,
      onSubmit: async (_f, v) => {
        await patch(`/orders/${o.number}`, { contact: { name: v.name, email: v.email, phone: v.phone }, address: { to: v.to, line1: v.line1, line2: v.line2, city: v.city, state: v.state, pin: v.pin, phone: v.aphone || undefined }, giftNote: v.gift.trim() || null });
        toast('Saved — the customer sees the change.'); reload();
      } });
  }
  async function invoiceDlg(o) {
    let draft; try { draft = await get(`/orders/${o.number}/invoice-draft`); } catch (e) { toast(e.message, true); return; }
    const rate = draft.gstRate, intra = String(draft.state || '').toLowerCase() === String(draft.companyState || '').toLowerCase();
    const row = l => `<tr><td><input name="desc" value="${esc(l.desc)}" aria-label="Description"></td><td><input name="hsn" value="${esc(l.hsn)}" aria-label="HSN" style="width:80px"></td><td><input class="qty" name="qty" type="number" min="1" value="${l.qty}" aria-label="Quantity"></td><td><input class="amt" name="unit" type="number" min="0" step="0.01" value="${l.unit}" aria-label="Rate"></td><td><button type="button" class="link" data-rm>Remove</button></td></tr>`;
    const form = dialog({ title: `Invoice for ${o.number}`, wide: true, submit: 'Create invoice', body: `
      <p class="hint">Rates are ${draft.pricesIncludeGst ? 'including' : 'before'} GST. Add a line for anything else; lines at ₹0 are left out. Place of supply: <strong>${esc(draft.state)}</strong> → ${intra ? `CGST ${rate / 2}% + SGST ${rate / 2}%` : `IGST ${rate}%`}.</p>
      <div class="tbl-wrap"><table class="tbl lines"><thead><tr><th>Description</th><th>HSN</th><th>Qty</th><th>Rate (₹)</th><th></th></tr></thead><tbody data-lines>${draft.lines.map(row).join('')}</tbody></table></div>
      <div><button type="button" class="link" data-add>+ Add a line</button></div>
      <dl class="dl" data-totals></dl>
      <div class="form__row">${field('iv-to', 'Email to', `<input id="iv-to" name="to" type="email" value="${esc(draft.email || '')}">`)}</div>
      <label class="check"><input type="checkbox" name="send" checked> Email the invoice to the customer now</label>`,
      onOpen: f => { calc(f); },
      onSubmit: async (f) => {
        const lines = $$('[data-lines] tr', f).map(tr => ({ desc: $('[name=desc]', tr).value.trim(), hsn: $('[name=hsn]', tr).value.trim(), qty: Number($('[name=qty]', tr).value) || 0, unit: Number($('[name=unit]', tr).value) || 0 })).filter(l => l.desc && l.qty > 0);
        const r = await post(`/orders/${o.number}/invoices`, { lines, send: f.send.checked, to: f.to.value.trim() || undefined });
        toast(`Invoice ${r.invoice.number} created${f.send.checked ? ' and emailed' : ''}.`); reload();
      } });
    function calc(f) {
      const sum = $$('[data-lines] tr', f).reduce((t, tr) => t + (Number($('[name=qty]', tr).value) || 0) * (Number($('[name=unit]', tr).value) || 0), 0);
      const base = draft.pricesIncludeGst ? sum / (1 + rate / 100) : sum, tax = draft.pricesIncludeGst ? sum - base : sum * rate / 100;
      $('[data-totals]', f).innerHTML = `<dt>Taxable value</dt><dd>${inr(Math.round(base * 100) / 100)}</dd><dt>${intra ? `CGST + SGST` : 'IGST'} (${rate}%)</dt><dd>${inr(Math.round(tax * 100) / 100)}</dd><dt><strong>Invoice total</strong></dt><dd><strong>${inr(Math.round((base + tax) * 100) / 100)}</strong> <span class="muted small">· paid so far ${inr(o.paid)}</span></dd>`;
    }
    form.addEventListener('input', () => calc(form));
    form.addEventListener('click', e => {
      if (e.target.closest('[data-rm]')) { e.target.closest('tr').remove(); calc(form); }
      if (e.target.closest('[data-add]')) { $('[data-lines]', form).insertAdjacentHTML('beforeend', row({ desc: '', hsn: draft.lines[0] ? draft.lines[0].hsn : '', qty: 1, unit: 0 })); calc(form); }
    });
  }
  function stageDlg(b, after) {
    const choices = {}; STAGES.forEach((s, i) => { if (i !== 3 && i !== 5 && i !== b.stage) choices[i] = `${s}${i < b.stage ? ' (move back)' : ''}`; });
    dialog({ title: `Set checkpoint — ${b.child}’s book`, submit: 'Update stage', body: `
      <p class="hint">Now at <strong>${esc(STAGES[b.stage])}</strong>. Use this for steps that happened outside the website (photos and stories sent on WhatsApp, printing done…). To send a proof, upload it in the workspace. Shipping is on the order page.</p>
      ${field('st-to', 'Move to', `<select id="st-to" name="stage">${opts(choices, b.stage === 0 ? 1 : b.stage === 1 ? 2 : b.stage === 4 ? 6 : '')}</select>`)}
      ${field('st-note', 'Why / what happened', '<input id="st-note" name="note" placeholder="e.g. Photos and voice notes received on WhatsApp">')}
      <label class="check"><input type="checkbox" name="notify" checked> Email the customer</label>`,
      onSubmit: async (f, v) => { await post(`/books/${b.id}/stage`, { stage: Number(v.stage), note: v.note.trim() || undefined, notify: f.notify.checked }); toast('Checkpoint updated — the customer sees it now.'); after(); } });
  }

  /* ================= BOOK WORKSPACE ================= */
  async function viewBook(id) {
    const m = shell('orders');
    const d = await get('/books/' + id);
    const b = d.book, last = d.rounds[d.rounds.length - 1];
    const waiting = last && last.status === 'ready';
    const photoQ = d.cards.filter(c => c.kind === 'photo'), themeQ = d.cards.filter(c => c.kind === 'theme');
    const ans = c => [c.pick != null && c.options[c.pick] ? c.options[c.pick] : '', c.text || ''].filter(Boolean).join(' — ');
    const byN = n => d.photos[n - 1];
    const next = {
      0: '<button class="btn btn--sun" data-next="1">Mark photos & stories received</button>',
      1: '<button class="btn btn--sun" data-next="2">Writing done — move to design</button>',
      2: '<a class="btn btn--sun" href="#proof" data-jump="proof">Upload the proof</a>',
      3: '<button class="btn btn--sun" data-decision>Record customer’s decision</button>',
      4: `<a class="btn btn--sun" href="#/order/${esc(b.order)}">Ship the order</a>`,
      5: '<button class="btn btn--sun" data-next="6">Mark delivered</button>', 6: '',
    }[b.stage];
    m.innerHTML = `
      <div class="top"><div><p class="crumb"><a href="#/orders">Orders</a> › <a href="#/order/${esc(b.order)}">${esc(b.order)}</a> ›</p><h1>${esc(b.child)}’s storybook</h1>
        <p>${esc(b.editionName)} edition · up to ${b.maxPhotos} photos · ${b.revisionRounds} revision round${b.revisionRounds === 1 ? '' : 's'} · ${stagePill(b.stage, last && last.status)}</p></div></div>
      <section class="card"><div class="card__h"><h2>Checkpoints</h2><div class="btns">${next}${b.stage !== 3 && b.stage !== 5 ? '<button class="btn btn--ghost" data-setstage>Set checkpoint…</button>' : ''}</div></div>
        ${steps(b.stage)}
        ${(b.log || []).length ? `<ul class="tl" style="margin-top:16px">${b.log.slice().reverse().map(l => `<li class="${l.manual ? 'is-man' : ''}"><div><p>${esc(STAGES[l.from])} → <strong>${esc(STAGES[l.to])}</strong>${l.note ? ' — ' + esc(l.note) : ''}</p><small>${esc(l.by)} · ${fmtDT(l.at)}${l.manual ? ' · set by hand' : ''}</small></div></li>`).join('')}</ul>` : ''}
      </section>

      <section class="card" id="photos"><div class="card__h"><h2>Photos · ${d.photos.length} of ${b.maxPhotos}</h2><div class="btns">
          ${d.photos.length ? `<a class="btn btn--sm" href="${BASE}/api/admin/books/${b.id}/photos.zip">Download all (zip)</a>` : ''}
          ${d.photos.length && b.read.status !== 'running' && b.read.status !== 'queued' ? '<button class="btn btn--ghost btn--sm" data-read>Read photos with AI</button>' : ''}
          <label class="btn btn--ghost btn--sm">Add photos for the customer<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic" multiple hidden data-addphotos></label></div></div>
        ${b.read.status === 'queued' || b.read.status === 'running' ? '<p class="hint">Reading photos… refresh in a minute.</p>' : ''}
        <div class="bar" data-up-bar hidden><span></span></div><p class="small muted" data-up-msg></p>
        ${d.photos.length ? `<div class="thumbs">${d.photos.map(p => `<div><button type="button" class="thumb" data-lb="${esc(p.view)}" data-cap="${esc(`Photo ${p.n} · ${p.name || ''}${p.scene ? ' — ' + p.scene : ''}`)}"><img src="${esc(p.view)}" alt="Photo ${p.n}" loading="lazy"><span class="thumb__n">${p.n}</span>${p.fav ? '<span class="thumb__fav">★</span>' : ''}</button>
          <div class="thumb-act"><a class="link" href="${esc(p.download)}" data-dl>Download</a><button class="link" data-delphoto="${p.id}" data-n="${p.n}">Remove</button></div></div>`).join('')}</div>`
        : '<p class="muted">No photos yet. If the customer sent them on WhatsApp or Drive, add them here — they appear in the customer’s account too.</p>'}
      </section>

      <section class="card"><div class="card__h"><h2>Stories · ${d.cards.filter(c => ans(c)).length} of ${d.cards.length} answered</h2>${d.cards.length || b.letter ? `<a class="btn btn--sm" href="${BASE}/api/admin/books/${b.id}/stories.txt">Download for the writer</a>` : ''}</div>
        ${d.cards.length ? `<div class="qa">${photoQ.concat(themeQ).map(c => { const ph = byN(c.photos[0]); return `<div class="qa__item">${ph ? `<button type="button" class="thumb" data-lb="${esc(ph.view)}" style="width:64px;height:64px"><img src="${esc(ph.view)}" alt="Photo ${ph.n}"></button>` : '<span></span>'}
          <div><p class="small muted">${c.kind === 'theme' ? `Recurring · photos ${c.photos.join(', ')}${c.topic ? ' · ' + esc(c.topic) : ''}` : `Photo ${c.photos[0] || '?'}`}</p><p class="qa__q">${esc(c.q)}</p>
          <p class="qa__a${ans(c) ? '' : ' is-none'}">${esc(ans(c) || 'Not answered')}</p>
          <div class="qa__edit" data-qa="${c.id}" hidden><select class="in" name="pick"><option value="">— no suggested answer —</option>${c.options.map((x, i) => `<option value="${i}"${c.pick === i ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select><textarea class="in" name="text" rows="2" placeholder="The story in the parent’s words">${esc(c.text || '')}</textarea><div class="btns"><button class="btn btn--sm" data-qa-save>Save answer</button><button class="link" data-qa-cancel>Cancel</button></div></div>
          <button class="link small" data-qa-open="${c.id}">Enter answer received outside the site</button></div></div>`; }).join('')}</div>`
        : '<p class="muted">Questions appear after the photos are read.</p>'}
        <div class="lbl" style="margin-top:18px">Letter to the future</div>
        <textarea class="in" data-letter rows="4" style="width:100%;margin-top:6px" placeholder="(none yet)">${esc(b.letter || '')}</textarea>
        <div class="btns" style="margin-top:8px"><button class="btn btn--ghost btn--sm" data-letter-save>Save letter</button></div>
      </section>

      <section class="card" id="proof"><div class="card__h"><h2>Proof</h2>${b.stage === 3 ? '<button class="btn btn--sun btn--sm" data-decision>Record customer’s decision</button>' : ''}</div>
        ${d.rounds.length ? d.rounds.slice().reverse().map(r => `<div class="book" style="margin-bottom:12px"><div class="book__h"><strong>Round ${r.round}</strong><span>${{ ready: '<span class="pill pill--sun">With the customer</span>', changes_requested: '<span class="pill pill--coral">Changes requested</span>', approved: '<span class="pill pill--leaf">Approved</span>' }[r.status]}</span></div>
          <p class="small muted">Sent ${fmtDT(r.sentAt)}${r.decidedAt ? ' · answered ' + fmtDT(r.decidedAt) : ''}${!r.pages.length ? ' · shared outside the site' : ''}</p>
          ${r.pages.length ? `<div class="pages">${r.pages.map((u, i) => `<button type="button" class="thumb" data-lb="${esc(u)}" data-cap="Round ${r.round} · page ${i + 1}"><img src="${esc(u)}" alt="Page ${i + 1}" loading="lazy"><span class="thumb__n">${i + 1}</span></button>`).join('')}</div>` : ''}
          ${r.notes.length ? `<div class="lbl">Customer’s notes</div><div class="stack" style="gap:6px">${r.notes.map(n => `<div class="note"><strong>${esc(n.page)}:</strong> ${esc(n.text)}${n.sent ? '' : ' <span class="pill pill--plain">draft</span>'}</div>`).join('')}</div>` : ''}</div>`).join('') : '<p class="muted">No proof sent yet.</p>'}
        ${b.stage >= 1 && b.stage <= 2 && !waiting ? `<div class="drop" data-proofdrop style="margin-top:12px"><strong>Send ${d.rounds.length ? 'the revised' : 'the'} proof</strong><span>Choose the page images (JPG, PNG or WebP). They’re shown in file-name order — name them 01, 02, 03…</span>
          <label class="btn btn--sm">Choose page images<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-proofinput></label>
          <p class="small" data-proofsel></p><label class="check" data-proofnotify hidden><input type="checkbox" checked> Tell the customer the proof is ready</label><button class="btn btn--sun" data-proofsend hidden>Send proof to the customer</button><div class="bar" data-proofbar hidden style="width:100%"><span></span></div></div>` : ''}
        ${b.stage < 1 ? '<p class="small muted">The proof can be sent once the book is at “Writing” or “Design”.</p>' : ''}
      </section>`;

    const after = reload;
    $$('[data-next]', m).forEach(x => x.addEventListener('click', () => {
      const to = Number(x.dataset.next);
      dialog({ title: `Move to “${STAGES[to]}”`, submit: 'Update stage', body: `${field('nx-note', 'Note (optional)', `<input id="nx-note" name="note" placeholder="${to === 1 ? 'e.g. Stories received on WhatsApp' : ''}">`)}<label class="check"><input type="checkbox" name="notify" checked> Tell the customer</label>`,
        onSubmit: async (f, v) => { await post(`/books/${b.id}/stage`, { stage: to, note: v.note.trim() || undefined, notify: f.notify.checked }); toast(`Moved to “${STAGES[to]}”.`); after(); } });
    }));
    $$('[data-setstage]', m).forEach(x => x.addEventListener('click', () => stageDlg(b, after)));
    $$('[data-decision]', m).forEach(x => x.addEventListener('click', () => decisionDlg(b, last, after)));
    $$('[data-jump]', m).forEach(x => x.addEventListener('click', e => { e.preventDefault(); $('#' + x.dataset.jump).scrollIntoView({ behavior: 'smooth' }); }));
    const rd = $('[data-read]', m); rd && rd.addEventListener('click', async () => { try { await post(`/books/${b.id}/read`); toast('Reading photos — refresh in a minute.'); after(); } catch (e) { toast(e.message, true); } });
    $$('[data-delphoto]', m).forEach(x => x.addEventListener('click', () => confirmDlg(`Remove photo ${x.dataset.n}?`, 'It’s deleted from storage and from the customer’s account, along with its question.', 'Remove photo', async () => { await del(`/photos/${x.dataset.delphoto}`); toast('Photo removed.'); after(); }, true)));

    // photos on behalf of the customer
    const addIn = $('[data-addphotos]', m);
    addIn.addEventListener('change', async () => {
      const files = Array.from(addIn.files); addIn.value = ''; if (!files.length) return;
      const bar = $('[data-up-bar]', m), msg = $('[data-up-msg]', m); bar.hidden = false; let done = 0;
      const type = f => f.type || ({ heic: 'image/heic', heif: 'image/heif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[(f.name.split('.').pop() || '').toLowerCase()] || '');
      try {
        for (let i = 0; i < files.length; i += 20) {
          const chunk = files.slice(i, i + 20);
          const r = await post(`/books/${b.id}/photos/uploads`, { files: chunk.map(f => ({ name: f.name.slice(0, 200), type: type(f), size: f.size, takenOn: new Date(f.lastModified || Date.now()).toISOString().slice(0, 10) })) });
          const ok = [];
          await Promise.all(r.uploads.map(async (u, k) => { try { await upload(u.upload, chunk[k]); ok.push(u.id); } catch (e) {} done++; $('span', bar).style.width = (done / files.length * 100) + '%'; msg.textContent = `Uploading ${done} of ${files.length}…`; }));
          if (ok.length) await post(`/books/${b.id}/photos/complete`, { ids: ok });
        }
        toast(`${done} photo${done === 1 ? '' : 's'} added.`); after();
      } catch (e) { msg.textContent = e.message; toast(e.message, true); }
    });

    // answers / letter received outside the site
    $$('[data-qa-open]', m).forEach(x => x.addEventListener('click', () => { $(`[data-qa="${x.dataset.qaOpen}"]`, m).hidden = false; x.hidden = true; }));
    $$('[data-qa]', m).forEach(box => {
      $('[data-qa-cancel]', box).addEventListener('click', () => { box.hidden = true; $(`[data-qa-open="${box.dataset.qa}"]`, m).hidden = false; });
      $('[data-qa-save]', box).addEventListener('click', async () => {
        const pick = $('[name=pick]', box).value;
        try { await patch(`/cards/${box.dataset.qa}`, { pick: pick === '' ? null : Number(pick), text: $('[name=text]', box).value }); toast('Answer saved — the customer sees it too.'); after(); } catch (e) { toast(e.message, true); }
      });
    });
    $('[data-letter-save]', m).addEventListener('click', async () => { try { await patch(`/books/${b.id}`, { letter: $('[data-letter]', m).value }); toast('Letter saved.'); } catch (e) { toast(e.message, true); } });

    // proof upload
    const pin = $('[data-proofinput]', m);
    if (pin) {
      let files = [];
      const sel = $('[data-proofsel]', m), send = $('[data-proofsend]', m), nt = $('[data-proofnotify]', m), bar = $('[data-proofbar]', m);
      const pick = list => {
        files = Array.from(list).filter(f => /^image\/(jpeg|png|webp)$/.test(f.type)).sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
        sel.textContent = files.length ? `${files.length} page${files.length === 1 ? '' : 's'}: ${files.slice(0, 3).map(f => f.name).join(', ')}${files.length > 3 ? ' … ' + files[files.length - 1].name : ''}` : 'No JPG, PNG or WebP images selected.';
        send.hidden = nt.hidden = !files.length;
      };
      pin.addEventListener('change', () => pick(pin.files));
      const drop = $('[data-proofdrop]', m);
      ['dragover', 'dragenter'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('is-over')));
      drop.addEventListener('drop', e => { e.preventDefault(); pick(e.dataTransfer.files); });
      send.addEventListener('click', async () => {
        send.disabled = true; bar.hidden = false; let done = 0;
        try {
          const r = await post(`/books/${b.id}/proof/uploads`, { files: files.map(f => ({ type: f.type, size: f.size })) });
          await Promise.all(r.uploads.map(async (u, i) => { await upload(u.upload, files[i]); done++; $('span', bar).style.width = (done / files.length * 100) + '%'; }));
          const s = await post(`/books/${b.id}/proof`, { keys: r.uploads.map(u => u.key), notify: $('input', nt).checked });
          toast(`Proof round ${s.round} sent — it’s on the customer’s proof page now.`); after();
        } catch (e) { send.disabled = false; toast(e.message, true); }
      });
    }
  }
  function decisionDlg(b, round, after) {
    const form = dialog({ title: `Customer’s decision — ${b.child}’s proof`, submit: 'Record decision', body: `
      <p class="hint">Use this when the customer answered outside the website (WhatsApp, a call). If they use the proof page, their answer shows up here on its own.${round ? ` Current: round ${round.round}.` : ''}</p>
      <label class="check"><input type="radio" name="decision" value="approved" checked> Approved — send to print</label>
      <label class="check"><input type="radio" name="decision" value="changes"> Asked for changes</label>
      <div class="f" data-chg hidden><label for="dc-notes">The changes they asked for</label><textarea id="dc-notes" name="notes" rows="4" placeholder="Page 3: spell Paati with two a’s…"></textarea></div>
      ${field('dc-note', 'Note', '<input id="dc-note" name="note" placeholder="e.g. Approved on WhatsApp, 5 Oct">')}
      <label class="check"><input type="checkbox" name="notify" checked> Tell the customer (approved → “Printing” update)</label>`,
      onSubmit: async (f, v) => { await post(`/books/${b.id}/proof/decision`, { decision: v.decision, notes: (v.notes || '').trim() || undefined, note: v.note.trim() || undefined, notify: f.notify.checked }); toast('Decision recorded.'); after(); } });
    $$('[name=decision]', form).forEach(r => r.addEventListener('change', () => { $('[data-chg]', form).hidden = form.decision.value !== 'changes'; }));
  }

  /* ================= PAYMENTS ================= */
  function presetRange(k) {
    const d = new Date(), iso = x => { const y = new Date(x); y.setMinutes(y.getMinutes() - y.getTimezoneOffset()); return y.toISOString().slice(0, 10); };
    if (k === 'month') return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)];
    if (k === 'last') return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))];
    if (k === '30') return [iso(new Date(d - 29 * 864e5)), iso(d)];
    if (k === 'fy') { const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return [iso(new Date(y, 3, 1)), iso(d)]; }
    return ['', ''];
  }
  async function viewPayments(p) {
    const m = shell('payments'); if (!META) await refreshMeta();
    let preset = p.get('range') || (p.get('from') || p.get('to') ? 'custom' : 'month');
    let [from, to] = preset === 'custom' ? [p.get('from') || '', p.get('to') || ''] : presetRange(preset);
    const f = { from, to, edition: p.get('edition') || '', state: p.get('state') || '', method: p.get('method') || '', kind: p.get('kind') || '' };
    const d = await get('/payments' + qs(f));
    const T = d.totals;
    const maxOf = arr => Math.max(1, ...arr.map(x => Math.abs(x.amount)));
    const breakdown = (title, rows, label) => `<div class="brk"><div class="lbl">${title}</div>${rows.length ? rows.map(r => `<div class="brk__row"><span>${esc(label(r))} <span class="muted small">· ${r.count}</span></span><strong class="num">${inr(r.amount)}</strong><div class="bar"><span style="width:${Math.max(2, r.amount / maxOf(rows) * 100)}%"></span></div></div>`).join('') : '<p class="muted small">No data</p>'}</div>`;
    m.innerHTML = `
      <div class="top"><div><h1>Payments</h1><p>${from || to ? `${fmtD(from) !== '—' ? fmtD(from) : 'Start'} – ${fmtD(to) !== '—' ? fmtD(to) : 'today'}` : 'All time'} · India time</p></div>
        <div class="btns"><a class="btn btn--ghost" href="${BASE}/api/admin/payments.csv${qs(f)}">Export CSV</a></div></div>
      <section class="card"><form class="filters" data-pf>
        ${field('pr', 'Period', `<select id="pr" name="range">${opts({ month: 'This month', last: 'Last month', '30': 'Last 30 days', fy: 'This financial year', all: 'All time', custom: 'Custom dates' }, preset)}</select>`)}
        ${field('pfrom', 'From', `<input id="pfrom" name="from" type="date" value="${esc(from)}">`)}${field('pto', 'To', `<input id="pto" name="to" type="date" value="${esc(to)}">`)}
        ${field('ped', 'Edition', `<select id="ped" name="edition">${opts(ED, f.edition, 'All')}</select>`)}
        ${field('pst', 'State', `<select id="pst" name="state">${stateOpts(f.state, 'All')}</select>`)}
        ${field('pme', 'Method', `<select id="pme" name="method">${opts(METHODS, f.method, 'All')}</select>`)}
        ${field('pki', 'Type', `<select id="pki" name="kind">${opts({ payment: 'Payments', refund: 'Refunds' }, f.kind, 'Both')}</select>`)}
        <div class="btns"><button class="btn" type="submit">Apply</button><a class="btn btn--ghost" href="#/payments">Reset</a></div></form></section>
      <div class="money">
        <div class="tile"><span class="tile__l">Net received</span><span class="tile__n">${inr(T.net)}</span></div>
        <div class="tile"><span class="tile__l">Payments · ${T.count}</span><span class="tile__n">${inr(T.gross)}</span></div>
        <div class="tile"><span class="tile__l">Refunds</span><span class="tile__n">${inr(T.refunds)}</span></div>
        <div class="tile"><span class="tile__l">GST collected (in payments)</span><span class="tile__n">${inr(T.gst)}</span></div>
      </div>
      <section class="card"><div class="card__h"><h2>${chartTitle(d.byDay, from, to)}</h2></div>${dayChart(d.byDay, from, to)}</section>
      <section class="card"><div class="breaks">
        ${breakdown('By edition', d.byEdition, r => r.name)}${breakdown('By state', d.byState, r => r.key)}${breakdown('By method', d.byMethod, r => METHODS[r.key] || r.key)}
      </div><p class="small muted" style="margin-top:12px">Edition totals split each order’s payment by its books’ list prices.</p></section>
      <section class="card"><div class="card__h"><h2>Transactions · ${d.payments.length}</h2></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Edition</th><th>State</th><th>Method</th><th>Reference</th><th class="n">Amount</th></tr></thead><tbody>
        ${d.payments.map(x => `<tr data-href="#/order/${esc(x.order)}"><td>${fmtDT(x.at)}</td><td><a href="#/order/${esc(x.order)}"><strong>${esc(x.order)}</strong></a></td><td>${esc(x.customer)}</td><td>${x.editions.map(e => esc(ED[e] || e)).join(', ')}</td><td>${esc(x.state)}<span class="sub">${esc(x.city)}</span></td>
          <td>${x.kind === 'refund' ? '<span class="pill pill--coral">Refund</span> ' : ''}${esc(METHODS[x.method] || x.method || x.provider)}<span class="sub">${esc(x.provider)}</span></td><td>${esc(x.ref || '—')}</td><td class="n">${x.kind === 'refund' ? '−' : ''}${inr(x.amount)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No payments in this period.</td></tr>'}
        </tbody></table></div></section>`;
    const pf = $('[data-pf]', m);
    pf.range.addEventListener('change', () => { const [a, b2] = presetRange(pf.range.value); if (pf.range.value !== 'custom') { pf.from.value = a; pf.to.value = b2; } });
    ['from', 'to'].forEach(k => pf[k].addEventListener('change', () => { pf.range.value = 'custom'; }));
    pf.addEventListener('submit', e => { e.preventDefault(); const v = Object.fromEntries(new FormData(pf)); const keep = v.range === 'custom' ? { from: v.from, to: v.to } : {}; go('#/payments' + qs({ range: v.range === 'month' ? '' : v.range, ...keep, edition: v.edition, state: v.state, method: v.method, kind: v.kind })); });
  }
  // Fill every day of the period (or every month when it's longer than ~3 months).
  function series(rows, from, to) {
    if (!rows.length) return { monthly: false, rows: [] };
    const start = from || rows[0].key, end = to || rows[rows.length - 1].key;
    const days = (new Date(end) - new Date(start)) / 864e5 + 1, monthly = days > 92;
    const map = new Map();
    rows.forEach(r => { const k = monthly ? r.key.slice(0, 7) : r.key; const v = map.get(k) || { amount: 0, count: 0 }; v.amount += r.amount; v.count += r.count; map.set(k, v); });
    const out = [], cur = new Date(start + 'T12:00:00'), stop = new Date(end + 'T12:00:00');
    if (monthly) cur.setDate(1);
    while (cur <= stop && out.length < 400) {
      const k = monthly ? cur.toISOString().slice(0, 7) : cur.toISOString().slice(0, 10);
      out.push({ key: k, ...(map.get(k) || { amount: 0, count: 0 }) });
      monthly ? cur.setMonth(cur.getMonth() + 1) : cur.setDate(cur.getDate() + 1);
    }
    return { monthly, rows: out };
  }
  const chartTitle = (rows, from, to) => series(rows, from, to).monthly ? 'By month' : 'By day';
  function dayChart(raw, from, to) {
    const { monthly, rows } = series(raw, from, to);
    if (!rows.length) return '<p class="muted">No payments in this period.</p>';
    const W = 900, H = 220, pad = { l: 64, r: 10, t: 12, b: 28 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const max = Math.max(...rows.map(r => r.amount), 1), nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / p) * p; })();
    const slot = iw / rows.length, bw = Math.min(36, slot * .7), y = v => pad.t + ih - (Math.max(0, v) / nice) * ih;
    const ticks = [0, .5, 1].map(f => nice * f), every = Math.ceil(rows.length / 10);
    const lbl = k => monthly ? new Date(k + '-01T12:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : new Date(k + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `<div style="overflow-x:auto"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Payments received per ${monthly ? 'month' : 'day'}">
      ${ticks.map(t => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="#e7dccf"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${inr(t)}</text>`).join('')}
      ${rows.map((r, i) => `${r.amount > 0 ? `<rect class="bar-r" x="${pad.l + i * slot + (slot - bw) / 2}" width="${bw}" y="${y(r.amount)}" height="${Math.max(1, pad.t + ih - y(r.amount))}" rx="2"><title>${lbl(r.key)}: ${inr(r.amount)} (${r.count} payment${r.count === 1 ? '' : 's'})</title></rect>` : ''}${i % every === 0 ? `<text x="${pad.l + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">${lbl(r.key)}</text>` : ''}`).join('')}
    </svg></div>`;
  }

  /* ================= NEW ORDER ================= */
  async function viewNew() {
    const m = shell('new'); if (!META) await refreshMeta();
    const price = k => (META.editions.find(e => e.key === k) || {}).price || 0;
    const bookRow = i => `<div class="book" data-bookrow>${i ? `<div class="book__h"><strong>Book ${i + 1}</strong><button type="button" class="link" data-rmbook>Remove</button></div>` : ''}<div class="form__row">${field(`nb-ed-${i}`, 'Edition', `<select id="nb-ed-${i}" name="edition">${META.editions.map(e => `<option value="${e.key}">${esc(e.name)} — ${inr(e.price)}</option>`).join('')}</select>`)}${field(`nb-child-${i}`, 'Child’s name', `<input id="nb-child-${i}" name="child">`)}</div></div>`;
    m.innerHTML = `
      <div class="top"><div><h1>New order</h1><p>For orders that came in on WhatsApp, a call or in person. The customer gets an account and sees everything on the website.</p></div></div>
      <form class="grid2" data-new novalidate>
        <div class="stack">
          <section class="card"><div class="card__h"><h2>Customer</h2></div><div class="form">
            <div class="form__row">${field('nc-name', 'Name', '<input id="nc-name" name="name" autocomplete="off">')}${field('nc-phone', 'Phone (WhatsApp)', '<input id="nc-phone" name="phone" inputmode="tel">')}</div>
            ${field('nc-email', 'Email', '<input id="nc-email" name="email" type="email">')}
            <p class="small muted">If no account uses this email or phone, one is created and they’re emailed a link to choose a password.</p></div></section>
          <section class="card"><div class="card__h"><h2>Storybooks</h2><button type="button" class="link" data-addbook>+ Add another book</button></div><div class="form" data-books>${bookRow(0)}</div>
            ${field('nc-gift', 'Gift note', '<input id="nc-gift" name="gift" placeholder="Optional">')}</section>
          <section class="card"><div class="card__h"><h2>Delivery address</h2></div><div class="form">
            <div class="form__row">${field('na-to', 'Recipient', '<input id="na-to" name="to">')}${field('na-phone', 'Phone at address', '<input id="na-phone" name="aphone" placeholder="Optional">')}</div>
            ${field('na-line1', 'House & street', '<input id="na-line1" name="line1">')}${field('na-line2', 'Area / landmark', '<input id="na-line2" name="line2">')}
            <div class="form__row">${field('na-city', 'City', '<input id="na-city" name="city">')}${field('na-state', 'State', `<select id="na-state" name="state">${stateOpts('Tamil Nadu')}</select>`)}${field('na-pin', 'PIN', '<input id="na-pin" name="pin" inputmode="numeric">')}</div></div></section>
        </div>
        <div class="stack">
          <section class="card"><div class="card__h"><h2>Payment</h2></div><div class="form">
            <dl class="dl" data-sum></dl>
            <label class="check"><input type="radio" name="pay" value="unpaid" checked> Not paid yet — I’ll record it later</label>
            ${isAdmin() ? '<label class="check"><input type="radio" name="pay" value="paid"> Already paid</label>' : ''}
            <div class="form" data-paid hidden>
              <div class="form__row">${field('np-method', 'Paid by', `<select id="np-method" name="method">${opts({ upi: 'UPI', bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', other: 'Other' }, 'upi')}</select>`)}${field('np-date', 'Paid on', `<input id="np-date" name="paidOn" type="date" value="${todayISO()}" max="${todayISO()}">`)}</div>
              ${field('np-ref', 'Reference / UTR', '<input id="np-ref" name="ref">')}
            </div>
            <label class="check"><input type="checkbox" name="notify" checked> Email the customer</label>
            <p class="err" data-err role="alert"></p>
            <button class="btn btn--sun" type="submit">Create order</button></div></section>
        </div>
      </form>`;
    const form = $('[data-new]', m); let n = 1;
    const sum = () => {
      const subtotal = $$('[data-bookrow] [name=edition]', form).reduce((t, x) => t + price(x.value), 0);
      // GST shown as an estimate; the server works out the exact figure
      $('[data-sum]', form).innerHTML = `<dt>Books</dt><dd>${inr(subtotal)}</dd><dt>Total incl. GST</dt><dd><strong data-total>…</strong></dd>`;
      get('/auth/me').then(r => { const c = r.company; const t = c.pricesIncludeGst ? subtotal : subtotal * (1 + c.gstRate / 100); const el = $('[data-total]', form); if (el) el.textContent = inr(Math.round(t * 100) / 100) + (c.pricesIncludeGst ? '' : ` (${c.gstRate}% GST)`); }).catch(() => {});
    };
    sum();
    form.addEventListener('click', e => { const rb = e.target.closest('[data-rmbook]'); if (rb) { rb.closest('[data-bookrow]').remove(); sum(); } });
    form.addEventListener('change', e => { if (e.target.closest('[data-bookrow]')) sum(); if (e.target.name === 'pay') $('[data-paid]', form).hidden = form.pay.value !== 'paid'; });
    $('[data-addbook]', m).addEventListener('click', () => { if (n >= 6) return; $('[data-books]', form).insertAdjacentHTML('beforeend', bookRow(n++)); sum(); });
    $('#nc-name', form).addEventListener('change', e => { if (!form.to.value) form.to.value = e.target.value; });
    form.addEventListener('submit', async e => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(form)), err = $('[data-err]', form); err.textContent = '';
      const items = $$('[data-bookrow]', form).map(r => ({ edition: $('[name=edition]', r).value, childName: $('[name=child]', r).value.trim()}));
      const body = {
        customer: { name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim() }, items, giftNote: v.gift.trim() || undefined,
        address: { to: v.to.trim() || v.name.trim(), line1: v.line1, line2: v.line2, city: v.city, state: v.state, pin: v.pin, phone: v.aphone.trim() || undefined },
        payment: v.pay === 'paid' ? { status: 'paid', method: v.method, ref: v.ref.trim() || undefined, paidOn: v.paidOn || undefined } : { status: 'unpaid' }, notify: form.notify.checked,
      };
      const btn = $('[type=submit]', form); btn.disabled = true;
      try { const r = await post('/orders', body); toast(`Order ${r.number} created${r.accountCreated ? ' — the customer was emailed a link to set their password' : ''}.`); go('#/order/' + r.number); }
      catch (er) {
        btn.disabled = false; err.textContent = er.message;
        const map = { 'customer.name': 'nc-name', 'customer.email': 'nc-email', 'customer.phone': 'nc-phone', 'address.to': 'na-to', 'address.line1': 'na-line1', 'address.city': 'na-city', 'address.pin': 'na-pin', 'address.state': 'na-state' };
        $$('.f__err', form).forEach(x => { x.textContent = ''; });
        if (er.fields) Object.entries(er.fields).forEach(([k, msg]) => { const mm = k.match(/^items\.(\d+)\.childName$/); const id = mm ? `nb-child-${mm[1]}` : map[k]; const el = id && $('#' + id + '-err', form); if (el) el.textContent = msg; });
      }
    });
  }

  /* ================= CUSTOMERS ================= */
  async function viewCustomers(p) {
    const m = shell('customers'); const term = p.get('q') || '';
    const d = await get('/customers' + qs({ q: term }));
    m.innerHTML = `<div class="top"><div><h1>Customers</h1><p>${d.customers.length}${d.customers.length === 100 ? '+' : ''} shown</p></div></div>
      <section class="card"><form class="filters" data-cf>${field('cq', 'Search', `<input id="cq" name="q" type="search" value="${esc(term)}" placeholder="Name, email or phone">`, 'f--grow')}<div class="btns"><button class="btn" type="submit">Search</button></div></form></section>
      <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Contact</th><th>Joined</th><th class="n">Orders</th><th class="n">Paid</th></tr></thead><tbody>
      ${d.customers.map(c => `<tr data-href="#/orders${qs({ q: c.email || c.phone })}"><td><strong>${esc(c.name)}</strong>${c.status !== 'active' ? ` <span class="pill pill--plain">${esc(c.status)}</span>` : ''}</td><td>${esc(c.email)}<span class="sub">${esc(c.phone || '')}${waLink(c.phone) ? ` · <a class="link" href="${waLink(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</span></td><td>${fmtD(c.created_at)}</td><td class="n">${c.orders}</td><td class="n">${inr(c.spent)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No customers found.</td></tr>'}
      </tbody></table></div></section>`;
    $('[data-cf]', m).addEventListener('submit', e => { e.preventDefault(); go('#/customers' + qs({ q: e.target.q.value.trim() })); });
  }

  /* ---------------- start ---------------- */
  async function boot() {
    if (!ME) {
      try { ME = (await get('/auth/me')).user; } catch (e) { renderLogin(e.status === 0 ? e.message : ''); return; }
    }
    app.innerHTML = ''; route();
  }
  boot();
})();
