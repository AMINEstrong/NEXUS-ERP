# Guide d'utilisation — NEXUS ERP

Ce guide explique comment installer, démarrer et utiliser l'application NEXUS ERP
telle qu'elle existe dans ce dépôt. Il ne décrit pas de fonctionnalités qui ne sont
pas encore implémentées (voir la section « Limites actuelles »).

---

## 1. Prérequis

| Outil | Version |
| --- | --- |
| Node.js | 22.18+ (24.x recommandé) |
| pnpm | 10.34.9 (via Corepack) |
| Docker | Docker Engine + plugin Compose |
| PostgreSQL | Fourni par Docker Compose (PostgreSQL 17) |
| Navigateur | Chrome, Edge, Firefox ou Safari récent |

Les commandes ci-dessous sont données pour **PowerShell (Windows)**. Sous macOS/Linux,
remplacez `Copy-Item` par `cp`.

---

## 2. Installation locale

```powershell
# 1. Se placer à la racine du dépôt
cd nexus-erp

# 2. Créer le fichier d'environnement local
Copy-Item .env.example .env

# 3. Éditer .env et définir des valeurs locales uniques :
#    POSTGRES_PASSWORD, POSTGRES_APP_PASSWORD, POSTGRES_MIGRATOR_PASSWORD,
#    DEMO_USER_PASSWORD (12 caractères minimum)
#    Ne jamais réutiliser ces valeurs en production.

# 4. Activer pnpm
corepack prepare pnpm@10.34.9 --activate

# 5. Installer les dépendances
pnpm install

# 6. Démarrer PostgreSQL et Redis
docker compose up -d postgres redis

# 7. Préparer la base de données
pnpm db:generate
pnpm db:deploy
pnpm db:seed
```

`pnpm db:seed` crée :

- un utilisateur de démonstration (celui défini par `DEMO_USER_EMAIL` /
  `DEMO_USER_PASSWORD` dans `.env`) ;
- deux entreprises : **Atlas Manufacturing** et **Rif Commerce** ;
- des rôles, permissions, entrepôts, articles, clients, prospects, opportunités,
  activités et un devis de démonstration dans chaque entreprise.

> Le mot de passe de démonstration n'est jamais affiché par le seed. Utilisez la
> valeur que vous avez saisie dans `.env`.

### Initialisation de PostgreSQL

Le script `infra/docker/postgres/01-create-roles.sh` crée les rôles `nexus_app`
et `nexus_migrator`. Il ne s'exécute **qu'à la création initiale du volume**.
Si vous changez les mots de passe après coup, mettez-les à jour dans PostgreSQL
ou repartez d'un volume neuf (voir « Réinitialiser » plus bas).

---

## 3. Démarrer l'application

Deux options :

```powershell
# Option A — les deux services dans un seul terminal
pnpm dev
```

```powershell
# Option B — un terminal par service
pnpm dev:api   # terminal 1
pnpm dev:web   # terminal 2
```

| Service | URL locale |
| --- | --- |
| Application web | http://localhost:3001 |
| API (santé) | http://localhost:4001/api/v1/health |
| Documentation API (Swagger) | http://localhost:4001/api/docs |

Swagger n'est disponible qu'en dehors de la production.

> Les valeurs `WEB_PORT` / `API_PORT` de `.env.example` correspondent au
> développement local. L'API utilise `API_PORT` (4001 par défaut) et le client
> web `NEXT_PUBLIC_API_URL` (http://localhost:4001/api/v1).

---

## 4. Se connecter

1. Ouvrez http://localhost:3001.
2. Cliquez sur **Se connecter** (ou allez sur `/login`).
3. Utilisez `DEMO_USER_EMAIL` et `DEMO_USER_PASSWORD` définis dans `.env`.

### Créer un nouveau compte

1. Allez sur `/register`.
2. Renseignez votre nom, votre e-mail, un mot de passe de 12 caractères minimum,
   le nom de l'entreprise et sa devise.
3. En développement, la réponse affiche un **lien de vérification** : ouvrez-le
   pour activer le compte, puis connectez-vous.

> En production, l'envoi d'e-mails n'est pas encore branché. La vérification
> d'e-mail et la réinitialisation de mot de passe ne peuvent donc pas être
> réalisées en autonomie tant que la tâche « Email delivery » de la Phase 1
> n'est pas livrée.

### Mot de passe oublié

Le lien `/forgot-password` génère un jeton. En développement, le lien de
réinitialisation est renvoyé dans la réponse API. En production, il faudra
attendre l'intégration du fournisseur e-mail.

---

## 5. Découvrir l'interface

Après connexion, vous arrivez dans l'espace privé `/app`.

| Menu | URL | Rôle |
| --- | --- | --- |
| Tableau de bord | `/app` | KPI, graphiques, recherche globale, notifications |
| CRM | `/app/crm` | Clients, prospects, opportunités, activités |
| Inventaire | `/app/inventory` | Articles, entrepôts, réceptions, transferts, mouvements |
| Ventes | `/app/sales` | Devis, commandes, livraisons, factures, paiements |
| Entreprises | `/app/companies` | Liste et création d'entreprises |
| Rôles et accès | `/app/roles` | Rôles, permissions, affectation aux membres |
| Paramètres | `/app/settings` | Profil de l'entreprise, langue, fuseau, devise |
| Sécurité | `/app/security` | Sessions actives et révocation |

### Changer d'entreprise

- Menu **Entreprises** → sélectionnez **Atlas Manufacturing** ou **Rif Commerce**.
- La sélection est stockée sur la session courante ; elle ne change pas votre
  appartenance réelle aux entreprises.
- Toutes les données affichées (CRM, stock, ventes, tableau de bord) sont
  limitées à l'entreprise active.

### Changer de langue

Le sélecteur de langue (en-tête) propose **English**, **Français**, **العربية**
et **Deutsch**. Le choix est mémorisé dans le navigateur et, si vous êtes
connecté, sur votre profil. L'arabe bascule l'interface en RTL.

---

## 6. Scénarios d'utilisation

### 6.1 CRM — créer un client et une opportunité

1. **CRM** → **Clients** → **Nouveau**.
2. Renseignez le code, le nom, le type (client ou prospect), le contact,
   l'e-mail, la ville et le pays.
3. Enregistrez : la fiche apparaît dans la liste paginée et recherchable.
4. Onglet **Opportunités** → **Nouvelle** : associez le client, le montant,
   l'étape du pipeline et la probabilité.
5. Onglet **Activités** → **Nouvelle** : créez une tâche ou un rendez-vous,
   puis marquez-la comme terminée.

Les KPI CRM (nombre de clients, pipeline, activités en retard) se mettent à jour
dans le résumé de la page.

### 6.2 Inventaire — articles, réception, transfert

1. **Inventaire** → **Articles** → **Nouvel article** : SKU, nom, unité,
   coût unitaire, point de commande.
2. **Entrepôts** → **Nouvel entrepôt** : code et nom.
3. **Réception** : choisissez l'entrepôt, l'article et la quantité reçue.
   Le stock et le journal des mouvements sont mis à jour dans la même
   transaction.
4. **Transfert** : choisissez l'entrepôt source, l'entrepôt destination,
   l'article et la quantité. Un transfert supérieur au stock disponible est
   refusé.
5. **Mouvements** : liste en lecture seule de tous les mouvements (réception,
   transfert, sortie de stock liée à une livraison).

### 6.3 Ventes — du devis au paiement

Le cycle implémenté est : **devis → commande → livraison → facture → paiement**.

1. **Ventes** → **Devis** → **Nouveau** : client, lignes, quantité, prix
   unitaire, taux de TVA.
2. **Envoyer** le devis (statut « envoyé »).
3. **Convertir** le devis en commande. La conversion verrouille les lignes.
4. **Livrer** la commande : choisissez l'entrepôt. Le stock est décrémenté et un
   mouvement `ISSUE` est créé. La livraison partielle est supportée.
5. **Facturer** la commande : une facture est créée avec une écriture comptable
   équilibrée (client, produit, TVA).
6. **Encaisser** un paiement sur la facture : le solde et une écriture de
   trésorerie sont enregistrés.

Le seed fournit déjà un devis de démonstration dans chaque entreprise.

### 6.4 Rôles et permissions

1. **Rôles et accès** → créez un rôle personnalisé ou dupliquez un rôle système.
2. Cochez les permissions par module et action (créer, lire, mettre à jour,
   supprimer, approuver, exporter, gérer).
3. Affectez un ou plusieurs rôles à un membre.
4. Les permissions effectives sont l'**union de tous les rôles actifs**.
   Le propriétaire de l'entreprise conserve toujours toutes les permissions
   métier ; les permissions de plateforme ne sont jamais accordées.

Garde-fous : impossible de modifier ses propres rôles, de s'octroyer une
permission que l'on ne possède pas, ou de retirer le dernier propriétaire actif.

### 6.5 Sécurité du compte

**Sécurité** liste les sessions actives et permet de révoquer une session.
Révoquer la session courante vous déconnecte immédiatement.

---

## 7. Arrêter et réinitialiser

```powershell
# Arrêter les services applicatifs (Ctrl+C dans chaque terminal)

# Arrêter PostgreSQL et Redis
docker compose stop

# Tout arrêter et supprimer les conteneurs
docker compose down
```

### Réinitialiser complètement la base de démonstration (DESTRUCTIF)

```powershell
docker compose down -v
docker compose up -d postgres redis
pnpm db:deploy
pnpm db:seed
```

`-v` supprime les volumes PostgreSQL et Redis. **Toutes les données locales sont
perdues.** Ne l'exécutez jamais sur une base contenant des données réelles.

---

## 8. Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `EADDRINUSE` au démarrage | Port 3001 ou 4001 déjà utilisé | Arrêter l'autre processus ou changer `WEB_PORT` / `API_PORT` |
| `P1001` / connexion refusée | PostgreSQL non démarré | `docker compose up -d postgres` puis vérifier `docker compose ps` |
| `P3014` avec `prisma migrate dev` | Le rôle migrateur ne peut pas créer de « shadow database » | Utiliser `pnpm db:deploy` (migrations déjà écrites) |
| 401 après connexion | Cookie non envoyé, API différente, ou session expirée | Vérifier `NEXT_PUBLIC_API_URL`, `WEB_ORIGIN`, les cookies du navigateur |
| Page vide / erreur de session | L'API n'est pas joignable côté serveur Next.js | Vérifier que l'API tourne sur le port attendu |
| E-mails absents en production | Aucun fournisseur e-mail n'est encore configuré | Voir la Phase 1, tâche « Email delivery » |
| `migrate deploy` sans effet | Base déjà à jour ou mauvais `MIGRATION_DATABASE_URL` | Vérifier l'URL et `docker compose logs postgres` |

Journaux utiles :

```powershell
docker compose logs -f postgres redis
```

---

## 9. Limites actuelles (à connaître avant toute démonstration)

- **Pas d'envoi d'e-mail en production** : vérification de compte et
  réinitialisation de mot de passe dépendent d'un lien affiché uniquement en
  développement.
- **MFA non disponible** : les champs existent en base, mais la connexion refuse
  les comptes MFA.
- **Comptabilité incomplète** : écritures de facture et de paiement uniquement ;
  pas de coût des marchandises vendues, pas de clôture, pas d'états financiers.
- **Pas d'achats / fournisseurs / dettes fournisseurs.**
- **Pas de retours, avoirs, annulation de commande ou PDF.**
- **Pas de RH, projets, fabrication, reporting/export.**
- **Pas de conformité marocaine** (ICE, IF, RC, TVA déclarative, CNSS).
- **Pas encore de sauvegarde/restauration testée** ni d'observabilité complète.
- **L'application n'est pas encore prête pour une exposition publique.**
  Utilisez-la en local ou dans un environnement de démonstration contrôlé.

L'audit complet et la feuille de route se trouvent dans
`docs/NEXUS-ERP-FULL-AUDIT.md`. L'avancement de la Phase 1 est suivi dans
`docs/PHASE-1-IMPLEMENTATION-REPORT.md`.
