(function () {
  'use strict';
  var D = DropCalc.DEFAULTS, C = DropCalc.compute;
  var KEY = 'rentab.v2', OLD = 'dropcalc.v1';
  var GOAL = { goalNet: 1000, goalMargin: 20, country: 'BE' };
  // Taux normaux de TVA à titre indicatif (à vérifier avant usage).
  var VAT = { BE: ['Belgique', 21], FR: ['France', 20], NL: ['Pays-Bas', 21], DE: ['Allemagne', 19], LU: ['Luxembourg', 17],
    ES: ['Espagne', 21], IT: ['Italie', 22], PT: ['Portugal', 23], AT: ['Autriche', 20], IE: ['Irlande', 23], PL: ['Pologne', 23], XX: ['Autre', null] };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function fresh() { return Object.assign({}, D, GOAL); }

  var eur = function (v) { return isFinite(v) ? v.toLocaleString('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }) : '∞'; };
  var eur0 = function (v) { return isFinite(v) ? v.toLocaleString('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '∞'; };
  var num = function (v, d) { return isFinite(v) ? v.toLocaleString('fr-BE', { maximumFractionDigits: d === undefined ? 2 : d }) : '∞'; };
  var pct = function (v) { return isFinite(v) ? (v * 100).toLocaleString('fr-BE', { maximumFractionDigits: 1 }) + ' %' : '—'; };
  var cls = function (v) { return v >= 0 ? 'pos' : 'neg'; };

  /* ---------- Données : plusieurs produits / scénarios ---------- */
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.items) && d.items.length) return d;
    } catch (e) {}
    var inputs = fresh();
    try { Object.assign(inputs, JSON.parse(localStorage.getItem(OLD) || '{}')); } catch (e) {}
    var id = uid();
    return { current: id, tab: 'calc', cmp: [], items: [{ id: id, name: 'Produit 1', inputs: inputs, log: [] }] };
  }
  var db = load();
  db.items.forEach(function (x) { x.inputs = Object.assign(fresh(), x.inputs); x.log = x.log || []; });
  if (!db.items.some(function (x) { return x.id === db.current; })) db.current = db.items[0].id;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function cur() { return db.items.filter(function (x) { return x.id === db.current; })[0] || db.items[0]; }
  function S() { return cur().inputs; }

  /* ---------- Formulaire d'hypothèses ---------- */
  var FIELDS = [
    ['Produit & prix', [
      ['country', 'Pays de vente (TVA)', 'country'],
      ['priceTTC', 'Prix de vente TTC (€)'], ['shippingCharged', 'Livraison facturée TTC (€)'],
      ['vat', 'TVA (%)'], ['refundRate', 'Remboursements / retours (%)'],
      ['productCost', 'Coût produit fournisseur (€)'], ['supplierShipping', 'Livraison fournisseur (€)'],
      ['costRecovery', 'Coût récupéré sur retours (%)'], ['otherPerOrder', 'Autres coûts / commande (€)']]],
    ['Litiges & retours', [
      ['chargebackRate', 'Litiges (chargebacks) (% des commandes)'], ['chargebackFee', 'Frais par litige (€)'],
      ['returnShipping', 'Frais de retour par remboursement (€)']]],
    ['Frais de paiement & plateforme', [
      ['payPct', 'Paiement : % du TTC'], ['payFixed', 'Paiement : fixe / transaction (€)'],
      ['platformPct', 'Commission boutique (% du TTC)']]],
    ['Meta Ads', [
      ['adMode', 'Mode de calcul du CPA', 'select'],
      ['cpm', 'CPM (€ / 1000 impressions)', 'funnel'], ['ctr', 'CTR lien (%)', 'funnel'],
      ['cvr', 'Conversion clic → achat (%)', 'funnel'], ['cpaDirect', 'CPA constaté (€)', 'direct'],
      ['dailyBudget', 'Budget pub / jour (€)'], ['days', 'Jours / mois']]],
    ['Structure', [
      ['fixedMonthly', 'Coûts fixes mensuels (€)'], ['taxRate', 'Impôt sur le bénéfice (%)']]]
  ];

  function buildInputs() {
    var html = FIELDS.map(function (g) {
      return '<h2>' + g[0] + '</h2><div class="grid">' + g[1].map(function (f) {
        if (f[2] === 'country') return '<label class="full">' + f[1] + '<select data-k="country">' + Object.keys(VAT).map(function (c) {
          return '<option value="' + c + '">' + VAT[c][0] + (VAT[c][1] === null ? '' : ' (' + VAT[c][1] + ' %)') + '</option>'; }).join('') + '</select></label>';
        if (f[2] === 'select') return '<label class="full">' + f[1] + '<select data-k="' + f[0] + '">' +
          '<option value="funnel">Entonnoir (CPM, CTR, conversion)</option><option value="direct">CPA saisi directement</option></select></label>';
        return '<label data-mode="' + (f[2] || '') + '">' + f[1] + '<input type="number" inputmode="decimal" step="any" data-k="' + f[0] + '"></label>';
      }).join('') + '</div>';
    }).join('') +
      '<div class="row"><button id="reset" type="button">Réinitialiser ce produit</button></div>' +
      '<p class="note">Hypothèses indicatives (Belgique, TVA 21 %). Les montants fournisseur sont supposés HT, sans TVA d’import. Ceci n’est pas un conseil comptable.</p>';
    $('inputs').innerHTML = html;
    syncValues($('inputs'));
    $('reset').onclick = function () { cur().inputs = fresh(); save(); syncValues($('inputs')); buildTab(); render(); };
  }
  function syncValues(root) {
    var s = Object.assign(fresh(), S());
    root.querySelectorAll('[data-k]').forEach(function (el) {
      el.value = s[el.dataset.k];
      if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0;
    });
  }
  document.addEventListener('input', function (e) {
    var el = e.target, k = el.dataset && el.dataset.k;
    if (!k) return;
    S()[k] = el.tagName === 'SELECT' ? el.value : (el.value === '' || isNaN(parseFloat(el.value)) ? 0 : parseFloat(el.value));
    if (k === 'country' && VAT[el.value] && VAT[el.value][1] !== null) { S().vat = VAT[el.value][1]; syncValues($('inputs')); }
    save(); render();
  });

  /* ---------- Barre des scénarios ---------- */
  function buildScenarios() {
    $('sel').innerHTML = db.items.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name || 'Sans nom') + '</option>'; }).join('');
    $('sel').value = db.current;
    $('nm').value = cur().name;
  }
  function switchTo(id) {
    db.current = id; save(); buildScenarios(); buildInputs(); buildTab(); render();
  }
  $('sel').onchange = function () { switchTo($('sel').value); };
  $('nm').oninput = function () {
    cur().name = $('nm').value; save();
    var o = $('sel').selectedOptions[0]; if (o) o.textContent = cur().name || 'Sans nom';
    renderPrintHead(); if (db.tab === 'compare') render();
  };
  $('bnew').onclick = function () {
    var id = uid(); db.items.push({ id: id, name: 'Produit ' + (db.items.length + 1), inputs: fresh(), log: [] }); switchTo(id);
  };
  $('bdup').onclick = function () {
    var id = uid(); db.items.push({ id: id, name: (cur().name || 'Produit') + ' (copie)', inputs: Object.assign({}, S()), log: [] }); switchTo(id);
  };
  var delTimer;
  $('bdel').onclick = function () {
    var b = $('bdel');
    if (!b.dataset.armed) {
      b.dataset.armed = '1'; b.textContent = 'Confirmer ?'; b.classList.add('danger');
      delTimer = setTimeout(disarm, 3000); return;
    }
    disarm();
    if (db.items.length === 1) { cur().inputs = fresh(); cur().name = 'Produit 1'; save(); switchTo(db.current); return; }
    db.items = db.items.filter(function (x) { return x.id !== db.current; });
    switchTo(db.items[0].id);
  };
  function disarm() {
    var b = $('bdel'); clearTimeout(delTimer); delete b.dataset.armed; b.textContent = 'Supprimer'; b.classList.remove('danger');
  }

  /* ---------- Onglets ---------- */
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.onclick = function () { db.tab = b.dataset.tab; save(); buildTab(); render(); };
  });

  function buildTab() {
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-current', b.dataset.tab === db.tab); });
    $('main').classList.toggle('single', db.tab === 'compare');
    var ctl = $('tabctl'), h = '';
    if (db.tab === 'goal') {
      h = '<h2>Votre objectif</h2><div class="grid">' +
        '<label>Bénéfice net mensuel visé (€)<input type="number" inputmode="decimal" step="any" data-k="goalNet"></label>' +
        '<label>Marge nette visée par commande (%)<input type="number" inputmode="decimal" step="any" data-k="goalMargin"></label></div>';
    } else if (db.tab === 'scale') {
      h = '<h2>Hypothèse de mise à l’échelle</h2><div class="grid">' +
        '<label class="full">Hausse du CPA quand le budget double (%)<input type="number" inputmode="decimal" step="any" data-k="cpaGrowth"></label></div>' +
        '<p class="note">Plus on dépense, plus Meta doit chercher loin : le CPA monte. 20 % signifie qu’en doublant le budget, chaque commande coûte 20 % de plus.</p>';
    } else if (db.tab === 'track') {
      h = '<h2>Saisir une journée</h2><div class="grid">' +
        '<label>Date<input id="tdate" type="date" value="' + today() + '"></label>' +
        '<label>Dépense pub (€)<input id="tspend" type="number" inputmode="decimal" step="any" min="0"></label>' +
        '<label>Commandes<input id="torders" type="number" inputmode="numeric" step="1" min="0"></label>' +
        '<label>Chiffre d’affaires TTC (€)<input id="trev" type="number" inputmode="decimal" step="any" min="0"></label></div>' +
        '<div class="row"><button id="tadd" type="button">Ajouter</button></div><p id="tmsg" class="note"></p>';
    } else if (db.tab === 'compare') {
      if (!db.cmp.length) db.cmp = db.items.slice(0, 4).map(function (x) { return x.id; });
      h = '<h2>Produits à comparer (4 maximum)</h2><div class="checks">' + db.items.map(function (x) {
        return '<label><input type="checkbox" data-cmp="' + x.id + '"' + (db.cmp.indexOf(x.id) > -1 ? ' checked' : '') + '>' + esc(x.name || 'Sans nom') + '</label>';
      }).join('') + '</div>';
    }
    ctl.hidden = !h; ctl.innerHTML = h;
    if (h) syncValues(ctl);
    var add = $('tadd');
    if (add) add.onclick = function () {
      var v = function (id) { return parseFloat($(id).value); }, sp = v('tspend'), od = v('torders'), rv = v('trev');
      if (!$('tdate').value || isNaN(sp) || isNaN(od) || isNaN(rv) || sp < 0 || od < 0 || rv < 0) {
        $('tmsg').textContent = 'Renseignez la date, la dépense, les commandes et le chiffre d’affaires (valeurs positives ou nulles).'; return;
      }
      cur().log.push({ id: uid(), date: $('tdate').value, spend: sp, orders: od, revenue: rv });
      cur().log.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      save(); ['tspend', 'torders', 'trev'].forEach(function (id) { $(id).value = ''; });
      $('tmsg').textContent = 'Journée ajoutée.'; render();
    };
    ctl.querySelectorAll('[data-cmp]').forEach(function (c) {
      c.onchange = function () {
        var on = ctl.querySelectorAll('[data-cmp]:checked');
        if (on.length > 4) { c.checked = false; return; }
        db.cmp = Array.prototype.map.call(on, function (x) { return x.dataset.cmp; }); save(); render();
      };
    });
  }

  /* ---------- Rendu ---------- */
  function render() {
    document.querySelectorAll('[data-mode]').forEach(function (l) {
      var m = l.dataset.mode; l.style.display = (!m || m === S().adMode) ? '' : 'none';
    });
    renderPrintHead();
    var out = $('out');
    if (db.tab === 'goal') out.innerHTML = goalView();
    else if (db.tab === 'scale') out.innerHTML = scaleView();
    else if (db.tab === 'track') out.innerHTML = trackView();
    else if (db.tab === 'compare') out.innerHTML = compareView();
    else out.innerHTML = calcView();
    wireActions();
  }
  function renderPrintHead() {
    var t = { calc: 'Calculateur', goal: 'Objectif', scale: 'Mise à l’échelle', track: 'Suivi', compare: 'Comparaison' }[db.tab];
    $('printhead').innerHTML = '<b>Calcul rentabilité E-commerce et Meta ads</b> — ' + esc(cur().name || '') + ' — ' + t + ' — ' +
      new Date().toLocaleDateString('fr-BE');
  }
  function wireActions() {
    document.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () { cur().log = cur().log.filter(function (e) { return e.id !== b.dataset.del; }); save(); render(); };
    });
    var uc = $('usecpa');
    if (uc) uc.onclick = function () {
      var t = DropCalc.tracking(S(), cur().log);
      if (!isFinite(t.cpa)) return;
      S().adMode = 'direct'; S().cpaDirect = +t.cpa.toFixed(2); save(); syncValues($('inputs')); render();
    };
    var p = $('pdf'), c = $('csv');
    if (p) p.onclick = function () { window.print(); };
    if (c) c.onclick = exportCsv;
  }
  function minus(v) { return v > 0.005 ? '− ' + eur(v) : eur(0); }
  function tr(l, v, c) { return '<tr><td>' + l + '</td><td class="' + (c || '') + '">' + v + '</td></tr>'; }
  function kpi(l, v, c) { return '<div class="kpi ' + (c || '') + '"><span>' + l + '</span><b>' + v + '</b></div>'; }

  function calcView() {
    var s = S(), r = C(s), ok = r.profitPerOrder > 0 && r.net > 0;
    var verdict = r.contribution <= 0 ? 'Marge avant pub négative : le prix ne couvre pas les coûts, aucune pub ne pourra l’améliorer.' :
      r.profitPerOrder <= 0 ? 'Non rentable : le CPA (' + eur(r.cpa) + ') dépasse votre CPA limite (' + eur(r.beCpa) + ').' :
      r.net <= 0 ? 'Rentable à la commande mais pas assez pour couvrir les coûts fixes à ce budget.' :
      'Rentable : ' + eur(r.net) + ' de bénéfice net estimé par mois.';
    return '<section class="card"><div class="verdict ' + (ok ? 'good' : 'bad') + '">' + verdict + '</div><div class="kpis">' +
      kpi('ROAS actuel', num(r.roas) + '×', r.roas >= r.beRoas ? 'good' : 'bad') + kpi('ROAS point mort', num(r.beRoas) + '×') +
      kpi('CPA actuel', eur(r.cpa)) + kpi('CPA limite', eur(r.beCpa)) +
      kpi('Bénéfice / commande', eur(r.profitPerOrder), r.profitPerOrder >= 0 ? 'good' : 'bad') +
      kpi('Bénéfice net / mois', eur(r.net), r.net >= 0 ? 'good' : 'bad') + '</div>' +
      '<div class="row noprint"><button id="pdf" type="button">Exporter en PDF</button><button id="csv" type="button">Exporter en CSV</button></div></section>' +
      '<section class="card"><h2>Où va chaque euro encaissé (HT)</h2>' + breakdown(r) + '</section>' +
      '<section class="card"><h2>Économie unitaire (par commande)</h2><table>' +
      tr('Encaissé TTC', eur(r.revTTC)) + tr('Chiffre d’affaires HT', eur(r.revHT)) +
      tr('Remboursements et litiges (' + num(+s.refundRate + +s.chargebackRate) + ' %)', minus(r.revHT - r.netRevenue)) +
      tr('Coût produit + livraison fournisseur', minus(r.productCosts)) +
      tr('Frais de paiement', minus(r.payFees)) + tr('Commission boutique', minus(r.platformFees)) +
      tr('Autres coûts (dont litiges et retours)', minus(r.other)) +
      '<tr><th>Marge avant pub (' + pct(r.contributionPct) + ')</th><th class="' + cls(r.contribution) + '">' + eur(r.contribution) + '</th></tr>' +
      tr('Coût d’acquisition Meta (CPA)', minus(r.cpa)) + (r.cpc !== null ? tr('dont coût par clic (CPC)', eur(r.cpc)) : '') +
      '<tr><th>Bénéfice par commande</th><th class="' + cls(r.profitPerOrder) + '">' + eur(r.profitPerOrder) + '</th></tr></table></section>' +
      '<section class="card"><h2>Projection mensuelle</h2><table>' +
      tr('Budget pub', eur(r.spend)) + tr('Commandes estimées', num(r.orders, 0)) + tr('Chiffre d’affaires TTC', eur(r.revenueTTC)) +
      tr('Marge avant pub totale', eur(r.orders * r.contribution)) + tr('Dépenses publicitaires', minus(r.spend)) +
      tr('Coûts fixes', minus(s.fixedMonthly)) + tr('Résultat avant impôt', eur(r.preTax), cls(r.preTax)) + tr('Impôt', minus(r.tax)) +
      '<tr><th>Bénéfice net (marge ' + pct(r.netMarginPct) + ')</th><th class="' + cls(r.net) + '">' + eur(r.net) + '</th></tr>' +
      tr('Commandes pour couvrir les coûts fixes', num(r.ordersToBE, 0)) + tr('ROI sur budget pub', pct(r.monthlyRoi)) + '</table></section>' +
      '<section class="card"><h2>Sensibilité : bénéfice net mensuel (CVR × CPM)</h2><div class="wrap">' + sensitivity(s) + '</div>' +
      '<p class="note">Même budget, mêmes coûts ; seuls le taux de conversion (clic → achat) et le CPM varient.</p></section>';
  }

  function breakdown(r) {
    if (!isFinite(r.cpa)) return '<p class="note">Le CPA est infini (conversion ou CTR à zéro) : renseignez-les pour voir la répartition.</p>';
    var seg = [
      ['Remboursements et litiges', r.revHT - r.netRevenue, 's-refund'], ['Produit + livraison', r.productCosts, 's-prod'],
      ['Frais et autres coûts', r.payFees + r.platformFees + r.other, 's-fees'], ['Publicité Meta', r.cpa, 's-ads'],
      ['Bénéfice', Math.max(0, r.profitPerOrder), 's-profit']];
    var total = Math.max(r.revHT, seg.reduce(function (a, x) { return a + x[1]; }, 0)) || 1;
    return '<div class="stack" role="img" aria-label="Répartition du chiffre d’affaires HT">' + seg.map(function (x) {
      return '<i style="width:' + (x[1] / total * 100) + '%;background:var(--' + x[2] + ')"></i>'; }).join('') + '</div>' +
      '<ul class="legend">' + seg.map(function (x) {
        return '<li><em style="background:var(--' + x[2] + ')"></em>' + x[0] + ' ' + eur(x[1]) + ' (' + pct(x[1] / r.revHT) + ')</li>'; }).join('') + '</ul>' +
      (r.profitPerOrder < 0 ? '<p class="note">Perte de ' + eur(-r.profitPerOrder) + ' par commande : les coûts dépassent le chiffre d’affaires.</p>' : '');
  }

  function sensitivity(s) {
    var cvrs = [1, 1.5, 2, 2.5, 3, 4, 5], cpms = [6, 8, 10, 12, 15, 20, 25];
    var h = '<table class="sens"><tr><th>CVR \\ CPM</th>' + cpms.map(function (c) { return '<th>' + c + ' €</th>'; }).join('') + '</tr>';
    cvrs.forEach(function (v) {
      h += '<tr><th>' + v + ' %</th>' + cpms.map(function (c) {
        var x = C(Object.assign({}, s, { adMode: 'funnel', cvr: v, cpm: c })).net, a = Math.min(1, Math.abs(x) / 3000) * 0.55 + 0.08;
        return '<td style="background:rgba(' + (x >= 0 ? '34,197,94' : '239,68,68') + ',' + a + ')">' + Math.round(x).toLocaleString('fr-BE') + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</table>';
  }

  /* ----- Objectif ----- */
  function goalView() {
    var s = S(), r = C(s), g = DropCalc.reverse(s, s.goalNet), mp = DropCalc.minPrice(s, s.goalMargin), mc = DropCalc.maxCpa(s, s.goalMargin);
    var a;
    if (!g.feasible) {
      a = '<div class="verdict bad">Objectif hors d’atteinte : chaque commande rapporte ' + eur(g.unit) +
        ' après la pub. Augmentez la marge ou baissez le CPA avant de chercher à scaler.</div>';
    } else {
      a = '<div class="verdict good">Pour ' + eur0(s.goalNet) + ' net par mois, visez ' + num(g.orders, 0) + ' commandes (' + num(g.ordersPerDay, 1) + ' par jour).</div>' +
        '<table>' + tr('Commandes nécessaires / mois', num(g.orders, 0)) + tr('Budget pub nécessaire / mois', eur0(g.spend)) +
        tr('Budget pub nécessaire / jour', eur(g.dailyBudget)) + tr('Chiffre d’affaires TTC correspondant', eur0(g.revenueTTC)) +
        tr('Bénéfice par commande (CPA actuel)', eur(g.unit)) + '</table>' +
        '<p class="note">Calculé avec votre CPA actuel (' + eur(r.cpa) + '). Voir l’onglet « Mise à l’échelle » : un budget plus élevé fait en général monter le CPA.</p>';
    }
    var b = '<table>' + tr('CPA maximal pour ' + num(s.goalMargin) + ' % de marge nette', eur(mc), mc >= r.cpa ? 'pos' : 'neg') +
      tr('CPA actuel', eur(r.cpa)) +
      tr('Prix TTC minimal pour ' + num(s.goalMargin) + ' % de marge nette', mp === null ? 'impossible' : eur(mp), mp !== null && mp <= s.priceTTC ? 'pos' : 'neg') +
      tr('Prix TTC actuel', eur(s.priceTTC)) + '</table>' +
      '<p class="note">Le prix minimal suppose un CPA identique ; un prix plus haut peut faire baisser la conversion.</p>';
    return '<section class="card"><h2>Pour atteindre le bénéfice visé</h2>' + a + '</section>' +
      '<section class="card"><h2>Pour atteindre la marge visée par commande</h2>' + b + '</section>';
  }

  /* ----- Mise à l'échelle ----- */
  function scaleView() {
    var s = S(), mults = [], i, k;
    for (i = 0; i <= 14; i++) mults.push(0.25 * Math.pow(16, i / 14));
    mults.push(1); mults.sort(function (a, b) { return a - b; });
    var pts = DropCalc.scaleCurve(s, mults);
    var rows = DropCalc.scaleCurve(s, [0.5, 1, 2, 3, 4]);
    var best = pts.reduce(function (a, p) { return p.net > a.net ? p : a; }, pts[0]);
    var msg = best.net <= 0 ? 'Aucun budget testé n’est rentable avec ces hypothèses.' :
      'Bénéfice maximal estimé autour de ' + eur0(best.daily) + ' par jour (' + eur0(best.net) + ' net par mois). Au-delà, le CPA grignote la marge.';
    var t = '<table><tr><th>Budget / jour</th><th>CPA</th><th>Commandes</th><th>ROAS</th><th>Net / mois</th></tr>' +
      rows.map(function (p) {
        return '<tr><td>' + eur0(p.daily) + (p.mult === 1 ? ' (actuel)' : '') + '</td><td>' + eur(p.cpa) + '</td><td>' + num(p.orders, 0) + '</td><td>' +
          num(p.roas) + '×</td><td class="' + cls(p.net) + '">' + eur0(p.net) + '</td></tr>'; }).join('') + '</table>';
    return '<section class="card"><h2>Bénéfice net mensuel selon le budget quotidien</h2>' + scaleChart(pts, best) +
      '<p class="note">' + msg + '</p></section><section class="card"><h2>Détail</h2><div class="wrap">' + t + '</div></section>';
  }

  function scaleChart(pts, best) {
    var W = 620, H = 262, L = 66, R = 14, T = 28, B = 30;
    var x0 = pts[0].daily, x1 = pts[pts.length - 1].daily, ys = pts.map(function (p) { return p.net; });
    var y0 = Math.min.apply(null, ys.concat(0)), y1 = Math.max.apply(null, ys.concat(0));
    if (y1 === y0) y1 = y0 + 1;
    var X = function (v) { return L + (v - x0) / (x1 - x0 || 1) * (W - L - R); }, Y = function (v) { return T + (y1 - v) / (y1 - y0) * (H - T - B); };
    var g = '', n, v;
    for (n = 0; n <= 4; n++) {
      v = y0 + (y1 - y0) * n / 4;
      g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + Math.round(v).toLocaleString('fr-BE') + ' €</text>';
    }
    for (n = 0; n <= 3; n++) {
      v = x0 + (x1 - x0) * n / 3;
      g += '<text class="ax" x="' + X(v) + '" y="' + (H - 8) + '" text-anchor="' + (n === 0 ? 'start' : n === 3 ? 'end' : 'middle') + '">' + Math.round(v) + ' €/j</text>';
    }
    var line = pts.map(function (p) { return X(p.daily).toFixed(1) + ',' + Y(p.net).toFixed(1); }).join(' ');
    var cp = pts.filter(function (p) { return p.mult === 1; })[0];
    var bx = X(best.daily), anchor = bx > W - 90 ? 'end' : 'middle';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Courbe du bénéfice net selon le budget">' + g +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="var(--text)" stroke-dasharray="4 3" opacity=".6"/>' +
      '<polyline points="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>' +
      (cp ? '<circle cx="' + X(cp.daily) + '" cy="' + Y(cp.net) + '" r="5" fill="var(--card)" stroke="var(--accent)" stroke-width="2.5"/><text class="ax" x="' + X(cp.daily) + '" y="' + (Y(cp.net) + 20) + '" text-anchor="middle">actuel</text>' : '') +
      '<circle cx="' + bx + '" cy="' + Y(best.net) + '" r="5" fill="var(--s-profit)"/><text class="ax" x="' + bx + '" y="' + (Y(best.net) - 10) + '" text-anchor="' + anchor + '">max</text></svg>';
  }

  /* ----- Suivi réel contre prévision ----- */
  function today() {
    var d = new Date(), m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }
  function trackView() {
    var log = cur().log, s = S();
    if (!log.length) return '<section class="card"><p>Aucune journée saisie. Ajoutez vos dépenses pub, vos commandes et votre chiffre d’affaires du jour : l’application les compare à vos hypothèses et vous dit si le plan tient.</p></section>';
    var t = DropCalc.tracking(s, log), f = t.forecast;
    var gap = function (a, b) { return isFinite(a) && b > 0 ? (a / b - 1) : null; };
    var row = function (l, plan, real, fmt, better) {
      var g = gap(real, plan), good = g === null ? '' : ((better === 'low' ? g <= 0 : g >= 0) ? 'pos' : 'neg');
      return '<tr><td>' + l + '</td><td>' + fmt(plan) + '</td><td>' + fmt(real) + '</td><td class="' + good + '">' + (g === null ? '—' : (g > 0 ? '+' : '') + num(g * 100, 0) + ' %') + '</td></tr>';
    };
    var cpaGap = gap(t.cpa, f.cpa), msg;
    if (t.orders === 0) msg = 'Aucune commande sur la période : ' + eur(t.spend) + ' dépensés sans vente.';
    else if (cpaGap > 0.1) msg = 'Le CPA réel (' + eur(t.cpa) + ') dépasse le plan de ' + num(cpaGap * 100, 0) + ' %. Le résultat réel est ' + eur0(t.net) + ' contre ' + eur0(f.net) + ' prévus : revoyez les créas, le ciblage ou le budget.';
    else if (cpaGap < -0.1) msg = 'Le CPA réel (' + eur(t.cpa) + ') est meilleur que prévu. Vous pouvez tester une hausse de budget (voir l’onglet Mise à l’échelle).';
    else msg = 'Le CPA réel (' + eur(t.cpa) + ') est proche du plan. Résultat estimé : ' + eur0(t.net) + ' pour ' + eur0(f.net) + ' prévus.';
    var list = log.map(function (e) {
      return '<tr><td>' + esc(new Date(e.date + 'T12:00:00').toLocaleDateString('fr-BE')) + '</td><td>' + eur(e.spend) + '</td><td>' + num(e.orders, 0) + '</td><td>' + eur(e.revenue) +
        '</td><td><button type="button" data-del="' + e.id + '" aria-label="Supprimer cette journée">×</button></td></tr>';
    }).join('');
    return '<section class="card"><div class="verdict ' + (t.net >= f.net ? 'good' : 'bad') + '">' + msg + '</div><div class="wrap"><table><tr><th>Sur ' + t.days + ' jour' + (t.days > 1 ? 's' : '') + '</th><th>Prévu</th><th>Réel</th><th>Écart</th></tr>' +
      row('Dépense pub', f.spend, t.spend, eur0, 'low') + row('Commandes', f.orders, t.orders, function (v) { return num(v, 0); }, 'high') +
      row('CPA', f.cpa, t.cpa, eur, 'low') + row('Chiffre d’affaires TTC', f.revenue, t.revenue, eur0, 'high') +
      row('ROAS', f.roas, t.roas, function (v) { return num(v) + '×'; }, 'high') + row('Résultat avant impôt', f.net, t.net, eur0, 'high') + '</table></div>' +
      '<p class="note">Le résultat réel utilise votre panier moyen réel (' + eur(t.aov) + ') et prend en compte les coûts fixes au prorata des jours saisis.</p>' +
      (isFinite(t.cpa) ? '<div class="row noprint"><button id="usecpa" type="button">Utiliser le CPA réel dans les hypothèses</button></div>' : '') + '</section>' +
      '<section class="card"><h2>Journées saisies</h2><div class="wrap"><table><tr><th>Date</th><th>Pub</th><th>Commandes</th><th>CA TTC</th><th></th></tr>' + list + '</table></div></section>';
  }

  /* ----- Comparaison ----- */
  var METRICS = [
    ['Prix TTC', function (r, s) { return s.priceTTC; }, eur, null],
    ['Marge avant pub', function (r) { return r.contribution; }, eur, 'high'],
    ['CPA actuel', function (r) { return r.cpa; }, eur, 'low'],
    ['CPA limite', function (r) { return r.beCpa; }, eur, 'high'],
    ['ROAS actuel', function (r) { return r.roas; }, function (v) { return num(v) + '×'; }, 'high'],
    ['ROAS point mort', function (r) { return r.beRoas; }, function (v) { return num(v) + '×'; }, 'low'],
    ['Bénéfice / commande', function (r) { return r.profitPerOrder; }, eur, 'high'],
    ['Commandes / mois', function (r) { return r.orders; }, function (v) { return num(v, 0); }, null],
    ['Bénéfice net / mois', function (r) { return r.net; }, eur0, 'high'],
    ['ROI sur budget pub', function (r) { return r.monthlyRoi; }, pct, 'high']];

  function compareView() {
    var items = db.cmp.map(function (id) { return db.items.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
    if (items.length < 2) return '<section class="card"><p>Cochez au moins deux produits à comparer. Créez-en un nouveau ou dupliquez-en un avec les boutons en haut de page.</p></section>';
    var rs = items.map(function (x) { return C(x.inputs); });
    var h = '<section class="card"><div class="wrap"><table><tr><th></th>' + items.map(function (x) { return '<th>' + esc(x.name || 'Sans nom') + '</th>'; }).join('') + '</tr>';
    METRICS.forEach(function (m) {
      var vals = rs.map(function (r, i) { return m[1](r, items[i].inputs); }), fin = vals.filter(isFinite), win = null;
      if (m[3] && fin.length) win = m[3] === 'high' ? Math.max.apply(null, fin) : Math.min.apply(null, fin);
      h += '<tr><td>' + m[0] + '</td>' + vals.map(function (v) { return '<td' + (win !== null && v === win ? ' class="best"' : '') + '>' + m[2](v) + '</td>'; }).join('') + '</tr>';
    });
    return h + '</table></div><p class="note">La case verte marque la meilleure valeur de chaque ligne.</p>' +
      '<div class="row noprint"><button id="pdf" type="button">Exporter en PDF</button></div></section>';
  }

  /* ----- Export CSV ----- */
  function exportCsv() {
    var s = S(), r = C(s);
    var rows = [['Paramètre', 'Valeur']].concat(Object.keys(s).map(function (k) { return [k, s[k]]; }), [['—', '—']],
      Object.keys(r).map(function (k) { return [k, r[k] === null ? '' : isFinite(r[k]) ? +r[k].toFixed(4) : 'inf']; }));
    var blob = new Blob(['﻿' + rows.map(function (x) { return x.join(';'); }).join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'rentabilite-' + (cur().name || 'produit').replace(/[^\w-]+/g, '_') + '.csv'; a.click();
  }

  buildScenarios(); buildInputs(); buildTab(); render();

  /*SW*/
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
  /*ENDSW*/
})();
