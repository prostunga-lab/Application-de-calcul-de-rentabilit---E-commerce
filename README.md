# Calcul rentabilité E-commerce et Meta ads

Application web sans serveur ni dépendance, pour mesurer la rentabilité d'une boutique en dropshipping qui fait de la publicité Meta Ads.

## Fonctionnalités
- **Plusieurs produits / scénarios** : créer, dupliquer, renommer, supprimer. Tout est sauvegardé dans le navigateur.
- **Calculateur** : marge avant pub, CPA et ROAS actuels et de point mort, bénéfice par commande, projection mensuelle, répartition de chaque euro encaissé, grille de sensibilité CVR × CPM.
- **Objectif** : commandes, budget et chiffre d'affaires nécessaires pour un bénéfice net visé ; CPA maximal et prix minimal pour une marge visée.
- **Mise à l'échelle** : courbe du bénéfice selon le budget quotidien avec hausse du CPA paramétrable.
- **Comparer** : jusqu'à 4 produits côte à côte, meilleure valeur surlignée.
- **Suivi** : saisie jour par jour de la dépense pub, des commandes et du chiffre d'affaires, comparée au plan (CPA, ROAS, résultat), avec reprise du CPA réel dans les hypothèses.
- **Import CSV** dans le Suivi : export des commandes Shopify (Commandes → Exporter) et rapport Meta Ads ventilé par « Jour » (colonne « Montant dépensé »). Annulations et remboursements totaux exclus, remboursements partiels déduits. Lecture locale, seuls les totaux par jour sont conservés.
- **Sauvegarde / restauration JSON** de tous les produits et de leur suivi, pour passer d'un appareil à l'autre sans compte.
- **Comptes et synchronisation** (facultatif, Supabase) : e-mail + mot de passe, vos produits et leur suivi se retrouvent sur tous vos appareils. Fusion par produit (le plus récent gagne, les suppressions se propagent), fonctionnement hors ligne puis envoi au retour du réseau. Sans configuration, l'application reste 100 % locale.
- **Coûts détaillés** : litiges (chargebacks) et leurs frais, frais de retour, TVA par pays (taux normaux indicatifs).
- **Export** PDF (impression) et CSV.
- **Installable** sur téléphone et ordinateur (PWA) et utilisable hors ligne.

## Utilisation
Ouvrez `index.html`, ou servez le dossier avec n'importe quel hébergement statique (GitHub Pages, Netlify, Cloudflare Pages).
L'installation et le mode hors ligne demandent une adresse `https://` (ou `localhost`).

## Déploiement
Activez **Settings → Pages → Source : GitHub Actions** : chaque push sur `main` lance les tests puis publie le site (`.github/workflows/pages.yml`).

## Activer les comptes et la synchronisation (Supabase)
1. Créez un projet gratuit sur [supabase.com](https://supabase.com).
2. **SQL Editor** → collez le contenu de `supabase/schema.sql` → **Run** (crée la table et les règles de sécurité : chaque compte ne voit que ses données).
3. **Authentication → URL Configuration** : mettez dans *Site URL* l'adresse du site déployé (utile pour les e-mails de confirmation et de réinitialisation). Par défaut Supabase demande de confirmer l'e-mail à l'inscription ; vous pouvez le désactiver dans *Authentication → Providers → Email*. Le service d'e-mails intégré est limité en nombre d'envois par heure.
4. **Project Settings → API** : copiez *Project URL* et la clé publique **anon** dans `config.js`, puis poussez sur `main`.
5. Ne copiez **jamais** la clé `service_role` : elle contourne la sécurité. La clé `anon` est faite pour être publique.

Les données de chaque compte sont stockées dans une seule ligne JSON (`user_data`). Si deux appareils modifient le même produit en même temps, la version la plus récente est conservée.

## Développement
- `calc.js` : moteur de calcul (fonctions pures). `node calc.test.js`, `node importer.test.js` et `node sync.test.js` lancent les tests (`importer.js` : lecture des CSV Shopify et Meta ; `sync.js` : fusion des données et client Supabase).
- `app.js`, `style.css`, `index.html` : interface. `sw.js` et `manifest.webmanifest` : PWA. Si vous modifiez les fichiers, changez le numéro de `CACHE` dans `sw.js` pour forcer la mise à jour.
