const assert = require('assert');
const I = require('./importer');
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-6, `${m}: ${a} != ${b}`);

// Nombres et dates
near(I.parseNumber('1.234,56 €'), 1234.56, 'FR'); near(I.parseNumber('1,234.56'), 1234.56, 'EN');
near(I.parseNumber('12,5'), 12.5, 'virgule'); near(I.parseNumber('1 234,5'), 1234.5, 'espaces'); near(I.parseNumber('€45.00'), 45, 'devise');
assert(isNaN(I.parseNumber('')));
assert.equal(I.parseDate('2026-01-05 14:23:11 +0100'), '2026-01-05'); assert.equal(I.parseDate('05/01/2026'), '2026-01-05');
assert.equal(I.parseDate('01/25/2026'), '2026-01-25'); assert.equal(I.parseDate('abc'), null);

// CSV : guillemets, retours à la ligne dans une cellule, BOM, séparateur point-virgule
let rows = I.parseCsv('﻿a;b\r\n"x;1";"ligne1\nligne2"\n');
assert.deepEqual(rows, [['a', 'b'], ['x;1', 'ligne1\nligne2']]);

// Shopify : 2 lignes d'articles pour #1001, une commande annulée, un remboursement partiel, un remboursement total
const shop = [
  'Name,Email,Financial Status,Created at,Subtotal,Shipping,Taxes,Total,Refunded Amount,Cancelled at,Lineitem name',
  '#1001,a@x.be,paid,2026-03-01 10:00:00 +0100,40,5,9.45,54.45,0,,"Gadget, bleu"',
  '#1001,,,,,,,,,,Étui',
  '#1002,b@x.be,paid,2026-03-01 18:30:00 +0100,30,0,6.30,36.30,10,,Gadget',
  '#1003,c@x.be,voided,2026-03-02 09:00:00 +0100,30,0,6.3,36.30,0,2026-03-02 10:00:00 +0100,Gadget',
  '#1004,d@x.be,refunded,2026-03-02 11:00:00 +0100,30,0,6.3,36.30,36.30,,Gadget',
  '#1005,e@x.be,paid,2026-03-02 12:00:00 +0100,50,0,10.5,60.50,0,,Gadget'].join('\n');
let s = I.shopify(shop);
near(s.days, 2, 'jours Shopify'); near(s.daily['2026-03-01'].orders, 2, 'commandes 1er mars');
near(s.daily['2026-03-01'].revenue, 54.45 + 26.30, 'CA 1er mars (remboursement partiel déduit)');
near(s.daily['2026-03-02'].orders, 1, 'annulée et remboursée exclues'); near(s.daily['2026-03-02'].revenue, 60.5, 'CA 2 mars');
assert.deepEqual(s.skipped, { cancelled: 1, refunded: 1, invalid: 0 });
assert(I.shopify('foo,bar\n1,2').error, 'colonnes manquantes');

// Meta (export français, point-virgule, virgule décimale, ligne de total ignorée)
const met = ['Jour;Montant dépensé (EUR);Achats;Valeur de conversion des achats;Coût par achat',
  '2026-03-01;"1 234,50";10;"650,00";"123,45"', '2026-03-02;80,25;3;162,5;26,75', 'Total;1314,75;13;812,5;'].join('\n');
let m = I.meta(met);
near(m.days, 2, 'jours Meta'); near(m.daily['2026-03-01'].spend, 1234.5, 'dépense'); near(m.daily['2026-03-01'].purchases, 10, 'achats (pas le coût)');
near(m.daily['2026-03-02'].value, 162.5, 'valeur'); near(m.totals.spend, 1314.75, 'total dépense');
const en = I.meta('Day,Amount spent (EUR),Purchases,Purchases conversion value\n2026-03-01,50.5,2,98');
near(en.daily['2026-03-01'].spend, 50.5, 'EN'); near(en.daily['2026-03-01'].value, 98, 'EN valeur');
assert(I.meta('a,b\n1,2').error);

// Fusion : la dépense Meta s'ajoute aux commandes Shopify sans les écraser ; un journal existant est mis à jour.
let n = 0; const id = () => 'id' + (++n);
let r = I.mergeIntoLog([{ id: 'old', date: '2026-03-01', spend: 5, orders: 9, revenue: 99 }], [s, m], id);
const d1 = r.log.find(e => e.date === '2026-03-01');
near(d1.spend, 1234.5, 'dépense remplacée'); near(d1.orders, 2, 'commandes Shopify'); near(r.log.length, 2, 'une entrée par date');
assert.equal(r.updated, 1); assert.equal(r.added, 1);
// Meta seul avec achats Meta
m.usePurchases = true; r = I.mergeIntoLog([], [m], id);
near(r.log.find(e => e.date === '2026-03-02').orders, 3, 'achats Meta'); assert.equal(r.log[0].date, '2026-03-02', 'tri décroissant');
// Meta seul sans achats : conserve les commandes existantes
m.usePurchases = false; r = I.mergeIntoLog([{ id: 'o', date: '2026-03-02', spend: 1, orders: 4, revenue: 40 }], [m], id);
near(r.log.find(e => e.date === '2026-03-02').orders, 4, 'commandes conservées');
console.log('OK importer');
