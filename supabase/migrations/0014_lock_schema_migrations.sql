-- schema_migrations est une table technique interne (suivi des migrations déjà appliquées,
-- créée par le script d'exécution, pas par PostgREST) : sans RLS, elle reste lisible via
-- l'API REST par n'importe quel rôle disposant d'un GRANT par défaut sur le schéma public.
-- Aucune policy n'est ajoutée volontairement : seuls postgres/service_role (qui bypassent le
-- RLS) doivent jamais y toucher.
alter table public.schema_migrations enable row level security;
