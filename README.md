# e-Avo

Plateforme e-learning multi-établissements (écoles de langues, extensible sciences/technique).

## Stack

React 19 + Vite + TypeScript, `react-router-dom`, Supabase (Postgres + Auth + RLS), déploiement Vercel (SPA + fonctions serverless dans `api/`). Pas de Tailwind ni de CSS-in-JS : variables CSS dans `src/index.css` + styles inline sur les composants.

## Démarrage local

```bash
npm install
cp .env.example .env.local   # renseigner VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

## Base de données

Les migrations SQL vivent dans `supabase/migrations/`, numérotées et appliquées dans l'ordre. Elles couvrent pour l'instant :

- **Socle** (`0001`-`0004`) : établissements, profils, RLS de base.
- **Acquisition** (`0005`-`0006`) : pipeline prospects, appels diagnostic.
- **Cœur pédagogique** (`0007`-`0013`) : historique professeur/élève, séances, inscriptions, forfaits, compteur d'heures, séances vidéo (stub — prestataire réel à intégrer plus tard).

Pour les appliquer sur le projet Supabase du client : `supabase db push` (ou coller le contenu de chaque fichier dans l'éditeur SQL du tableau de bord Supabase, dans l'ordre).

Après application, régénérer les types réels (remplace `src/types/database.types.ts`, écrit à la main en attendant) :

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
```

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — vérification des types puis build de production
- `npm run lint` — oxlint
- `npm test` — vitest

## Sécurité

- La clé secrète Supabase (`SUPABASE_SECRET_KEY`) n'est utilisée que côté serveur, dans `api/`, jamais dans le bundle client.
- Le rôle d'un profil n'est jamais déterminé depuis les métadonnées envoyées par le client à l'inscription (voir `supabase/migrations/0002_profiles_and_trigger.sql`) — toute promotion passe par `api/_lib/adminAuth.ts`.
