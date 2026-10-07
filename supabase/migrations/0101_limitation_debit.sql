-- Limitation de débit des routes publiques (sans compte) — demande client du 2026-10-07, suite à
-- la revue de sécurité du même jour : aucune des 9 routes accessibles sans authentification
-- n'avait de garde-fou, vérifié par un test réel (12 appels d'affilée au même endpoint, tous
-- acceptés, 0 réponse 429).
--
-- Compteur en base plutôt qu'un service tiers (Redis/Upstash) : cohérent avec le reste du
-- projet, qui n'utilise que Supabase, et sans nouveau compte à faire souscrire au client pour
-- une fonctionnalité de cette taille.
--
-- Fenêtre fixe (pas de fenêtre glissante) : plus simple, et la différence ne compte pas ici — on
-- protège contre un abus grossier, pas contre un attaquant qui chronométrerait sa requête à la
-- seconde près pour doubler son quota à la frontière de deux fenêtres.
create table if not exists public.limites_debit (
  cle text primary key,
  compteur integer not null default 1,
  expire_le timestamptz not null
);

alter table public.limites_debit enable row level security;
-- Aucune policy : la table n'est JAMAIS lue ni écrite directement par un rôle REST (anon,
-- authenticated). Seule la fonction SECURITY DEFINER ci-dessous y touche, appelée par le serveur
-- (service_role) via RPC.

comment on table public.limites_debit is
  'Compteurs de débit des routes publiques, par IP hachée (jamais en clair). Accès exclusif via '
  'verifier_limite_debit() — ne jamais interroger ni modifier cette table directement.';

-- Incrémente le compteur de `p_cle` et répond s'il reste sous `p_max` sur la fenêtre de
-- `p_fenetre_secondes`. Un seul INSERT ... ON CONFLICT : l'opération est atomique, deux requêtes
-- simultanées pour la même clé ne peuvent donc pas se marcher dessus (ce qu'un SELECT puis
-- UPDATE séparés permettrait).
create or replace function public.verifier_limite_debit(
  p_cle text,
  p_max integer,
  p_fenetre_secondes integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_compteur integer;
  -- `clock_timestamp()`, jamais `now()` : `now()` reste figée à l'heure de DÉBUT de la
  -- transaction courante, ce qui ne pose aucun problème pour l'appel RPC isolé que fait
  -- `verifierDebit()` (chaque appel est sa propre transaction) mais romprait silencieusement le
  -- calcul d'expiration le jour où cette fonction serait appelée plusieurs fois dans une même
  -- transaction plus longue — constaté en vérifiant cette migration, où un test qui enchaînait
  -- plusieurs appels dans un seul `BEGIN` ne voyait jamais la fenêtre expirer.
  v_maintenant timestamptz := clock_timestamp();
begin
  insert into public.limites_debit as l (cle, compteur, expire_le)
  values (p_cle, 1, v_maintenant + make_interval(secs => p_fenetre_secondes))
  on conflict (cle) do update
    set compteur = case when l.expire_le < v_maintenant then 1 else l.compteur + 1 end,
        expire_le = case when l.expire_le < v_maintenant
                          then v_maintenant + make_interval(secs => p_fenetre_secondes)
                          else l.expire_le end
  returning compteur into v_compteur;

  -- Nettoyage opportuniste (~1 appel sur 100) : sans lui, la table grossirait indéfiniment, une
  -- ligne par IP hachée et par route jamais revue depuis sa fenêtre expirée.
  if random() < 0.01 then
    delete from public.limites_debit where expire_le < v_maintenant - interval '1 day';
  end if;

  return v_compteur <= p_max;
end;
$$;

-- Fonction interne : appelée par le serveur (service_role) via RPC, jamais par un navigateur.
-- Sans cette ligne elle serait exposée par défaut sur /rest/v1/rpc/verifier_limite_debit, ce qui
-- permettrait à n'importe qui de remettre à zéro — ou de consommer à la place d'autrui — le
-- compteur de n'importe quelle IP.
revoke execute on function public.verifier_limite_debit(text, integer, integer) from public, anon, authenticated;
