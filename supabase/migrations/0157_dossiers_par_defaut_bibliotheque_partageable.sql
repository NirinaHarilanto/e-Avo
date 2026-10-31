-- Documents › Partageables redevient lisible PAR L'ADMINISTRATION, et reçoit ses trois dossiers
-- par défaut — signalé par le client le 2026-10-31, juste après l'application de 0155 : « je ne
-- vois pas les dossiers 2 et 3 dans partageable ».
--
-- Deux causes, dont une régression que 0154 a introduite le jour même.

-- 1) CE QUE 0154 A CASSÉ SANS QUE JE LE VOIE -------------------------------------------------
-- 0154 a retiré `documents_etablissement_wide_select` et
-- `document_dossiers_etablissement_wide_select` pour qu'un fichier déposé dans Partageables ne
-- soit plus visible de TOUT l'établissement. L'exigence du client reste entière, mais ces deux
-- policies étaient aussi, en pratique, le SEUL chemin par lequel l'administration elle-même
-- voyait cette bibliothèque :
--   * `document_dossiers_admin_ecriture` (0059) exclut explicitement
--     `created_by_profile_id = proprietaire_profile_id` — « l'admin ne lit pas les dossiers créés
--     par la personne elle-même ». Or un dossier commun est créé par un admin en son propre nom :
--     les deux colonnes sont égales, la policy ne s'applique donc pas ;
--   * `documents_admin_select` (0059) porte la même restriction
--     (`uploaded_by_profile_id <> owner_profile_id`).
-- Constaté en production avec un vrai jeton d'admin : 0 dossier commun visible, et 2 fichiers sur
-- 3 seulement — celui que l'admin avait déposé pour lui-même avait disparu de son propre écran.
--
-- La réparation n'est PAS un retour en arrière : c'est 0033/0149 restreintes à
-- `is_admin_etablissement()`. La bibliothèque redevient l'espace de travail de l'administration,
-- qui en est détentrice ; élèves et professeurs n'y ont toujours aucun accès automatique et ne
-- voient que ce qu'on leur partage nommément (voir 0154 et 0155).
create policy "document_dossiers_admin_commun"
  on public.document_dossiers for all
  to authenticated
  using (
    etablissement_wide
    and etablissement_id = public.current_etablissement_id()
    and public.is_admin_etablissement()
  )
  with check (
    etablissement_wide
    and etablissement_id = public.current_etablissement_id()
    and public.is_admin_etablissement()
  );

create policy "documents_admin_commun_select"
  on public.documents for select
  to authenticated
  using (
    etablissement_wide
    and etablissement_id = public.current_etablissement_id()
    and public.is_admin_etablissement()
  );

-- 2) LES TROIS DOSSIERS PAR DÉFAUT ------------------------------------------------------------
-- 0155 pose « Dossier 1/2/3 » dans l'espace documentaire de chaque PERSONNE
-- (`creer_dossiers_par_defaut`, déclenchée à la création d'un profil). La bibliothèque partageable
-- est une SECONDE arborescence dans la même table (0149) : elle n'appartient à personne en
-- particulier, aucun profil ne la déclenche, elle n'a donc jamais rien reçu.
--
-- Les lignes de l'établissement en production ont déjà été créées par l'API le 2026-10-31 ;
-- `on conflict do nothing` rend ce bloc sans effet sur elles, et utile pour toute base repartie
-- de zéro.
do $$
declare
  v_etab record;
  v_auteur uuid;
  v_nom text;
begin
  for v_etab in select id from public.etablissements loop
    -- Un dossier commun n'appartient à personne, mais `proprietaire_profile_id` est `not null`
    -- depuis 0058 : on y met un admin de l'établissement, qui n'est là que pour la traçabilité
    -- (voir le commentaire de 0149). Sans admin, l'établissement est sauté plutôt que de choisir
    -- un profil au hasard.
    select id into v_auteur
      from public.profiles
      where etablissement_id = v_etab.id and role = 'admin_etablissement' and status <> 'suspended'
      order by created_at
      limit 1;
    continue when v_auteur is null;

    foreach v_nom in array array['Dossier 1', 'Dossier 2', 'Dossier 3'] loop
      insert into public.document_dossiers
        (etablissement_id, proprietaire_profile_id, parent_id, nom, created_by_profile_id, etablissement_wide)
      values (v_etab.id, v_auteur, null, v_nom, v_auteur, true)
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;
