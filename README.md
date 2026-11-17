# 🛍️ CAMPUS CORNER — Gestion de Stock, Ventes & Bénéfices

> Application web progressive (PWA) moderne, ultra-rapide et responsive, conçue pour les revendeurs de vêtements sur les campus (friperie, streetwear, drops d'articles vintage) avec suivi en FCFA.

---

## 📖 1. Compréhension & Fonctionnement du Projet

### Le concept initial
**Campus Corner** a été pensé pour un étudiant ou revendeur indépendant qui achète des vêtements en lots ou à l'unité, les organise par **Drops** (collections thématiques ou arrivages), et les revend à d'autres étudiants sur le campus.

### Le flux opérationnel :
1. **Achat / Entrée en stock** :
   - Enregistrement de chaque pièce avec sa photo (compressée automatiquement en local pour ne pas surcharger la mémoire).
   - Définition du Drop d'appartenance, de la taille, du prix d'achat et du prix de revente espéré.
2. **Suivi des pièces** :
   - Numérotation séquentielle claire (`#1`, `#2`, `#3`...).
   - Filtrage par collection (Drop) et statut (En stock / Vendu).
3. **Encaissement de la vente** :
   - Passage en un clic en statut « Vendu » avec enregistrement du prix réel et du nom de l'acheteur.
4. **Analyse de la rentabilité (Bilan)** :
   - Calcul automatique du Chiffre d'Affaires (CA), de la marge brute en FCFA et du taux de marge (ROI) par période et par Drop.
   - Évaluation du capital immobilisé et du bénéfice potentiel restant à réaliser sur le stock restant.

---

## 🚀 2. Améliorations Apportées (Version Pro)

| Aspect | Avant (Version brute) | Après (Version Pro) |
|---|---|---|
| **Point d'entrée** | Fichier unique `CAMPUS CORNER.html` incompatible direct Vercel | Architecture standardisée avec `index.html`, `vercel.json` prêt au déploiement |
| **Design & UI** | Interface basique, icônes texte rudimentaires (`▦`, `＋`, `◔`) | Design System moderne inspiré des apps fintech (Heroicons SVG, Glassmorphism, animations fluides) |
| **Thème** | Style fixe sans commutateur direct | **Mode Sombre & Mode Clair** avec bascule instantanée et mémorisation automatique |
| **Recherche & Filtres** | Filtrage limité à un Drop et un statut | **Recherche en temps réel** (par nom, numéro `#`, taille, acheteur), tri multiple (récent, prix, marge) et catégories (Hauts, Bas, Vestes...) |
| **Modification des pièces** | Impossible de corriger une faute ou un prix sans supprimer | **Édition complète** de toutes les pièces à tout moment |
| **Sauvegarde des données** | Bugué (`claude.use("downloads")` ne marchait pas dans les vrais navigateurs) | **Export JSON universel** en 1 clic + **Restauration** (avec option fusion ou écrasement) |
| **Comptabilité / Excel** | Aucun export tableur | **Export CSV complet** prêt pour Excel ou Google Sheets |
| **Terminal de Vente (POS)** | Date uniquement | **Date, Heure précise, Montant reçu, Calcul automatique de la Monnaie à rendre et Acomptes** |
| **Moyens de Paiement** | Non gérés | **Espèces, Wave, Orange Money, Moov/MTN MoMo, Virement / Carte bancaire** avec statistiques dédiées |
| **Ticket de Caisse / Reçu** | Aucun | **Génération de vrai ticket thermique**, impression directe PDF et partage en 1 clic sur WhatsApp |
| **Expérience Client** | Aucune | Fiche client avec coordonnées, numéro WhatsApp et historique détaillé des règlements |
| **Alertes & Modales** | `alert()` et `confirm()` natifs bloquants du navigateur | **Toasts non intrusifs** et **boîtes de dialogue modales élégantes** |
| **PWA & Hors-ligne** | Pas de manifest ni service worker | **PWA complète** (`manifest.webmanifest` + `sw.js`), 100% utilisable hors connexion sur iPhone et Android |

---

## 📁 3. Structure du Projet

```text
iboy/
├── index.html               # Page d'accueil officielle (racine Vercel)
├── vercel.json              # Configuration Vercel (Cache, Headers sécurité, PWA)
├── manifest.webmanifest     # Manifest PWA (installation mobile & icônes)
├── sw.js                    # Service Worker (fonctionnement hors-ligne autonome)
├── css/
│   └── style.css            # Styles modernes, variables CSS et dark/light mode
├── js/
│   ├── db.js                # Couche IndexedDB, exports JSON/CSV, import sécurisé
│   ├── ui.js                # Composants UI, système de Toasts, Modales et icônes SVG
│   └── app.js               # Logique applicative, gestion d'état, filtres et stats
└── assets/
    └── icon.svg             # Logo professionnel vectoriel
```

---

## 🌐 4. Déploiement sur Vercel (Prêt en 2 minutes)

Le projet est configuré pour être déployé directement sans aucune étape de compilation (Zero-Config Deployment).

### Option A : Déploiement via GitHub (Recommandé)
1. Créez un nouveau dépôt sur votre compte GitHub (ex: `campus-corner`).
2. Poussez les fichiers de ce dossier vers votre dépôt :
   ```bash
   git init
   git add .
   git commit -m "feat: Campus Corner Pro v2.0"
   git branch -M main
   git remote add origin https://github.com/VOTRE_PSEUDO/campus-corner.git
   git push -u origin main
   ```
3. Rendez-vous sur [vercel.com](https://vercel.com) et connectez-vous.
4. Cliquez sur **"Add New..."** > **"Project"**.
5. Importez votre dépôt GitHub `campus-corner`.
6. Laissez tous les réglages par défaut (Framework Preset : *Other*, Root Directory : `./`).
7. Cliquez sur **Deploy**. En moins de 15 secondes, votre application sera en ligne avec son URL `https://campus-corner-xxx.vercel.app` et certificat HTTPS gratuit !

### Option B : Déploiement direct avec Vercel CLI
Si vous avez installé Vercel CLI :
```bash
npm i -g vercel
vercel
```
Suivez les instructions à l'écran : le projet est déployé instantanément.

---

## 📱 5. Installation sur Mobile (iPhone & Android)

Une fois déployé sur votre URL Vercel :

- **Sur iPhone (Safari)** :
  1. Ouvrez votre URL Vercel dans Safari.
  2. Appuyez sur le bouton **Partager** (l'icône avec le carré et la flèche vers le haut).
  3. Sélectionnez **« Sur l'écran d'accueil »**.
  4. L'application s'ouvre désormais en plein écran comme une vraie application iOS native !

- **Sur Android (Chrome)** :
  1. Ouvrez votre URL Vercel dans Chrome.
  2. Un bandeau ou menu à 3 points vous proposera **« Installer l'application »** ou **« Ajouter à l'écran d'accueil »**.
  3. L'application s'installe avec son icône dédiée et fonctionnera même sans connexion internet.

---

## 🔒 6. Confidentialité et Données

Toutes vos données (photos, articles, prix, bénéfices) sont enregistrées **exclusivement dans le stockage local de votre navigateur (IndexedDB)**. Aucune donnée sensible n'est transmise à un serveur tiers. Pensez à utiliser le bouton **« Télécharger une sauvegarde JSON »** dans l'onglet **Options** régulièrement pour garder une copie de sécurité de vos comptes.

