/* Import des exports CSV Shopify (commandes) et Meta Ads (rapport par jour). Fonctions pures, tout se passe dans le navigateur. */
(function (root) {
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function parseCsv(text) {
    text = String(text).replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '', best = ',', bestN = -1;
    [';', ',', '\t'].forEach(function (d) {
      var c = 0, q = false;
      for (var k = 0; k < first.length; k++) { var ch = first[k]; if (ch === '"') q = !q; else if (!q && ch === d) c++; }
      if (c > bestN) { bestN = c; best = d; }
    });
    var rows = [], row = [], cell = '', q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === best) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = ''; rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  function toObjects(rows) {
    if (!rows.length) return { headers: [], rows: [] };
    var headers = rows[0].map(function (h) { return String(h).trim(); });
    return { headers: headers, rows: rows.slice(1).map(function (r) {
      var o = {}; headers.forEach(function (h, i) { o[h] = r[i] === undefined ? '' : String(r[i]).trim(); }); return o; }) };
  }

  function parseNumber(s) {
    s = String(s == null ? '' : s).replace(/[\s  ]/g, '').replace(/[^0-9,.\-]/g, '');
    if (!s || s === '-') return NaN;
    var c = s.lastIndexOf(','), d = s.lastIndexOf('.');
    if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c > -1) s = (s.split(',').length === 2 && !/,\d{3}$/.test(s)) ? s.replace(',', '.') : s.replace(/,/g, '');
    return parseFloat(s);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseDate(s) {
    s = String(s == null ? '' : s).trim(); var m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(s))) {
      var a = +m[1], b = +m[2], day = a, mon = b;
      if (b > 12 && a <= 12) { day = b; mon = a; }
      if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
      return m[3] + '-' + pad(mon) + '-' + pad(day);
    }
    return null;
  }

  // Cherche une colonne : égalité exacte d'abord, puis contient. `avoid` écarte les colonnes parasites (valeur, coût…).
  function pick(headers, aliases, avoid) {
    var hs = headers.map(norm), a, i;
    for (a = 0; a < aliases.length; a++) for (i = 0; i < hs.length; i++) if (hs[i] === aliases[a]) return headers[i];
    for (a = 0; a < aliases.length; a++) for (i = 0; i < hs.length; i++) {
      if (hs[i].indexOf(aliases[a]) > -1 && !(avoid || []).some(function (v) { return hs[i].indexOf(v) > -1; })) return headers[i];
    }
    return null;
  }

  function summarize(daily, extra) {
    var dates = Object.keys(daily).sort(), t = { spend: 0, orders: 0, revenue: 0 };
    dates.forEach(function (d) { t.spend += daily[d].spend || 0; t.orders += daily[d].orders || 0; t.revenue += daily[d].revenue || 0; });
    return Object.assign({ daily: daily, days: dates.length, from: dates[0] || null, to: dates[dates.length - 1] || null, totals: t, warnings: [] }, extra);
  }

  // Shopify : une ligne par article ; les champs de la commande ne sont renseignés que sur la première ligne.
  function shopify(text) {
    var o = toObjects(parseCsv(text)), h = o.headers;
    var cName = pick(h, ['name', 'nom', 'ordernumber', 'commande', 'bestelling']),
        cDate = pick(h, ['createdat', 'creele', 'datecreation', 'aangemaaktop', 'date']),
        cTotal = pick(h, ['total', 'totaal'], ['sub', 'discount', 'tax', 'shipping', 'remise', 'taxe']),
        cRef = pick(h, ['refundedamount', 'montantrembourse', 'terugbetaaldbedrag']),
        cCancel = pick(h, ['cancelledat', 'annuleele', 'geannuleerdop']),
        cStatus = pick(h, ['financialstatus', 'statutfinancier', 'financielestatus']);
    var miss = [];
    if (!cName) miss.push('Name'); if (!cDate) miss.push('Created at'); if (!cTotal) miss.push('Total');
    if (miss.length) return { error: 'Colonnes introuvables dans le fichier Shopify : ' + miss.join(', ') + '. Exportez les commandes depuis Shopify (Commandes → Exporter).' };
    var seen = {}, daily = {}, skipped = { cancelled: 0, refunded: 0, invalid: 0 };
    o.rows.forEach(function (r) {
      var id = r[cName]; if (!id || r[cTotal] === '' || seen[id]) return; seen[id] = 1;
      var status = norm(r[cStatus]), total = parseNumber(r[cTotal]), date = parseDate(r[cDate]);
      if (isNaN(total) || !date) { skipped.invalid++; return; }
      if ((cCancel && r[cCancel]) || status === 'voided') { skipped.cancelled++; return; }
      var ref = cRef ? parseNumber(r[cRef]) : 0; if (isNaN(ref)) ref = 0;
      if (status === 'refunded' || ref >= total - 0.005) { skipped.refunded++; return; }
      var d = daily[date] || (daily[date] = { orders: 0, revenue: 0 });
      d.orders += 1; d.revenue += total - ref;
    });
    var s = summarize(daily, { source: 'shopify', skipped: skipped });
    if (!s.days) s.warnings.push('Aucune commande exploitable dans ce fichier.');
    return s;
  }

  // Meta Ads Manager : rapport ventilé par jour (Jour / Day).
  function meta(text) {
    var o = toObjects(parseCsv(text)), h = o.headers;
    var cDate = pick(h, ['day', 'jour', 'dag', 'reportingstarts', 'debutdesrapports', 'debutdelaperiode', 'startvanrapportage', 'date']),
        cSpend = pick(h, ['amountspent', 'montantdepense', 'bedraguitgegeven', 'spend', 'depense']),
        cPur = pick(h, ['purchases', 'websitepurchases', 'achats', 'aankopen'], ['value', 'valeur', 'waarde', 'cost', 'cout', 'kosten', 'cpa', 'roas', 'rate', 'taux']),
        cVal = pick(h, ['purchaseconversionvalue', 'purchasesconversionvalue', 'websitepurchasesconversionvalue', 'valeurdeconversiondesachats', 'valeurdeconversiondachats', 'aankoopconversiewaarde', 'conversionvalue']);
    var miss = [];
    if (!cDate) miss.push('Jour (Day)'); if (!cSpend) miss.push('Montant dépensé');
    if (miss.length) return { error: 'Colonnes introuvables dans le fichier Meta : ' + miss.join(', ') + '. Dans le gestionnaire de publicités, ventilez le rapport par « Jour » et ajoutez « Montant dépensé ».' };
    var daily = {}, bad = 0;
    o.rows.forEach(function (r) {
      var date = parseDate(r[cDate]), sp = parseNumber(r[cSpend]);
      if (!date) { if (/total|résultat|result/i.test(r[cDate] || '')) return; bad++; return; }
      if (isNaN(sp)) sp = 0;
      var d = daily[date] || (daily[date] = { spend: 0, purchases: 0, value: 0 });
      d.spend += sp; if (cPur) d.purchases += parseNumber(r[cPur]) || 0; if (cVal) d.value += parseNumber(r[cVal]) || 0;
    });
    var s = summarize(daily, { source: 'meta', hasPurchases: !!cPur, hasValue: !!cVal, skipped: { invalid: bad } });
    if (!s.days) s.warnings.push('Aucune ligne datée dans ce fichier.');
    return s;
  }

  // Fusionne les journées importées dans le suivi : seuls les champs fournis remplacent ceux de la date.
  function mergeIntoLog(log, imports, newId) {
    var byDate = {}, out = (log || []).slice(), res = { added: 0, updated: 0 };
    imports.forEach(function (imp) {
      Object.keys(imp.daily).forEach(function (date) {
        var d = byDate[date] || (byDate[date] = {}), v = imp.daily[date];
        if (imp.source === 'meta') {
          d.spend = v.spend;
          if (imp.usePurchases) { d.orders = v.purchases; d.revenue = v.value; }
        } else { d.orders = v.orders; d.revenue = v.revenue; }
      });
    });
    Object.keys(byDate).forEach(function (date) {
      var same = out.filter(function (e) { return e.date === date; });
      var base = { spend: 0, orders: 0, revenue: 0 };
      same.forEach(function (e) { base.spend += +e.spend || 0; base.orders += +e.orders || 0; base.revenue += +e.revenue || 0; });
      out = out.filter(function (e) { return e.date !== date; });
      out.push(Object.assign({ id: newId(), date: date }, base, byDate[date]));
      if (same.length) res.updated++; else res.added++;
    });
    out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    res.log = out; return res;
  }

  var api = { parseCsv: parseCsv, parseNumber: parseNumber, parseDate: parseDate, shopify: shopify, meta: meta, mergeIntoLog: mergeIntoLog };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DropImport = api;
})(typeof window !== 'undefined' ? window : this);
