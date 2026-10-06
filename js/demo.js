/* Thulori admin — preview mode. A stand-in for the Thulori API that runs in the browser with
   sample orders, so the panel can be tried without a server. Loaded only by the preview page;
   the real panel (index.html) never loads this file. Nothing here is saved anywhere. */
window.ThuloriDemo = (() => {
  'use strict';
  const DAY = 864e5, NOW = Date.now();
  const ago = (d, h = 11) => { const t = new Date(NOW - d * DAY); t.setHours(h, (d * 7) % 60, 0, 0); return t.toISOString(); };
  const dayOf = iso => iso.slice(0, 10);
  const uid = () => 'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const r2 = n => Math.round(n * 100) / 100;
  const GST = 18, CO_STATE = 'Tamil Nadu';
  const ED = { vidhai: { name: 'Vidhai', price: 3999, photos: 40, rounds: 1 }, thulir: { name: 'Thulir', price: 6999, photos: 100, rounds: 2 }, malar: { name: 'Malar', price: 9999, photos: 150, rounds: 3 } };
  const STAGES = ['Photos & stories', 'Writing', 'Design', 'Proof with customer', 'Printing', 'Shipped', 'Delivered'];
  const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];
  const ME = { id: 'u-owner', name: 'Praveen', email: 'owner@thulori.com', role: 'admin' };
  const PHOTO = n => `assets/demo/a${String(n).padStart(2, '0')}.webp`;
  const PAGES = ['cover', 'p01', 'p02', 'p03', 'p04', 'p05', 'p06'].map(p => `assets/book/${p}.webp`);
  const blobs = new Map();
  let signedIn = false;
  const db = { users: [], orders: [], books: [], photos: [], cards: [], rounds: [], notes: [], payments: [], refunds: [], issues: [], invoices: [], msgs: [], activity: [] };
  let seq = 24817, invN = 0;
  const err = (status, message, code, fields) => Object.assign(new Error(message), { status, code, fields });
  const amounts = sub => { const tax = Math.round(sub * GST) / 100; return { subtotal: sub, tax, total: r2(sub + tax) }; };

  /* ---------------- sample data ---------------- */
  const SCENES = ['A newborn asleep in someone’s arms, in a cream swaddle', 'Lying on a quilt in a lilac dress, holding her toes', 'Asleep on a parent’s chest in a floral swaddle', 'A big gummy smile on the rug', 'Sitting by a cake with a big “1” on it', 'Wobbly first steps towards outstretched hands', 'Cake smash — hands in the icing', 'Walking across the room, bunny on the sofa', 'Splashing in a puddle in a yellow raincoat', 'Stacking wooden blocks in pink dungarees', 'Turning the pages of a picture book', 'Blowing bubbles in the garden', 'Painting flowers with watercolours', 'A tea party for the grey bunny', 'Holding up a flower painting', 'A paper crown and a hug for the bunny'];
  const QS = [['Who is holding {c} here?', ['Amma, on our very first night home', 'Paati — the first to get {c} to sleep', 'Appa, too scared to move']], ['What made {c} laugh like this?', ['Akka pulling silly faces', 'Appa blowing raspberries', 'Just discovering those feet!']], ['Is this one of {c}’s very first days?', ['Day two — still in the hospital', 'The first afternoon at home', 'Coming home from the naming ceremony']], ['When did {c} start smiling at everyone?', ['Around three months', 'Only for Amma at first', 'The day Thatha sang']], ['What was {c}’s first birthday like?', ['A small party with the grandparents', 'A big celebration', 'Just us and a lot of mess']], ['Do you remember {c}’s first steps?', ['Three steps straight to Appa!', 'At Paati’s house', 'Akka saw it first']]];
  function addUser(name, email, phone, days, hasPassword = true) {
    const u = { id: uid(), name, email, phone, status: 'active', role: 'customer', createdAt: ago(days, 9), hasPassword, wa: true }; db.users.push(u); return u;
  }
  function addOrder(o) {
    const sub = o.items.reduce((t, i) => t + ED[i.edition].price, 0), a = amounts(sub);
    const ord = { id: uid(), number: 'TH-' + seq++, userId: o.user.id, status: 'pending_payment', source: o.source || 'web', createdAt: o.at, paidAt: null, subtotal: a.subtotal, tax: a.tax, gstRate: GST, total: a.total, refunded: 0,
      giftNote: o.gift || null, address: { to: o.user.name, line1: o.line1, line2: '', city: o.city, state: o.state, pin: o.pin, phone: o.user.phone }, contact: { name: o.user.name, email: o.user.email, phone: o.user.phone },
      provider: o.source === 'admin' ? 'manual' : 'cashfree', providerOrderId: null, shipping: null, cancelledAt: null, cancelReason: null };
    ord.providerOrderId = ord.provider === 'cashfree' ? ord.number : null;
    db.orders.push(ord);
    ord.items = o.items.map(i => { const b = { id: uid(), orderId: ord.id, child: i.child, edition: i.edition, stage: 0, dates: {}, log: [], letter: '', submittedAt: null, read: 'idle' }; db.books.push(b); return { edition: i.edition, child: i.child, price: ED[i.edition].price, book: b.id }; });
    log(o.source === 'admin' ? 'admin_order_created' : 'order_created', { number: ord.number }, o.source === 'admin' ? ME.name : o.user.name, o.at);
    return ord;
  }
  function pay(ord, at, method, ref, by) {
    ord.status = 'paid'; ord.paidAt = at;
    db.payments.push({ id: uid(), orderId: ord.id, kind: 'payment', provider: by ? 'manual' : 'cashfree', method, amount: ord.total, ref, note: null, by: by || null, at });
    booksOf(ord).forEach(b => { b.dates[0] = dayOf(at); });
    log('order_paid', { number: ord.number, provider: by ? 'manual' : 'cashfree', ref }, by || 'Cashfree', at);
    msg(ord, 'order_paid', at);
  }
  function seedPhotos(b, nums, cardsAnswered, at) {
    nums.forEach((n, i) => db.photos.push({ id: uid(), bookId: b.id, n: i + 1, name: `IMG_${2400 + n}.jpg`, src: PHOTO(n), scene: SCENES[(n - 1) % SCENES.length], fav: i === 2, takenOn: dayOf(ago(400 - n * 20)), read: true }));
    photosOf(b).forEach((p, i) => { const [q, op] = QS[i % QS.length]; db.cards.push({ id: uid(), bookId: b.id, kind: 'photo', photos: [p.id], topic: '', obs: p.scene + '.', q: q.replace(/\{c\}/g, b.child), options: op.map(x => x.replace(/\{c\}/g, b.child)), pick: i < cardsAnswered ? i % 3 : null, text: i < cardsAnswered && i % 2 === 0 ? `This was the week ${b.child} discovered how to make everyone laugh.` : '', source: 'ai' }); });
    if (nums.length >= 4) db.cards.push({ id: uid(), bookId: b.id, kind: 'theme', photos: photosOf(b).slice(0, 4).map(p => p.id), topic: 'The grey bunny', obs: `I noticed the same grey bunny with ${b.child} in 4 photos.`, q: `Is the bunny ${b.child}’s favourite? Is there a story behind it?`, options: ['A gift from Paati — a bed buddy ever since', 'It goes everywhere with us', `${b.child} named it and talks to it every night`], pick: cardsAnswered ? 0 : null, text: cardsAnswered ? 'Paati brought it from Madurai the day we came home.' : '', source: 'ai' });
    b.read = 'done';
  }
  function moveTo(b, to, at, by, note, manual = false) { b.log.push({ from: b.stage, to, by: by || 'Customer', at, note: note || null, manual }); b.stage = to; b.dates[to] = dayOf(at); if (to >= 1 && !b.submittedAt) b.submittedAt = at; }
  function round(b, at, status, pages = PAGES, notes = []) { const r = { id: uid(), bookId: b.id, round: db.rounds.filter(x => x.bookId === b.id).length + 1, status, sentAt: at, decidedAt: status === 'ready' ? null : at, pages, notes }; db.rounds.push(r); return r; }
  function msg(ord, template, at, channel) {
    const u = userOf(ord); (channel ? [channel] : ['email', 'whatsapp']).forEach(ch => db.msgs.push({ orderId: ord.id, template, channel: ch, to: ch === 'email' ? u.email : u.phone, status: 'sent', error: null, at: at || new Date().toISOString() }));
  }
  function log(action, meta, who, at) { db.activity.push({ action, meta, who: who || ME.name, role: who === ME.name ? 'admin' : 'customer', at: at || new Date().toISOString() }); }

  function seed() {
    const U = [
      addUser('Priya Raman', 'priya.raman@example.com', '9840011223', 40), addUser('Karthik Subramanian', 'karthik.s@example.com', '9884455667', 33),
      addUser('Meena Iyer', 'meena.iyer@example.com', '9902233445', 28), addUser('Ananya Reddy', 'ananya.r@example.com', '9849912345', 25),
      addUser('Divya Menon', 'divya.menon@example.com', '9847023456', 19), addUser('Sneha Kulkarni', 'sneha.k@example.com', '9822098765', 14),
      addUser('Lakshmi Narayanan', 'lakshmi.n@example.com', '9789012345', 9, false), addUser('Farhana Begum', 'farhana.b@example.com', '9830076543', 6),
      addUser('Rohit Sharma', 'rohit.sh@example.com', '9810054321', 3), addUser('Aishwarya Pillai', 'aish.pillai@example.com', '9895012678', 1),
    ];
    // 1 delivered
    let o = addOrder({ user: U[0], items: [{ edition: 'thulir', child: 'Aara' }], line1: '12 Lake Road, T. Nagar', city: 'Chennai', state: 'Tamil Nadu', pin: '600017', at: ago(38) });
    pay(o, ago(38, 12), 'upi', 'cf_99120034'); let b = booksOf(o)[0]; seedPhotos(b, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10); moveTo(b, 1, ago(34));
    moveTo(b, 2, ago(29), 'Writer'); round(b, ago(24), 'approved'); moveTo(b, 3, ago(24), ME.name); moveTo(b, 4, ago(22)); moveTo(b, 5, ago(18), ME.name, 'Blue Dart 81234567'); moveTo(b, 6, ago(15), ME.name);
    o.shipping = { courier: 'Blue Dart', awb: '81234567', at: ago(18), deliveredAt: ago(15) }; log('admin_ship', { number: o.number, courier: 'Blue Dart', awb: '81234567' }, ME.name, ago(18)); log('admin_deliver', { number: o.number }, ME.name, ago(15));
    issueInvoice(o, null, ago(18));
    // 2 approved → to print
    o = addOrder({ user: U[1], items: [{ edition: 'malar', child: 'Ilan' }], line1: '44 Indiranagar 2nd Stage', city: 'Bengaluru', state: 'Karnataka', pin: '560038', at: ago(31) });
    pay(o, ago(31, 13), 'card', 'cf_99120761'); b = booksOf(o)[0]; seedPhotos(b, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 8); moveTo(b, 1, ago(27)); moveTo(b, 2, ago(21), 'Writer');
    round(b, ago(14), 'changes_requested', PAGES, [{ page: 'Page 3', at: 3, text: 'Please spell Paati with two a’s', sent: true }]); moveTo(b, 3, ago(14), ME.name); moveTo(b, 2, ago(12));
    round(b, ago(8), 'approved'); moveTo(b, 3, ago(8), ME.name); moveTo(b, 4, ago(6)); log('proof_approved', { book: b.id, round: 2 }, U[1].name, ago(6));
    // 3 proof with customer
    o = addOrder({ user: U[2], items: [{ edition: 'thulir', child: 'Ishaan' }], line1: '22 MG Road', city: 'Bengaluru', state: 'Karnataka', pin: '560001', at: ago(27) });
    pay(o, ago(27, 15), 'upi', 'cf_99121102'); b = booksOf(o)[0]; seedPhotos(b, [1, 3, 5, 7, 9, 11, 13, 15, 2, 4], 9); moveTo(b, 1, ago(23)); moveTo(b, 2, ago(17), 'Writer');
    round(b, ago(3), 'ready', PAGES, [{ page: 'the cover', at: 0, text: 'Can the title be a little bigger?', sent: false }]); moveTo(b, 3, ago(3), ME.name, 'Proof round 1 sent (7 pages)'); msg(o, 'proof_ready', ago(3));
    // 4 changes requested
    o = addOrder({ user: U[3], items: [{ edition: 'thulir', child: 'Saanvi' }], line1: 'Plot 18, Jubilee Hills', city: 'Hyderabad', state: 'Telangana', pin: '500033', at: ago(24) });
    pay(o, ago(24, 10), 'netbanking', 'cf_99121455'); b = booksOf(o)[0]; seedPhotos(b, [2, 4, 6, 8, 10, 12, 14, 16, 1, 3, 5], 9); moveTo(b, 1, ago(20)); moveTo(b, 2, ago(15), 'Writer');
    round(b, ago(6), 'changes_requested', PAGES, [{ page: 'Page 2', at: 2, text: 'Use the photo with Thatha instead of this one', sent: true }, { page: 'Page 5', at: 5, text: 'Her birthday is 14 June, not 4 June', sent: true }]); moveTo(b, 3, ago(6), ME.name); moveTo(b, 2, ago(4));
    log('proof_changes', { book: b.id, notes: 2 }, U[3].name, ago(4));
    // 5 ready to write (two books)
    o = addOrder({ user: U[4], items: [{ edition: 'vidhai', child: 'Nila' }, { edition: 'thulir', child: 'Aadhav' }], line1: 'TC 15/1204, Vazhuthacaud', city: 'Thiruvananthapuram', state: 'Kerala', pin: '695014', at: ago(18), gift: 'For Nila and Aadhav, with love from Ammamma' });
    pay(o, ago(18, 12), 'upi', 'cf_99122003'); booksOf(o).forEach((bb, k) => { seedPhotos(bb, k ? [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 7); moveTo(bb, 1, ago(2)); });
    // 6 waiting for photos
    o = addOrder({ user: U[5], items: [{ edition: 'malar', child: 'Advik' }], line1: 'Flat 7B, Kothrud', city: 'Pune', state: 'Maharashtra', pin: '411038', at: ago(12) });
    pay(o, ago(12, 18), 'upi', 'cf_99122250'); b = booksOf(o)[0]; seedPhotos(b, [6, 7, 8, 9], 1);
    // 7 manual WhatsApp order, paid by bank transfer
    o = addOrder({ user: U[6], items: [{ edition: 'thulir', child: 'Mithran' }], line1: '3 North Car Street', city: 'Madurai', state: 'Tamil Nadu', pin: '625001', at: ago(9), source: 'admin' });
    pay(o, ago(8, 16), 'bank_transfer', 'UTR 402918377', ME.name); db.notes.push({ id: uid(), orderId: o.id, text: 'Ordered on WhatsApp. Prefers calls after 6pm.', author: ME.name, at: ago(9, 12) });
    msg(o, 'account_created', ago(9), 'email');
    // 8 failed payment
    o = addOrder({ user: U[7], items: [{ edition: 'vidhai', child: 'Zara' }], line1: '14 Park Circus', city: 'Kolkata', state: 'West Bengal', pin: '700017', at: ago(6) }); o.status = 'failed';
    // 9 awaiting payment
    o = addOrder({ user: U[8], items: [{ edition: 'thulir', child: 'Kabir' }], line1: 'C-112 Saket', city: 'New Delhi', state: 'Delhi', pin: '110017', at: ago(2) });
    // 10 paid today
    o = addOrder({ user: U[9], items: [{ edition: 'malar', child: 'Tara' }], line1: 'Kaloor, near the stadium', city: 'Kochi', state: 'Kerala', pin: '682017', at: ago(0, 9) });
    pay(o, ago(0, 10), 'upi', 'cf_99123877');
    // …and paid a second time from another tab — the background check caught it
    const dup = { id: uid(), orderId: o.id, kind: 'payment', provider: 'cashfree', method: 'upi', amount: o.total, ref: 'cf_99123902', note: 'Second payment for an order already paid', by: null, at: ago(0, 10) };
    db.payments.push(dup);
    issue(o, 'duplicate_payment', `The customer paid ₹${o.total.toLocaleString('en-IN')} again (payment cf_99123902) for an order that was already paid. Refund the extra payment.`, { paymentId: dup.id, amount: o.total }, ago(0, 10));
    // a goodwill refund on the way back to Divya's UPI
    const o5 = db.orders.find(x => x.userId === U[4].id), p5 = db.payments.find(x => x.orderId === o5.id);
    db.refunds.push({ id: uid(), orderId: o5.id, paymentId: p5.id, provider: 'cashfree', method: null, amount: 500, status: 'pending', reason: 'Gift wrap missed the photo dates', arn: null, failure: null, lastError: null, by: ME.name, createdAt: ago(1, 15), completedAt: null });
    log('refund_started', { number: o5.number, amount: 50000, reason: 'Gift wrap missed the photo dates' }, ME.name, ago(1, 15));
  }
  function issue(o, kind, detail, x = {}, at) {
    db.issues.push({ id: uid(), orderId: o.id, kind, status: 'open', detail, amount: x.amount ?? null, paymentId: x.paymentId ?? null, refundId: x.refundId ?? null, resolution: null, resolvedBy: null, resolvedAt: null, at: at || new Date().toISOString() });
    log('issue_raised', { number: o.number, kind, detail }, 'System', at);
  }

  /* ---------------- lookups ---------------- */
  function userOf(o) { return db.users.find(u => u.id === o.userId); }
  function booksOf(o) { return db.books.filter(b => b.orderId === o.id); }
  function photosOf(b) { return db.photos.filter(p => p.bookId === b.id).sort((x, y) => x.n - y.n); }
  function cardsOf(b) { return db.cards.filter(c => c.bookId === b.id); }
  function roundsOf(b) { return db.rounds.filter(r => r.bookId === b.id).sort((x, y) => x.round - y.round); }
  const paidSoFar = o => r2(db.payments.filter(p => p.orderId === o.id).reduce((t, p) => t + (p.kind === 'payment' ? p.amount : -p.amount), 0));
  const answered = c => c.pick != null || !!c.text;
  function findOrder(id) { const o = db.orders.find(x => x.number === id || x.id === id); if (!o) throw err(404, 'No such order.'); return o; }
  function findBook(id) { const b = db.books.find(x => x.id === id); if (!b) throw err(404, 'Not found.'); return b; }
  const lastRound = b => roundsOf(b).slice(-1)[0];

  const BUCKETS = {
    attention: ['Needs attention', o => db.issues.some(i => i.orderId === o.id && i.status === 'open') || db.refunds.some(r => r.orderId === o.id && r.status === 'pending' && NOW - new Date(r.createdAt) > 3 * DAY)],
    refunding: ['Refunds in progress', o => db.refunds.some(r => r.orderId === o.id && r.status === 'pending')],
    unpaid: ['Awaiting payment', o => o.status === 'pending_payment' || o.status === 'failed'],
    awaiting_photos: ['Waiting for photos & stories', o => o.status === 'paid' && booksOf(o).some(b => b.stage === 0)],
    to_write: ['Ready to write', o => o.status === 'paid' && booksOf(o).some(b => b.stage === 1)],
    changes_requested: ['Customer asked for changes', o => o.status === 'paid' && booksOf(o).some(b => b.stage === 2 && (lastRound(b) || {}).status === 'changes_requested')],
    in_design: ['In design', o => o.status === 'paid' && booksOf(o).some(b => b.stage === 2)],
    proof_out: ['Proof with customer', o => o.status === 'paid' && booksOf(o).some(b => b.stage === 3)],
    to_print: ['Approved — to print & ship', o => o.status === 'paid' && !o.shipping && booksOf(o).every(b => b.stage >= 4)],
    shipped: ['Shipped', o => o.status === 'paid' && o.shipping && !o.shipping.deliveredAt],
    delivered: ['Delivered', o => o.shipping && o.shipping.deliveredAt],
    cancelled: ['Cancelled / refunded', o => o.status === 'cancelled' || o.status === 'refunded'],
  };

  /* ---------------- shapes (same as the API) ---------------- */
  const orderRow = o => { const u = userOf(o); return { id: o.id, number: o.number, createdAt: o.createdAt, status: o.status, source: o.source, customer: { name: u.name, email: u.email, phone: u.phone }, city: o.address.city, state: o.address.state, total: o.total, paidAt: o.paidAt, shippedAt: o.shipping && o.shipping.at, deliveredAt: o.shipping && o.shipping.deliveredAt,
    books: booksOf(o).map(b => ({ id: b.id, child: b.child, edition: b.edition, stage: b.stage, stageName: STAGES[b.stage], proofStatus: (lastRound(b) || {}).status })) }; };
  const invSummary = i => ({ id: i.id, number: i.number, date: i.date, total: i.total, paid: i.paid, status: i.status, sentAt: i.sentAt, sentTo: i.sentTo, url: 'demo-invoice:' + i.id });

  const draft = o => o.items.map(i => ({ desc: `${ED[i.edition].name} edition storybook — ${i.child}`, hsn: '4911', qty: 1, unit: i.price }));
  function issueInvoice(o, lines, at) {
    lines = lines || draft(o);
    lines = lines.filter(l => l.qty > 0 && l.unit > 0).map(l => ({ ...l, amount: r2(l.qty * l.unit) }));
    if (!lines.length) throw err(400, 'Add at least one line with a price.');
    const sub = r2(lines.reduce((t, l) => t + l.amount, 0)), tax = Math.round(sub * GST) / 100, intra = o.address.state === CO_STATE;
    const d = at ? new Date(at) : new Date(), y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    const inv = { id: uid(), orderId: o.id, number: `TH/${y}-${String((y + 1) % 100).padStart(2, '0')}/${String(++invN).padStart(4, '0')}`, date: dayOf(at || new Date().toISOString()), lines, subtotal: sub, tax: { rate: GST, intra, cgst: intra ? r2(tax / 2) : 0, sgst: intra ? r2(tax - r2(tax / 2)) : 0, igst: intra ? 0 : tax }, total: r2(sub + tax), paid: paidSoFar(o), status: 'issued', sentAt: at || null, sentTo: at ? o.contact.email : null, billTo: { ...o.contact, address: o.address }, orderNumber: o.number };
    db.invoices.push(inv); log('invoice_created', { number: o.number, invoice: inv.number }, ME.name, at); if (at) log('invoice_sent', { number: o.number, invoice: inv.number, to: o.contact.email }, ME.name, at);
    return inv;
  }

  /* ---------------- routes ---------------- */
  const routes = [];
  const on = (m, re, fn) => routes.push([m, re, fn]);
  const today = () => new Date().toISOString().slice(0, 10);
  const parseQ = path => Object.fromEntries(new URLSearchParams((path.split('?')[1]) || ''));

  on('POST', /^\/auth\/login$/, b => { if (!b.email || !b.password) throw err(401, 'Enter an email and password.'); return { challenge: 'demo', sentTo: String(b.email).replace(/^(.)(.*)(@.*)$/, (_m, a, x, d) => a + '•'.repeat(Math.min(6, x.length)) + d) }; });
  on('POST', /^\/auth\/verify$/, b => { if (!/^\d{6}$/.test(b.code || '')) throw err(400, 'Enter the 6-digit code.', 'bad_code'); signedIn = true; return { user: ME }; });
  on('POST', /^\/auth\/logout$/, () => { signedIn = false; return { ok: true }; });
  on('GET', /^\/auth\/me$/, () => { if (!signedIn) throw err(401, ''); return ({ user: ME, company: { gstRate: GST, pricesIncludeGst: false, state: CO_STATE } }); });

  on('GET', /^\/summary$/, () => {
    const buckets = {}; Object.entries(BUCKETS).forEach(([k, [label, fn]]) => { buckets[k] = { label, count: db.orders.filter(fn).length }; });
    const net = p => p.kind === 'payment' ? p.amount : -p.amount, t0 = new Date(); t0.setHours(0, 0, 0, 0); const m0 = new Date(t0.getFullYear(), t0.getMonth(), 1);
    const tp = db.payments.filter(p => new Date(p.at) >= t0), mp = db.payments.filter(p => new Date(p.at) >= m0);
    return { buckets, money: { today: r2(tp.reduce((t, p) => t + net(p), 0)), month: r2(mp.reduce((t, p) => t + net(p), 0)), monthCount: mp.filter(p => p.kind === 'payment').length }, failedMessages: 0,
      editions: Object.entries(ED).map(([key, e]) => ({ key, name: e.name, price: e.price })), states: STATES, stages: STAGES };
  });

  on('GET', /^\/orders(\?.*)?$/, (_b, path) => {
    const f = parseQ(path); let list = db.orders.slice();
    if (f.bucket && BUCKETS[f.bucket]) list = list.filter(BUCKETS[f.bucket][1]);
    if (f.status) list = list.filter(o => o.status === f.status);
    if (f.edition) list = list.filter(o => o.items.some(i => i.edition === f.edition));
    if (f.state) list = list.filter(o => o.address.state === f.state);
    if (f.source) list = list.filter(o => o.source === f.source);
    if (f.from) list = list.filter(o => dayOf(o.createdAt) >= f.from);
    if (f.to) list = list.filter(o => dayOf(o.createdAt) <= f.to);
    if (f.q) { const t = f.q.toLowerCase(), dg = f.q.replace(/\D/g, ''); list = list.filter(o => { const u = userOf(o); return [o.number, u.name, u.email, ...o.items.map(i => i.child)].some(x => String(x).toLowerCase().includes(t)) || (dg.length >= 4 && u.phone.includes(dg)); }); }
    list.sort((a, b) => f.sort === 'old' ? a.createdAt.localeCompare(b.createdAt) : f.sort === 'total' ? b.total - a.total : b.createdAt.localeCompare(a.createdAt));
    const page = Number(f.page) || 1, size = 25;
    return { orders: list.slice((page - 1) * size, page * size).map(orderRow), total: list.length, value: r2(list.reduce((t, o) => t + o.total, 0)), page, size };
  });

  on('GET', /^\/orders\/([^/?]+)$/, (_b, _p, [id]) => {
    const o = findOrder(id), u = userOf(o), bks = booksOf(o), ids = new Set(bks.map(b => b.id));
    return {
      order: { id: o.id, number: o.number, status: o.status, source: o.source, createdAt: o.createdAt, paidAt: o.paidAt, subtotal: o.subtotal, tax: o.tax, gstRate: o.gstRate, total: o.total, refunded: o.refunded, paid: paidSoFar(o),
        giftNote: o.giftNote, address: o.address, contact: o.contact, provider: o.provider, providerOrderId: o.providerOrderId, shipping: o.shipping, cancelledAt: o.cancelledAt, cancelReason: o.cancelReason },
      customer: { id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, waUpdates: u.wa, since: u.createdAt, hasPassword: u.hasPassword },
      items: o.items,
      books: bks.map(b => { const cs = cardsOf(b), ps = photosOf(b); return { id: b.id, child: b.child, edition: b.edition, stage: b.stage, stageName: STAGES[b.stage], dates: b.dates, log: b.log, photos: ps.length, unread: ps.filter(p => !p.read).length, cards: cs.length, stories: cs.filter(answered).length, letter: !!b.letter, submittedAt: b.submittedAt, read: b.read }; }),
      payments: db.payments.filter(p => p.orderId === o.id).sort((a, b) => a.at.localeCompare(b.at)),
      invoices: db.invoices.filter(i => i.orderId === o.id).map(invSummary),
      refunds: db.refunds.filter(r => r.orderId === o.id), refundable: r2(refundable(o).reduce((t, p) => t + p.left, 0)), processing: false,
      issues: db.issues.filter(i => i.orderId === o.id).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)),
      attempts: o.providerOrderId ? [{ id: o.providerOrderId, provider: 'cashfree', amount: o.total, status: o.status === 'paid' ? 'paid' : 'open', checkedAt: null, at: o.createdAt }] : [],
      notes: db.notes.filter(n => n.orderId === o.id),
      messages: db.msgs.filter(m => m.orderId === o.id).slice().reverse(),
      activity: db.activity.filter(a => a.meta.number === o.number || ids.has(a.meta.book)).slice().reverse(),
    };
  });

  on('POST', /^\/orders$/, b => {
    const c = b.customer || {}, fields = {};
    if (!c.name) fields['customer.name'] = 'Please add a name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email || '')) fields['customer.email'] = 'Please enter a valid email address.';
    if (String(c.phone || '').replace(/\D/g, '').length < 10) fields['customer.phone'] = 'Please enter a 10-digit phone number.';
    (b.items || []).forEach((i, k) => { if (!i.childName) fields[`items.${k}.childName`] = 'Please add a name.'; });
    const a = b.address || {};
    if (!a.line1) fields['address.line1'] = 'Add the house and street.'; if (!a.city) fields['address.city'] = 'Add the city.'; if (!/^\d{6}$/.test(a.pin || '')) fields['address.pin'] = 'PIN codes have 6 digits.';
    if (Object.keys(fields).length) throw err(400, 'Please check the highlighted fields.', 'bad_request', fields);
    let u = db.users.find(x => x.email === c.email || x.phone === c.phone), created = false;
    if (!u) { u = addUser(c.name, c.email, c.phone, 0, false); created = true; }
    const o = addOrder({ user: u, items: b.items.map(i => ({ edition: i.edition, child: i.childName })), gift: b.giftNote, line1: a.line1, city: a.city, state: a.state, pin: a.pin, at: new Date().toISOString(), source: 'admin' });
    if (b.notify) msg(o, created ? 'account_created' : 'order_placed', null, created ? 'email' : undefined);
    if (b.payment && b.payment.status === 'paid') pay(o, b.payment.paidOn ? new Date(b.payment.paidOn + 'T12:00:00').toISOString() : new Date().toISOString(), b.payment.method, b.payment.ref, ME.name);
    return { number: o.number, id: o.id, accountCreated: created };
  });
  on('PATCH', /^\/orders\/([^/]+)$/, (b, _p, [id]) => { const o = findOrder(id); if (b.contact) o.contact = b.contact; if (b.address) o.address = { ...b.address }; if (b.giftNote !== undefined) o.giftNote = b.giftNote; log('admin_order_edit', { number: o.number, fields: Object.keys(b) }); return { ok: true }; });
  on('POST', /^\/orders\/([^/]+)\/notes$/, (b, _p, [id]) => { const o = findOrder(id); db.notes.push({ id: uid(), orderId: o.id, text: b.text, author: ME.name, at: new Date().toISOString() }); return { ok: true }; });
  on('POST', /^\/orders\/([^/]+)\/remind$/, (_b, _p, [id]) => { const o = findOrder(id); msg(o, 'order_placed'); log('admin_payment_reminder', { number: o.number }); return { ok: true }; });
  on('POST', /^\/orders\/([^/]+)\/refresh-payment$/, (_b, _p, [id]) => ({ status: findOrder(id).status }));
  on('POST', /^\/orders\/([^/]+)\/mark-paid$/, (b, _p, [id]) => {
    const o = findOrder(id); if (o.status === 'paid') throw err(409, 'This order is already paid.');
    pay(o, b.paidOn ? new Date(b.paidOn + 'T12:00:00').toISOString() : new Date().toISOString(), b.method, b.ref, ME.name);
    if (b.amount) db.payments[db.payments.length - 1].amount = b.amount; return { ok: true };
  });
  function refundable(o) {
    return db.payments.filter(p => p.orderId === o.id && p.kind === 'payment').sort((a, b) => b.at.localeCompare(a.at)).map(p => {
      const taken = db.refunds.filter(r => r.paymentId === p.id && r.status !== 'failed').reduce((t, r) => t + r.amount, 0);
      return { id: p.id, provider: p.provider, method: p.method, ref: p.ref, amount: p.amount, left: r2(p.amount - taken), gateway: p.provider !== 'manual', at: p.at };
    });
  }
  function settle(o, r) {
    r.status = 'succeeded'; r.completedAt = new Date().toISOString(); if (r.provider !== 'manual' && !r.arn) r.arn = 'ARN' + String(Date.now()).slice(-10);
    db.payments.push({ id: uid(), orderId: o.id, kind: 'refund', provider: r.provider, method: r.method, amount: r.amount, ref: r.arn, note: r.reason, by: r.by, at: r.completedAt });
    o.refunded = r2(o.refunded + r.amount); if (paidSoFar(o) <= 0 && (o.status === 'paid' || o.status === 'cancelled')) o.status = 'refunded';
    const p = refundable(o).find(x => x.id === r.paymentId);
    if (p && db.refunds.filter(x => x.paymentId === p.id && x.status === 'succeeded').reduce((t, x) => t + x.amount, 0) >= p.amount) db.issues.filter(i => i.paymentId === p.id && i.status === 'open').forEach(i => { i.status = 'resolved'; i.resolution = 'Refunded'; i.resolvedAt = r.completedAt; });
    log('refund_succeeded', { number: o.number, amount: Math.round(r.amount * 100), arn: r.arn }, 'System'); msg(o, 'refund', null, 'email');
  }
  function startRefund(o, b) {
    let list = refundable(o); if (b.paymentId) list = list.filter(p => p.id === b.paymentId);
    const total = r2(list.reduce((t, p) => t + p.left, 0));
    if (!(b.amount > 0)) throw err(400, 'Enter an amount to refund.', 'bad_request', { amount: 'Enter an amount to refund.' });
    if (b.amount > total + 0.001) throw err(400, `You can refund up to ₹${total.toLocaleString('en-IN')}${b.paymentId ? ' from that payment' : ''}.`, 'bad_request', { amount: `Up to ₹${total.toLocaleString('en-IN')}` });
    const out = []; let left = b.amount;
    for (const p of list) {
      if (left <= 0) break; const amt = r2(Math.min(left, p.left)); if (amt <= 0) continue;
      if (!p.gateway && !b.manual) throw err(400, `Payment ${p.ref || ''} was received by hand, so it can’t go back through Cashfree. Send it yourself, then record how you refunded it.`);
      const viaGw = p.gateway && !b.manual;
      const r = { id: uid(), orderId: o.id, paymentId: p.id, provider: viaGw ? p.provider : 'manual', method: viaGw ? null : b.manual.method, amount: amt, status: 'pending', reason: b.reason || null, arn: viaGw ? null : (b.manual.ref || null), failure: null, lastError: null, by: ME.name, createdAt: new Date().toISOString(), completedAt: null };
      db.refunds.push(r); out.push(r); left = r2(left - amt);
    }
    log('refund_started', { number: o.number, amount: Math.round(b.amount * 100), reason: b.reason, manual: !!b.manual });
    out.filter(r => r.provider === 'manual').forEach(r => settle(o, r));
    if (b.notify !== false && out.some(r => r.status === 'pending')) msg(o, 'refund_started', null, 'email');
    return out;
  }
  on('POST', /^\/orders\/([^/]+)\/cancel$/, (b, _p, [id]) => {
    const o = findOrder(id); if (o.status === 'cancelled' || o.status === 'refunded') throw err(409, 'Already cancelled.');
    o.status = 'cancelled'; o.cancelledAt = new Date().toISOString(); o.cancelReason = b.reason || null; log('admin_cancel', { number: o.number, reason: b.reason }); if (b.notify) msg(o, 'order_cancelled', null, 'email');
    const left = r2(refundable(o).reduce((t, p) => t + p.left, 0)); let refunds = [];
    if (b.refund && left > 0) refunds = startRefund(o, { amount: left, reason: b.reason ? `Order cancelled — ${b.reason}` : 'Order cancelled', notify: b.notify, manual: b.manual });
    return { ok: true, refundDue: r2(left - refunds.reduce((t, r) => t + r.amount, 0)), refunds };
  });
  on('GET', /^\/orders\/([^/]+)\/refundable$/, (_b, _p, [id]) => { const list = refundable(findOrder(id)); return { payments: list, total: r2(list.reduce((t, p) => t + p.left, 0)) }; });
  on('POST', /^\/orders\/([^/]+)\/refund$/, (b, _p, [id]) => {
    if (!b.reason || b.reason.trim().length < 3) throw err(400, 'Please check the highlighted fields.', 'bad_request', { reason: 'Add a short reason.' });
    return { refunds: startRefund(findOrder(id), b) };
  });
  // In the preview, Cashfree answers "succeeded" the first time you check a pending refund.
  on('POST', /^\/refunds\/([^/]+)\/check$/, (_b, _p, [id]) => { const r = db.refunds.find(x => x.id === id); if (!r) throw err(404, 'Not found.'); if (r.status === 'pending') settle(findOrder(r.orderId), r); return { refund: r }; });
  on('POST', /^\/refunds\/([^/]+)\/retry$/, (_b, _p, [id]) => {
    const r = db.refunds.find(x => x.id === id); if (!r || r.status !== 'failed') throw err(409, 'Only failed refunds can be retried.');
    db.issues.filter(i => i.refundId === r.id && i.status === 'open').forEach(i => { i.status = 'resolved'; i.resolution = 'Retried'; i.resolvedBy = ME.name; i.resolvedAt = new Date().toISOString(); });
    return { refunds: startRefund(findOrder(r.orderId), { amount: r.amount, reason: r.reason || 'Refund (retry)', paymentId: r.paymentId, notify: false }) };
  });
  on('POST', /^\/issues\/([^/]+)\/resolve$/, (b, _p, [id]) => {
    if (!b.note || b.note.trim().length < 3) throw err(400, 'Please check the highlighted fields.', 'bad_request', { note: 'Say how it was resolved.' });
    const i = db.issues.find(x => x.id === id && x.status === 'open'); if (!i) throw err(404, 'That issue is already resolved.');
    Object.assign(i, { status: 'resolved', resolution: b.note, resolvedBy: ME.name, resolvedAt: new Date().toISOString() });
    log('issue_resolved', { number: findOrder(i.orderId).number, kind: i.kind, note: b.note }); return { ok: true };
  });
  on('GET', /^\/orders\/([^/]+)\/invoice-draft$/, (_b, _p, [id]) => { const o = findOrder(id); return { lines: draft(o), gstRate: GST, pricesIncludeGst: false, state: o.address.state, companyState: CO_STATE, email: o.contact.email }; });
  on('POST', /^\/orders\/([^/]+)\/invoices$/, (b, _p, [id]) => { const o = findOrder(id); const inv = issueInvoice(o, b.lines.map(l => ({ desc: l.desc, hsn: l.hsn || '4911', qty: l.qty, unit: l.unit }))); if (b.send) { inv.sentAt = new Date().toISOString(); inv.sentTo = b.to || o.contact.email; msg(o, 'invoice', null, 'email'); log('invoice_sent', { number: o.number, invoice: inv.number, to: inv.sentTo }); } return { invoice: invSummary(inv) }; });
  on('POST', /^\/invoices\/([^/]+)\/send$/, (b, _p, [id]) => { const i = db.invoices.find(x => x.id === id), o = findOrder(i.orderId); i.sentAt = new Date().toISOString(); i.sentTo = b.to || o.contact.email; msg(o, 'invoice', null, 'email'); log('invoice_sent', { number: o.number, invoice: i.number, to: i.sentTo }); return { ok: true }; });
  on('POST', /^\/invoices\/([^/]+)\/void$/, (_b, _p, [id]) => { const i = db.invoices.find(x => x.id === id); i.status = 'void'; log('invoice_void', { number: findOrder(i.orderId).number, invoice: i.number }); return { ok: true }; });
  on('POST', /^\/orders\/([^/]+)\/ship$/, (b, _p, [id]) => {
    const o = findOrder(id), bks = booksOf(o);
    if (bks.some(x => x.stage < 4) && !b.force) throw err(409, `${bks.find(x => x.stage < 4).child}’s book hasn’t been approved for printing yet. Approve it first, or ship anyway.`, 'not_approved');
    const at = new Date().toISOString(); o.shipping = { courier: b.courier, awb: b.awb, at, deliveredAt: null }; bks.forEach(x => moveTo(x, 5, at, ME.name, `${b.courier} ${b.awb}`));
    log('admin_ship', { number: o.number, courier: b.courier, awb: b.awb }); if (b.notify) msg(o, 'shipped'); return { ok: true };
  });
  on('POST', /^\/orders\/([^/]+)\/deliver$/, (b, _p, [id]) => { const o = findOrder(id), at = new Date().toISOString(); o.shipping.deliveredAt = at; booksOf(o).forEach(x => moveTo(x, 6, at, ME.name)); log('admin_deliver', { number: o.number }); if (b.notify) msg(o, 'stage_update'); return { ok: true }; });

  on('GET', /^\/payments(\?.*)?$/, (_b, path) => {
    const f = parseQ(path); let list = db.payments.map(p => ({ p, o: db.orders.find(o => o.id === p.orderId) }));
    if (f.from) list = list.filter(x => dayOf(x.p.at) >= f.from); if (f.to) list = list.filter(x => dayOf(x.p.at) <= f.to);
    if (f.edition) list = list.filter(x => x.o.items.some(i => i.edition === f.edition)); if (f.state) list = list.filter(x => x.o.address.state === f.state);
    if (f.method) list = list.filter(x => x.p.method === f.method); if (f.kind) list = list.filter(x => x.p.kind === f.kind);
    const net = p => p.kind === 'payment' ? p.amount : -p.amount;
    const group = key => { const m = new Map(); list.forEach(x => { const k = key(x); const v = m.get(k) || { key: k, count: 0, amount: 0 }; v.amount = r2(v.amount + net(x.p)); if (x.p.kind === 'payment') v.count++; m.set(k, v); }); return [...m.values()].sort((a, b) => b.amount - a.amount); };
    const byEd = new Map(); list.forEach(({ p, o }) => o.items.forEach(i => { const v = byEd.get(i.edition) || { key: i.edition, name: ED[i.edition].name, count: 0, amount: 0 }; v.amount = r2(v.amount + net(p) * i.price / o.subtotal); if (p.kind === 'payment') v.count++; byEd.set(i.edition, v); }));
    const gross = r2(list.filter(x => x.p.kind === 'payment').reduce((t, x) => t + x.p.amount, 0)), refunds = r2(list.filter(x => x.p.kind === 'refund').reduce((t, x) => t + x.p.amount, 0));
    return {
      payments: list.sort((a, b) => b.p.at.localeCompare(a.p.at)).map(({ p, o }) => ({ id: p.id, kind: p.kind, at: p.at, order: o.number, orderId: o.id, customer: o.contact.name, state: o.address.state, city: o.address.city, editions: [...new Set(o.items.map(i => i.edition))], provider: p.provider, method: p.method, ref: p.ref, amount: p.amount, note: p.note })),
      totals: { gross, refunds, net: r2(gross - refunds), count: list.filter(x => x.p.kind === 'payment').length, gst: r2(list.filter(x => x.p.kind === 'payment').reduce((t, x) => t + x.p.amount * x.o.tax / x.o.total, 0)) },
      byEdition: [...byEd.values()].sort((a, b) => b.amount - a.amount), byState: group(x => x.o.address.state), byMethod: group(x => x.p.method || x.p.provider), byDay: group(x => dayOf(x.p.at)).sort((a, b) => a.key.localeCompare(b.key)),
    };
  });

  on('GET', /^\/books\/([^/]+)$/, (_b, _p, [id]) => {
    const b = findBook(id), o = db.orders.find(x => x.id === b.orderId), ps = photosOf(b), n = new Map(ps.map(p => [p.id, p.n]));
    return {
      book: { id: b.id, order: o.number, orderId: o.id, child: b.child, edition: b.edition, editionName: ED[b.edition].name, maxPhotos: ED[b.edition].photos, revisionRounds: ED[b.edition].rounds, stage: b.stage, stageName: STAGES[b.stage], dates: b.dates, log: b.log, letter: b.letter, submittedAt: b.submittedAt, read: { status: b.read } },
      photos: ps.map(p => ({ n: p.n, id: p.id, name: p.name, takenOn: p.takenOn, fav: p.fav, scene: p.read ? p.scene : null, view: p.src, download: p.src })),
      cards: cardsOf(b).map(c => ({ id: c.id, kind: c.kind, photos: c.photos.map(x => n.get(x)).filter(Boolean), topic: c.topic, obs: c.obs, q: c.q, options: c.options, pick: c.pick, text: c.text, source: c.source })),
      rounds: roundsOf(b).map(r => ({ id: r.id, round: r.round, status: r.status, sentAt: r.sentAt, decidedAt: r.decidedAt, pages: r.pages, notes: r.notes })),
    };
  });
  on('PATCH', /^\/books\/([^/]+)$/, (body, _p, [id]) => { const b = findBook(id); if (body.letter !== undefined) b.letter = body.letter; return { ok: true }; });
  on('POST', /^\/books\/([^/]+)\/stage$/, (body, _p, [id]) => {
    const b = findBook(id), o = db.orders.find(x => x.id === b.orderId);
    if (o.status !== 'paid') throw err(409, 'Mark the order as paid first.');
    if (body.stage === 3) throw err(400, 'To send a proof, upload the pages.'); if (body.stage === 5) throw err(400, 'Use “Ship order” with the courier and tracking number.');
    log('admin_stage', { book: b.id, number: o.number, from: b.stage, to: body.stage, note: body.note }); moveTo(b, body.stage, new Date().toISOString(), ME.name, body.note, true);
    if (body.notify && body.stage > 0) msg(o, 'stage_update'); return { ok: true };
  });
  on('POST', /^\/books\/([^/]+)\/photos\/uploads$/, (body, _p, [id]) => { findBook(id); return { uploads: body.files.map(f => { const pid = uid(); db.photos.push({ id: pid, bookId: id, n: 0, name: f.name, src: '', scene: '', fav: false, takenOn: f.takenOn, read: false, pending: true }); return { id: pid, upload: { url: 'demo:' + pid, method: 'PUT' } }; }) }; });
  on('POST', /^\/books\/([^/]+)\/photos\/complete$/, (body, _p, [id]) => {
    const b = findBook(id), o = db.orders.find(x => x.id === b.orderId); let k = photosOf(b).filter(p => !p.pending).length, n = 0;
    body.ids.forEach(pid => { const p = db.photos.find(x => x.id === pid); if (p && blobs.has('demo:' + pid)) { p.src = blobs.get('demo:' + pid); p.pending = false; p.n = ++k; n++; } });
    db.photos = db.photos.filter(p => !p.pending); log('admin_photos_added', { book: b.id, number: o.number, count: n }); return { uploaded: n };
  });
  on('DELETE', /^\/photos\/([^/]+)$/, (_b, _p, [id]) => { const p = db.photos.find(x => x.id === id); db.photos = db.photos.filter(x => x !== p); db.cards = db.cards.filter(c => !(c.kind === 'photo' && c.photos[0] === id)); db.cards.forEach(c => { c.photos = c.photos.filter(x => x !== id); }); photosOf({ id: p.bookId }).forEach((x, i) => { x.n = i + 1; }); return { ok: true }; });
  on('POST', /^\/books\/([^/]+)\/read$/, (_b, _p, [id]) => {
    const b = findBook(id);
    photosOf(b).filter(p => !p.read).forEach((p, i) => { p.read = true; p.scene = 'A family photo'; const [q, op] = QS[i % QS.length]; db.cards.push({ id: uid(), bookId: b.id, kind: 'photo', photos: [p.id], topic: '', obs: `${b.child} looks so happy here.`, q: q.replace(/\{c\}/g, b.child), options: op.map(x => x.replace(/\{c\}/g, b.child)), pick: null, text: '', source: 'ai' }); });
    b.read = 'done'; return { ok: true };
  });
  on('PATCH', /^\/cards\/([^/]+)$/, (body, _p, [id]) => { const c = db.cards.find(x => x.id === id); if (body.pick !== undefined) c.pick = body.pick; if (body.text !== undefined) c.text = body.text; return { ok: true }; });
  on('POST', /^\/books\/([^/]+)\/proof\/uploads$/, (body, _p, [id]) => { findBook(id); return { uploads: body.files.map(() => { const key = 'demo:proof-' + uid(); return { key, upload: { url: key, method: 'PUT' } }; }) }; });
  on('POST', /^\/books\/([^/]+)\/proof$/, (body, _p, [id]) => {
    const b = findBook(id), o = db.orders.find(x => x.id === b.orderId);
    if (b.stage < 1 || b.stage > 2) throw err(409, 'Proofs can be sent while the book is being written or designed.');
    const r = round(b, new Date().toISOString(), 'ready', body.keys.map(k => blobs.get(k) || PAGES[0]));
    moveTo(b, 3, r.sentAt, ME.name, `Proof round ${r.round} sent (${body.keys.length} pages)`); log('admin_proof', { book: b.id, number: o.number, round: r.round, pages: body.keys.length }); if (body.notify) msg(o, 'proof_ready');
    return { round: r.round };
  });
  on('POST', /^\/books\/([^/]+)\/proof\/decision$/, (body, _p, [id]) => {
    const b = findBook(id), o = db.orders.find(x => x.id === b.orderId);
    if (body.decision === 'changes' && !body.notes) throw err(400, 'Write down the changes the customer asked for.');
    let r = roundsOf(b).find(x => x.status === 'ready'); if (!r) r = round(b, new Date().toISOString(), 'ready', []);
    r.status = body.decision === 'approved' ? 'approved' : 'changes_requested'; r.decidedAt = new Date().toISOString();
    if (body.notes) r.notes.push({ page: 'Recorded by the team', at: 0, text: body.notes, sent: true });
    const to = body.decision === 'approved' ? 4 : 2;
    moveTo(b, to, r.decidedAt, ME.name, `Customer ${body.decision === 'approved' ? 'approved' : 'asked for changes to'} proof round ${r.round} outside the site${body.note ? ' — ' + body.note : ''}`, true);
    log('admin_proof_decision', { book: b.id, number: o.number, round: r.round, decision: body.decision, note: body.note }); if (body.notify && to === 4) msg(o, 'stage_update'); return { ok: true };
  });
  on('GET', /^\/customers(\?.*)?$/, (_b, path) => {
    const t = (parseQ(path).q || '').toLowerCase();
    return { customers: db.users.filter(u => [u.name, u.email, u.phone].some(x => x.toLowerCase().includes(t))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(u => { const os = db.orders.filter(o => o.userId === u.id); return { id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, created_at: u.createdAt, orders: os.length, spent: r2(os.filter(o => o.status === 'paid').reduce((s, o) => s + o.total, 0)) }; }) };
  });

  /* ---------------- public helpers ---------------- */
  async function handle(method, path, body) {
    await new Promise(r => setTimeout(r, 120)); // feel like a network call
    const bare = path.split('?')[0];
    for (const [m, re, fn] of routes) {
      if (m !== method) continue;
      const hit = (re.source.includes('(\\?.*)?') ? path : bare).match(re);
      if (hit) return JSON.parse(JSON.stringify(fn(body || {}, path, hit.slice(1).map(decodeURIComponent))));
    }
    throw err(404, 'Not available in the preview.');
  }
  function put(url, file) { blobs.set(url, URL.createObjectURL(file)); return Promise.resolve(); }
  function stories(bookId) {
    const d = routes.find(r => r[1].source === '^\\/books\\/([^/]+)$')[2](null, '', [bookId]);
    const ans = c => [c.pick != null ? c.options[c.pick] : null, c.text || null].filter(Boolean).join(' — ') || '(not answered)';
    return [`${d.book.child}’s storybook — ${d.book.editionName} edition — order ${d.book.order}`, '', '== Photo by photo ==', '']
      .concat(...d.cards.filter(c => c.kind === 'photo').map(c => [`Photo ${c.photos[0]}`, `  Q: ${c.q}`, `  A: ${ans(c)}`, '']))
      .concat('== Things that keep showing up ==', '', ...d.cards.filter(c => c.kind === 'theme').map(c => `${c.topic} — photos ${c.photos.join(', ')}\n  Q: ${c.q}\n  A: ${ans(c)}\n`))
      .concat('== Letter to the future ==', '', d.book.letter || '(none)').join('\n');
  }
  const invoice = id => db.invoices.find(i => i.id === id);
  seed();
  return { handle, put, stories, invoice, company: { name: 'Pepperistic Studio Pvt Ltd', brand: 'Thulori', state: CO_STATE, email: 'hello@thulori.com', phone: '+91 97893 90456' } };
})();
