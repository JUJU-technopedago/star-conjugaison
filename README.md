# Les stars de la conjugaison

Application de quiz de conjugaison française, livrée en version statique pour GitHub Pages.

## Déploiement GitHub Pages

1. Pousser cette branche sur GitHub.
2. Dans GitHub, ouvrir les paramètres du dépôt.
3. Dans Pages, choisir la branche `gh-pages` et le dossier `/root`.
4. Le site sera disponible sur `https://juju-technopedago.github.io/star-conjugaison/`.

## Développement local

```powershell
cd frontend
npm install
npm run dev
```

## Synchroniser La Base Verbale (Excel)

Le fichier source de la whitelist est `base_verbes.xlsx` à la racine du projet.

Pour régénérer automatiquement les fichiers de config frontend/backend :

```powershell
cd backend
npm install
npm run sync:verb-base
```

La commande met à jour :

- `frontend/src/config/verbBase.generated.js`
- `frontend/src/config/a1Verbs.js`, `a2Verbs.js`, `b1Verbs.js`, `b2Verbs.js`, `c1Verbs.js`, `allowedVerbs.js`
- `backend/src/config/verbBase.generated.js`
- `backend/src/config/a1Verbs.js`, `a2Verbs.js`, `b1Verbs.js`, `b2Verbs.js`, `c1Verbs.js`, `allowedVerbs.js`
