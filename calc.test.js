const assert = require('assert');
const { compute } = require('./calc');
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-6, `${m}: ${a} != ${b}`);

// Cas simple, sans remboursement ni frais : 121 TTC, TVA 21 % => 100 HT.
let r = compute({ priceTTC: 121, shippingCharged: 0, vat: 21, productCost: 30, supplierShipping: 10,
  otherPerOrder: 0, payPct: 0, payFixed: 0, platformPct: 0, refundRate: 0, adMode: 'direct', cpaDirect: 20,
  dailyBudget: 100, days: 30, fixedMonthly: 0, taxRate: 0 });
near(r.revHT, 100, 'revHT'); near(r.contribution, 60, 'contribution');
near(r.profitPerOrder, 40, 'profit/commande'); near(r.beRoas, 121 / 60, 'ROAS point mort');
near(r.orders, 150, 'commandes'); near(r.net, 150 * 60 - 3000, 'net');

// Entonnoir : CPM 10, CTR 2 % => CPC 0,5 ; CVR 2,5 % => CPA 20.
r = compute({ adMode: 'funnel', cpm: 10, ctr: 2, cvr: 2.5 });
near(r.cpc, 0.5, 'CPC'); near(r.cpa, 20, 'CPA');

// Remboursements : 10 % réduisent le CA, frais de paiement conservés.
r = compute({ priceTTC: 121, shippingCharged: 0, productCost: 0, supplierShipping: 0, otherPerOrder: 0,
  payPct: 3, payFixed: 0, platformPct: 0, refundRate: 10 });
near(r.contribution, 90 - 3.63, 'remboursements');

// Division par zéro : CVR 0 => CPA infini, pas de commande.
r = compute({ cvr: 0 }); assert(r.cpa === Infinity && r.orders === 0);
// Objectif : 150 commandes rapportent 40 € chacune ; pour 6000 € net il en faut 150.
const C = require('./calc');
const base = { priceTTC: 121, shippingCharged: 0, vat: 21, productCost: 30, supplierShipping: 10, otherPerOrder: 0,
  payPct: 0, payFixed: 0, platformPct: 0, refundRate: 0, adMode: 'direct', cpaDirect: 20,
  dailyBudget: 100, days: 30, fixedMonthly: 0, taxRate: 0 };
let g = C.reverse(base, 6000);
near(g.orders, 150, 'objectif commandes'); near(g.spend, 3000, 'objectif budget'); near(g.dailyBudget, 100, 'budget/jour');
g = C.reverse(Object.assign({}, base, { fixedMonthly: 400, taxRate: 20 }), 4800);
near(g.orders, (4800 / 0.8 + 400) / 40, 'objectif avec impôt et coûts fixes');
assert(!C.reverse(Object.assign({}, base, { cpaDirect: 70 }), 1000).feasible);

// Prix minimum : marge nette visée 0 % => bénéfice par commande nul.
const p = C.minPrice(base, 0); near(p, 72.6, 'prix minimum');
const chk = C.compute(Object.assign({}, base, { priceTTC: p })); near(chk.profitPerOrder, 0, 'profit au prix minimum');
const p2 = C.minPrice(base, 25); const c2 = C.compute(Object.assign({}, base, { priceTTC: p2 }));
near(c2.profitPerOrder / c2.revHT, 0.25, 'marge visée atteinte');
near(C.maxCpa(base, 0), 60, 'CPA max'); near(C.maxCpa(base, 20), 40, 'CPA max avec marge');

// Mise à l'échelle : 0 % de hausse => CPA constant ; 100 % => CPA x2 quand le budget double.
let sc = C.scaleCurve(base, [1, 2]); near(sc[0].net, C.compute(base).net, 'échelle x1');
sc = C.scaleCurve(Object.assign({}, base, { cpaGrowth: 0 }), [2]); near(sc[0].cpa, 20, 'CPA constant');
sc = C.scaleCurve(Object.assign({}, base, { cpaGrowth: 100 }), [2]); near(sc[0].cpa, 40, 'CPA x2');
console.log('OK');
