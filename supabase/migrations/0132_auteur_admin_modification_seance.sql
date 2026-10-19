-- Demande client du 2026-10-19, capture à l'appui : l'historique d'une séance affichait
-- « Utilisateur inconnu » pour une modification pourtant faite par un admin. Cause : l'auteur
-- affiché (EditerSeancePlanifieeModale.tsx) est résolu en relisant `profiles` avec le client
-- authentifié, soumis aux policies RLS — et un admin plateforme (0022) garde une ligne `profiles`
-- normale, rattachée à SON établissement d'origine, pas forcément celui de la séance modifiée.
-- `profiles_admin_select_etablissement` (0004) filtre par établissement : un autre admin ne peut
-- alors pas lire cette ligne, même si l'acteur avait bien les pleins pouvoirs d'un administrateur
-- au moment d'agir.
--
-- Plutôt que de rafistoler la policy (un admin plateforme n'a aucune raison de devenir visible
-- partout), la capacité de l'acteur est enregistrée UNE FOIS, au moment même de l'action, dans
-- une colonne qui ne dépend d'aucune lecture ultérieure ni d'aucune RLS. « Admin » se dit alors
-- de source sûre, y compris quand son nom reste invisible au lecteur — demande client : « quand
-- c'est l'admin qui fait les modifications, mentionne que l'auteur de la modification "Admin" ».

begin;

alter table public.session_modifications
  add column modifie_par_est_admin boolean not null default false;

comment on column public.session_modifications.modifie_par_est_admin is
  'Capacité réelle de l''acteur au moment de la modification (admin_etablissement ou admin plateforme, 0132) — enregistrée à l''écriture, jamais recalculée à la lecture : un admin plateforme reste invisible via RLS à un autre admin (profiles_admin_select_etablissement, 0004) une fois son propre établissement différent de celui de la séance.';

-- Rétroactif : les lignes déjà écrites par un admin (admin_etablissement de l'établissement
-- concerné, ou admin plateforme) sont reconnues après coup — c'est exactement le cas de la
-- capture du client, déjà en base avant ce correctif.
update public.session_modifications sm
set modifie_par_est_admin = true
where exists (
  select 1 from public.profiles p
  where p.id = sm.modifie_par
    and p.role = 'admin_etablissement'
    and p.etablissement_id = sm.etablissement_id
)
or exists (
  select 1 from public.platform_admins pa where pa.id = sm.modifie_par
);

commit;
