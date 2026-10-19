/* Moteur de calcul de rentabilité dropshipping + Meta Ads (fonctions pures). */
(function (root) {
  var DEFAULTS = {
    priceTTC: 49.9, shippingCharged: 0, vat: 21,
    productCost: 8, supplierShipping: 3, otherPerOrder: 0.5,
    payPct: 2.9, payFixed: 0.3, platformPct: 0,
    refundRate: 5, costRecovery: 0,
    adMode: 'funnel', cpm: 10, ctr: 1.5, cvr: 3, cpaDirect: 22,
    dailyBudget: 100, days: 30, fixedMonthly: 80, taxRate: 0
  };

  function n(v) { v = Number(v); return isFinite(v) ? v : 0; }

  function compute(inp) {
    var i = {}, k;
    for (k in DEFAULTS) i[k] = (inp && inp[k] !== undefined) ? inp[k] : DEFAULTS[k];
    var vat = n(i.vat) / 100;
    var revTTC = n(i.priceTTC) + n(i.shippingCharged);
    var revHT = revTTC / (1 + vat);
    var refund = n(i.refundRate) / 100;
    var recov = n(i.costRecovery) / 100;

    var netRevenue = revHT * (1 - refund);
    var productCosts = (n(i.productCost) + n(i.supplierShipping)) * (1 - refund * recov);
    // Les frais de paiement ne sont pas remboursés lors d'un remboursement client.
    var payFees = n(i.payPct) / 100 * revTTC + n(i.payFixed);
    var platformFees = n(i.platformPct) / 100 * revTTC;
    var other = n(i.otherPerOrder);

    var contribution = netRevenue - productCosts - payFees - platformFees - other;

    var cpc = null, cpa;
    if (i.adMode === 'direct') {
      cpa = n(i.cpaDirect);
    } else {
      var ctr = n(i.ctr) / 100, cvr = n(i.cvr) / 100;
      cpc = ctr > 0 ? n(i.cpm) / (1000 * ctr) : Infinity;
      cpa = cvr > 0 ? cpc / cvr : Infinity;
    }

    var profitPerOrder = contribution - cpa;
    var beRoas = contribution > 0 ? revTTC / contribution : Infinity;
    var roas = cpa > 0 && isFinite(cpa) ? revTTC / cpa : 0;

    var spend = n(i.dailyBudget) * n(i.days);
    var orders = isFinite(cpa) && cpa > 0 ? spend / cpa : 0;
    var revenueTTC = orders * revTTC;
    var preTax = orders * contribution - spend - n(i.fixedMonthly);
    var tax = preTax > 0 ? preTax * n(i.taxRate) / 100 : 0;
    var net = preTax - tax;

    // Commandes nécessaires pour couvrir les coûts fixes à CPA donné.
    var unit = profitPerOrder;
    var ordersToBE = unit > 0 ? n(i.fixedMonthly) / unit : Infinity;

    return {
      revTTC: revTTC, revHT: revHT, netRevenue: netRevenue, productCosts: productCosts,
      payFees: payFees, platformFees: platformFees, other: other,
      contribution: contribution, contributionPct: revHT > 0 ? contribution / revHT : 0,
      cpc: cpc, cpa: cpa, beCpa: contribution, beRoas: beRoas, roas: roas,
      profitPerOrder: profitPerOrder, spend: spend, orders: orders,
      revenueTTC: revenueTTC, preTax: preTax, tax: tax, net: net,
      netMarginPct: revenueTTC > 0 ? net / (revenueTTC / (1 + vat)) : 0,
      ordersToBE: ordersToBE, monthlyRoi: spend > 0 ? net / spend : 0
    };
  }

  var api = { DEFAULTS: DEFAULTS, compute: compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DropCalc = api;
})(typeof window !== 'undefined' ? window : this);
