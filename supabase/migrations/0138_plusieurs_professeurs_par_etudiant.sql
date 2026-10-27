-- Plusieurs professeurs attribués simultanément à un même étudiant (individuel et duo).
--
-- Demande client du 2026-10-27 : « Lors de l'attribution de professeur à un étudiant, il faudrait
-- rajouter la possibilité d'avoir deux ou plusieurs professeurs [...] chaque professeur peut
-- lancer une séance de cours avec l'étudiant, sans l'autre professeur. Dans ce cas, uniquement
-- les heures du professeur et étudiants ayant suivies le cours seront décompter. L'autre
-- professeur verra l'historique du cours en temps réel. »
--
-- Décisions produit actées avec le client avant écriture :
--   * UN SEUL forfait d'heures, partagé. Chaque séance débite le même pot, quel que soit le
--     professeur qui l'a donnée. C'est déjà le comportement de `hour_ledger` (0011) : le crédit
--     professeur suit `sessions.teacher_id`, le débit étudiant est unique par séance. Rien à
--     changer sur les heures, et c'est volontaire.
--   * Retirer un professeur annule ses séances à venir (voir api/admin/retirer-professeur.ts :
--     l'annulation ne peut pas vivre ici, elle doit retirer la réunion Google et prévenir les
--     personnes concernées, ce qu'une fonction SQL ne sait pas faire).
--   * Le professeur voit les séances de son collègue en LECTURE SEULE. La clôture d'une séance
--     écrit la rémunération (0011) : la laisser à un tiers ouvrirait un risque de paie.
--   * Portée : individuel et duo. Le collectif garde son professeur de classe de niveau
--     (`cohort_classes.teacher_id`, 0074), qui n'a jamais dépendu de cette table.

-- ---------------------------------------------------------------------------------------------
-- 1. Lever l'exclusivité posée en 0039, sans perdre son garde-fou
-- ---------------------------------------------------------------------------------------------
-- 0039 a posé `teacher_assignments_une_seule_active` : un index unique sur (student_id) filtré
-- sur `date_fin is null`. Il corrigeait un vrai bug (l'affectation courante déduite d'un tri
-- `date_debut desc` reprenait parfois l'ancienne), mais il interdit physiquement ce que le client
-- demande aujourd'hui.
--
-- Le remplacer par rien laisserait revenir le défaut inverse : le même professeur attribué deux
-- fois au même élève, donc deux périodes actives indiscernables, un nom affiché en double et un
-- retrait qui ne saurait pas laquelle clôturer. L'unicité porte donc maintenant sur le COUPLE
-- (élève, professeur) : plusieurs professeurs actifs, mais jamais deux fois le même.
drop index if exists public.teacher_assignments_une_seule_active;

create unique index teacher_assignments_un_prof_une_fois_active
  on public.teacher_assignments (student_id, teacher_id)
  where date_fin is null;

-- ---------------------------------------------------------------------------------------------
-- 2. Visibilité croisée entre professeurs d'un même élève, en lecture seule
-- ---------------------------------------------------------------------------------------------
-- C'est le seul volet qui exige de toucher à la sécurité. Jusqu'ici tout l'accès professeur aux
-- séances passe par `teacher_id = auth.uid()` (`sessions_teacher_all` 0008,
-- `session_enrollments_teacher_select` 0009, `session_reports_teacher_all` 0033,
-- `session_modifications_teacher_select` 0048) : un professeur ne voit QUE ses propres séances.
-- Sans la fonction ci-dessous, « l'autre professeur verra l'historique du cours » est impossible.
--
-- Trois choix délibérés, à signaler au client :
--   * Seules les affectations ENCORE ACTIVES (`date_fin is null`) ouvrent cette vue. Un
--     professeur retiré de l'élève garde ses propres séances (policies existantes) mais cesse de
--     voir les nouvelles de son collègue. `is_teacher_of_student` (0018/0088/0129), elle, n'a
--     jamais filtré sur `date_fin` — c'est voulu pour le dossier pédagogique (tag « Ancien
--     élève »), ça ne l'est pas pour suivre en direct le travail d'un autre.
--   * Cette fonction ne regarde QUE `teacher_assignments`, jamais `cohort_classes` : le
--     professeur d'une classe collective n'a pas à voir les cours particuliers que son élève
--     prend par ailleurs avec quelqu'un d'autre.
--   * Le rebond duo est repris de 0129 : le dossier d'un binôme vit sur la principale (0054),
--     la secondaire n'a jamais sa propre ligne d'affectation. Sans ce rebond, une séance inscrite
--     au nom de la secondaire resterait invisible du co-professeur.
--
-- `security definer` pour la même raison que `is_student_of_session` (0033) : la fonction est
-- appelée depuis les policies de `sessions` et de `session_enrollments` et interroge ces deux
-- tables, donc elle doit s'exécuter hors RLS sous peine de récursion (piège déjà rencontré en
-- 0016).
create function public.est_coprofesseur_de_seance(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.session_enrollments se
    join public.teacher_assignments ta on ta.student_id = se.student_id
    where se.session_id = p_session_id
      and ta.teacher_id = auth.uid()
      and ta.date_fin is null
  ) or exists (
    -- L'inscrit est la secondaire d'un binôme : c'est l'affectation de sa principale qui fait foi.
    select 1
    from public.session_enrollments se
    join public.profiles secondaire on secondaire.id = se.student_id
    join public.teacher_assignments ta on ta.student_id = secondaire.duo_partenaire_id
    where se.session_id = p_session_id
      and secondaire.duo_partenaire_id is not null
      and ta.teacher_id = auth.uid()
      and ta.date_fin is null
  );
$$;

comment on function public.est_coprofesseur_de_seance(uuid) is
  'Vrai si l''utilisateur courant est un professeur ACTIVEMENT attribué à au moins un inscrit de '
  'cette séance (0138, plusieurs professeurs par étudiant). Sert uniquement à ouvrir une lecture '
  'seule sur les séances d''un collègue : ne jamais l''utiliser dans un `with check`.';

-- Policies SÉPARÉES de celles qui existent, et en `for select` uniquement. Les policies RLS
-- permissives s'additionnent (OR) : l'écriture reste donc réservée au titulaire de la séance par
-- les policies d'origine, exactement comme avant cette migration.
create policy "sessions_coprofesseur_select"
  on public.sessions for select
  to authenticated
  using (public.est_coprofesseur_de_seance(id));

create policy "session_enrollments_coprofesseur_select"
  on public.session_enrollments for select
  to authenticated
  using (public.est_coprofesseur_de_seance(session_id));

-- L'« historique du cours » demandé par le client, au sens propre : le compte rendu rédigé par
-- le collègue après la séance (thèmes, résumé — 0033).
create policy "session_reports_coprofesseur_select"
  on public.session_reports for select
  to authenticated
  using (public.est_coprofesseur_de_seance(session_id));

-- Reprogrammations et annulations de la séance (0048/0132) : sans elles, la fiche d'une séance
-- vue par le co-professeur afficherait un horaire sans jamais dire qu'il a été déplacé.
create policy "session_modifications_coprofesseur_select"
  on public.session_modifications for select
  to authenticated
  using (public.est_coprofesseur_de_seance(session_id));

-- Volontairement ABSENT de cette liste : `video_sessions` (0013). Le lien de visioconférence
-- n'est pas de l'historique, c'est une porte d'entrée — le donner au co-professeur lui
-- permettrait d'entrer dans le cours de son collègue. L'écran masque donc le lien sur une séance
-- qui n'est pas la sienne.
--
-- Déjà couvert sans rien ajouter : les heures consommées de l'élève
-- (`hour_ledger_teacher_select_eleve`, 0061, passe par `is_teacher_of_student`), son forfait
-- (`packages_teacher_select`, 0061) et tout son dossier pédagogique. La rémunération du collègue
-- (`credit_professeur`) reste invisible : `hour_ledger_teacher_select` (0011) ne laisse passer
-- que `teacher_id = auth.uid()`.

-- ---------------------------------------------------------------------------------------------
-- 3. Ajouter un professeur sans toucher aux autres
-- ---------------------------------------------------------------------------------------------
-- `attribuer_professeur` (0039, étendue en 0046 et 0055) clôture systématiquement l'affectation
-- en cours et transfère ses séances à venir : c'est un REMPLACEMENT, et ça doit le rester, le
-- client s'en sert pour un vrai changement de formateur. Ajouter un second professeur est une
-- opération différente : rien à clôturer, rien à transférer.
create function public.ajouter_professeur(
  p_student_id uuid,
  p_teacher_id uuid,
  p_motif text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etablissement_id uuid;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_nouvelle_id uuid;
begin
  if not public.is_admin_etablissement() then
    raise exception 'Seul un administrateur peut attribuer un professeur.' using errcode = '42501';
  end if;

  v_etablissement_id := public.current_etablissement_id();

  if not exists (
    select 1 from public.profiles
    where id = p_student_id and etablissement_id = v_etablissement_id
  ) then
    raise exception 'Étudiant introuvable dans cet établissement.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_teacher_id and etablissement_id = v_etablissement_id and role = 'professeur'
  ) then
    raise exception 'Professeur introuvable dans cet établissement.' using errcode = '42501';
  end if;

  /* Secondaire d'un binôme duo : son dossier pédagogique vit entièrement sur la principale
     (0054, « une seule source de vérité »), elle n'a jamais sa propre ligne d'affectation et
     0129 a déjà dû corriger une RLS à cause de cet écart. Créer une affectation ici donnerait un
     binôme dont les deux membres ont des professeurs différents, c'est-à-dire plus un binôme. */
  if exists (
    select 1 from public.profiles
    where id = p_student_id and duo_partenaire_id is not null
  ) then
    raise exception 'Cet étudiant est le second membre d''un binôme : les professeurs s''attribuent sur le dossier du binôme.'
      using errcode = '22023';
  end if;

  /* Message explicite plutôt que la violation d'index brute (23505) que le client verrait
     s'afficher telle quelle à l'écran. */
  if exists (
    select 1 from public.teacher_assignments
    where student_id = p_student_id and teacher_id = p_teacher_id and date_fin is null
  ) then
    raise exception 'Ce professeur est déjà attribué à cet étudiant.' using errcode = '22023';
  end if;

  /* `langue` figée à « Anglais » comme le fait `attribuer_professeur` depuis 0061 : HOC
     n'enseigne que l'anglais et le champ n'est plus saisi nulle part. Une affectation créée ici
     doit être indiscernable d'une affectation créée par l'autre chemin. */
  insert into public.teacher_assignments (
    etablissement_id, student_id, teacher_id, langue, date_debut, motif_changement
  )
  values (v_etablissement_id, p_student_id, p_teacher_id, 'Anglais', current_date, v_motif)
  returning id into v_nouvelle_id;

  return v_nouvelle_id;
end;
$$;

revoke all on function public.ajouter_professeur(uuid, uuid, text) from public;
grant execute on function public.ajouter_professeur(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Pourquoi le RETRAIT n'a pas sa fonction SQL
-- ---------------------------------------------------------------------------------------------
-- Retirer un professeur doit annuler ses séances à venir (décision client), et une annulation
-- complète retire la réunion de l'agenda Google et prévient les participants — deux effets qui
-- exigent le jeton de l'établissement, hors de portée de Postgres (c'est précisément la raison
-- d'être de api/professeur/annuler-seance.ts, voir son commentaire d'en-tête). Le retrait vit
-- donc entièrement dans api/admin/retirer-professeur.ts, qui annule les séances puis clôture
-- l'affectation avec la clé de service.
--
-- Une fonction `security definer` n'aurait d'ailleurs pas pu être appelée depuis ce serveur :
-- `is_admin_etablissement()` repose sur `auth.uid()`, qui est nul sous la clé de service. Et elle
-- n'apporterait aucune sécurité, puisque `teacher_assignments_admin_all` (0007) autorise déjà
-- l'admin à écrire cette table directement. L'ajout, lui, garde sa fonction ci-dessus : il part
-- du navigateur avec le jeton de l'admin et a besoin de ses garde-fous.

-- ---------------------------------------------------------------------------------------------
-- 5. Garde-fou sur le remplacement, devenu ambigu
-- ---------------------------------------------------------------------------------------------
-- `attribuer_professeur` capture « l'ancienne affectation » par
-- `select id, teacher_id into ... where student_id = ... and date_fin is null`. Un `select into`
-- plpgsql non `strict` qui ramène plusieurs lignes n'échoue pas : il en garde une,
-- arbitrairement. Avec deux professeurs actifs, la fonction clôturerait donc les deux et ne
-- transférerait les séances que de l'un, choisi au hasard — silencieusement.
--
-- Plutôt que de deviner une intention, elle refuse désormais ce cas et renvoie à la bonne
-- opération. L'écran n'y conduit pas (il propose « Retirer » professeur par professeur dès qu'il
-- y en a plusieurs), ce garde-fou couvre l'appel direct et toute régression future.
--
-- Le corps repart de la version RÉELLEMENT EN VIGUEUR, celle de 0061 (« langue toujours
-- Anglais ») et non de 0055 : 0061 redéfinit la fonction plus tard et force
-- `v_langue := 'Anglais'`. Partir de 0055 aurait rétabli en silence un champ langue vide.
create or replace function public.attribuer_professeur(
  p_student_id uuid,
  p_teacher_id uuid,
  p_langue text default null,
  p_motif text default null
)
returns table (
  nouvelle_affectation_id uuid,
  seances_individuelles_transferees integer,
  seances_collectives_desinscrites integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etablissement_id uuid;
  -- Imposée quoi qu'on passe en `p_langue`, exactement comme en 0061.
  v_langue text := 'Anglais';
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_ancienne_affectation_id uuid;
  v_ancien_teacher_id uuid;
  v_nb_actives integer;
  v_nouvelle_id uuid;
  v_sessions_individuel_ids uuid[];
  v_enrollments_collectif_ids uuid[];
  v_nb_individuelles integer := 0;
  v_nb_desinscrites integer := 0;
  v_instant_transfert timestamptz := now();
begin
  if not public.is_admin_etablissement() then
    raise exception 'Seul un administrateur peut attribuer un professeur.' using errcode = '42501';
  end if;

  v_etablissement_id := public.current_etablissement_id();

  if not exists (
    select 1 from public.profiles
    where id = p_student_id and etablissement_id = v_etablissement_id
  ) then
    raise exception 'Étudiant introuvable dans cet établissement.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_teacher_id and etablissement_id = v_etablissement_id and role = 'professeur'
  ) then
    raise exception 'Professeur introuvable dans cet établissement.' using errcode = '42501';
  end if;

  select count(*) into v_nb_actives
  from public.teacher_assignments
  where student_id = p_student_id and date_fin is null;

  if v_nb_actives > 1 then
    raise exception 'Cet étudiant a plusieurs professeurs : retirez celui à remplacer, puis ajoutez le nouveau.'
      using errcode = '22023';
  end if;

  select id, teacher_id into v_ancienne_affectation_id, v_ancien_teacher_id
  from public.teacher_assignments
  where student_id = p_student_id and date_fin is null;

  update public.teacher_assignments
  set date_fin = current_date, motif_changement = coalesce(v_motif, motif_changement)
  where student_id = p_student_id and date_fin is null;

  insert into public.teacher_assignments (
    etablissement_id, student_id, teacher_id, langue, date_debut, motif_changement
  )
  values (
    v_etablissement_id,
    p_student_id,
    p_teacher_id,
    v_langue,
    current_date,
    case when v_ancienne_affectation_id is not null then v_motif else null end
  )
  returning id into v_nouvelle_id;

  if v_ancienne_affectation_id is not null then

    select coalesce(array_agg(s.id), '{}')
    into v_sessions_individuel_ids
    from public.session_enrollments se
    join public.sessions s on s.id = se.session_id
    where se.student_id = p_student_id
      and se.teacher_assignment_id = v_ancienne_affectation_id
      and s.statut = 'planifiee'
      and s.type = 'individuel'
      and s.teacher_id = v_ancien_teacher_id
      and s.debut >= v_instant_transfert;

    if cardinality(v_sessions_individuel_ids) > 0 then
      update public.sessions
      set teacher_id = p_teacher_id
      where id = any(v_sessions_individuel_ids);
      get diagnostics v_nb_individuelles = row_count;

      update public.session_enrollments
      set teacher_assignment_id = v_nouvelle_id
      where student_id = p_student_id
        and session_id = any(v_sessions_individuel_ids);
    end if;

    select coalesce(array_agg(se.id), '{}')
    into v_enrollments_collectif_ids
    from public.session_enrollments se
    join public.sessions s on s.id = se.session_id
    where se.student_id = p_student_id
      and se.teacher_assignment_id = v_ancienne_affectation_id
      and s.statut = 'planifiee'
      and s.type = 'collectif'
      and s.teacher_id = v_ancien_teacher_id
      and s.debut >= v_instant_transfert;

    if cardinality(v_enrollments_collectif_ids) > 0 then
      delete from public.session_enrollments
      where id = any(v_enrollments_collectif_ids);
      get diagnostics v_nb_desinscrites = row_count;
    end if;

  end if;

  return query select v_nouvelle_id, v_nb_individuelles, v_nb_desinscrites;
end;
$$;

revoke all on function public.attribuer_professeur(uuid, uuid, text, text) from public;
grant execute on function public.attribuer_professeur(uuid, uuid, text, text) to authenticated;
