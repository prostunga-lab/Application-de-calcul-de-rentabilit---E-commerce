# Calculateur de rentabilité Dropshipping + Meta Ads

Application web statique, sans dépendance : ouvrez `index.html` dans un navigateur.

- `calc.js` : moteur de calcul (fonctions pures). `node calc.test.js` lance les tests.
- Calcule marge avant pub, CPA/ROAS actuels et de point mort, bénéfice par commande,
  projection mensuelle (budget, commandes, coûts fixes, impôt) et une grille de sensibilité CVR × CPM.
- Les hypothèses sont sauvegardées dans le navigateur (localStorage) ; export CSV disponible.
