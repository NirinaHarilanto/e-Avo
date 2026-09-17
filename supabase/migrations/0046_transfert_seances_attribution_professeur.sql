-- Étend attribuer_professeur (0039) : jusqu'ici la fonction clôturait/ouvrait la période dans
-- teacher_assignments mais ne touchait ni sessions.teacher_id ni session_enrollments — l'élève
-- changeait de professeur "sur le papier" sans que son planning à venir ne suive.
--
-- Règle produit actée avec le client (2026-09-17) : seules les séances statut = 'planifiee' sont
-- concernées (les 'terminee'/'annulee' ne bougent jamais, quel que soit le type) :
-- - individuel (1 seul élève par séance) : transfert complet, sessions.teacher_id ET
--   session_enrollments.teacher_assignment_id suivent le nouveau professeur.
-- - collectif (plusieurs élèves, 1 seul teacher_id par séance) : on ne peut pas déplacer toute
--   la séance sans affecter les autres élèves du groupe -> l'élève transféré est désinscrit de
--   ces séances collectives à venir avec l'ancien professeur (ligne session_enrollments
--   supprimée). L'admin le réinscrit ensuite manuellement dans le planning du nouveau prof.
--
-- Jointure sur session_enrollments.teacher_assignment_id (pas sessions.teacher_id) : c'est cette
-- colonne qui représente la période active de CET élève au moment de la séance (voir le
-- commentaire de sa création, 0009_session_enrollments.sql) — en collectif, les élèves d'une même
-- séance peuvent être sur des teacher_assignments différents. sessions.teacher_id reste vérifié
-- en plus, comme garde-fou défensif, mais jamais comme clé de sélection principale.
--
-- Traçabilité : faire pointer session_enrollments.teacher_assignment_id vers la NOUVELLE
-- affectation suffit — useDossierEtudiant.ts (côté client) reconstruit déjà l'historique par
-- période en groupant les séances sur cette colonne, donc les séances futures apparaissent
-- automatiquement sous la bonne période sans aucun changement côté lecture. C'est d'ailleurs plus
-- correct que de les laisser sous l'ancienne période : une séance à venir n'a jamais eu lieu sous
-- l'ancien professeur, la période close (date_fin = aujourd'hui) ne doit contenir que du passé.
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
  v_langue text := nullif(btrim(coalesce(p_langue, '')), '');
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_ancienne_affectation_id uuid;
  v_ancien_teacher_id uuid;
  v_nouvelle_id uuid;
  v_sessions_individuel_ids uuid[];
  v_enrollments_collectif_ids uuid[];
  v_nb_individuelles integer := 0;
  v_nb_desinscrites integer := 0;
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

  -- Capture AVANT clôture : une fois l'update ci-dessous passé, date_fin n'est plus nulle et on
  -- perdrait le moyen d'identifier "l'ancienne période active" pour la suite de la fonction.
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

  -- Rien à transférer s'il n'y avait pas de professeur avant (première attribution).
  if v_ancienne_affectation_id is not null then

    -- Séances individuelles à venir de l'ancienne période — un tableau figé une seule fois,
    -- réutilisé par les DEUX écritures ci-dessous : aucune dépendance d'ordre entre elles.
    select coalesce(array_agg(s.id), '{}')
    into v_sessions_individuel_ids
    from public.session_enrollments se
    join public.sessions s on s.id = se.session_id
    where se.student_id = p_student_id
      and se.teacher_assignment_id = v_ancienne_affectation_id
      and s.statut = 'planifiee'
      and s.type = 'individuel'
      and s.teacher_id = v_ancien_teacher_id;

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

    -- Séances collectives à venir : désinscription de l'élève transféré uniquement (le reste
    -- du groupe garde l'ancien professeur) — décision produit actée, pas de blocage possible.
    select coalesce(array_agg(se.id), '{}')
    into v_enrollments_collectif_ids
    from public.session_enrollments se
    join public.sessions s on s.id = se.session_id
    where se.student_id = p_student_id
      and se.teacher_assignment_id = v_ancienne_affectation_id
      and s.statut = 'planifiee'
      and s.type = 'collectif'
      and s.teacher_id = v_ancien_teacher_id;

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
