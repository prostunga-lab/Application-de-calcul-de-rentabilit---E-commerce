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
console.log('OK');
