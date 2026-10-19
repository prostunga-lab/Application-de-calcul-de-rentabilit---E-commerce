# Calcul rentabilité E-commerce et Meta ads

Application web sans serveur ni dépendance, pour mesurer la rentabilité d'une boutique en dropshipping qui fait de la publicité Meta Ads.

## Fonctionnalités
- **Plusieurs produits / scénarios** : créer, dupliquer, renommer, supprimer. Tout est sauvegardé dans le navigateur.
- **Calculateur** : marge avant pub, CPA et ROAS actuels et de point mort, bénéfice par commande, projection mensuelle, répartition de chaque euro encaissé, grille de sensibilité CVR × CPM.
- **Objectif** : commandes, budget et chiffre d'affaires nécessaires pour un bénéfice net visé ; CPA maximal et prix minimal pour une marge visée.
- **Mise à l'échelle** : courbe du bénéfice selon le budget quotidien avec hausse du CPA paramétrable.
- **Comparer** : jusqu'à 4 produits côte à côte, meilleure valeur surlignée.
- **Export** PDF (impression) et CSV.
- **Installable** sur téléphone et ordinateur (PWA) et utilisable hors ligne.

## Utilisation
Ouvrez `index.html`, ou servez le dossier avec n'importe quel hébergement statique (GitHub Pages, Netlify, Cloudflare Pages).
L'installation et le mode hors ligne demandent une adresse `https://` (ou `localhost`).

## Développement
- `calc.js` : moteur de calcul (fonctions pures). `node calc.test.js` lance les tests.
- `app.js`, `style.css`, `index.html` : interface. `sw.js` et `manifest.webmanifest` : PWA. Si vous modifiez les fichiers, changez le numéro de `CACHE` dans `sw.js` pour forcer la mise à jour.
