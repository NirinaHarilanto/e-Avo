-- Corrige `attribuer_professeur` (0046) : le transfert des séances ignorait la date.
--
-- Règle produit précisée par le client le 2026-09-21 : « il faut bien se référer à la date ET
-- l'heure du transfert. Toutes les séances planifiées après la date de transfert reviennent au
-- nouveau professeur, les séances antérieures restent rattachées à l'ancien. »
--
-- 0046 ne filtrait que sur `statut = 'planifiee'`, jamais sur `debut` : une séance passée restée
-- au statut « planifiée » (le professeur ne l'a pas encore clôturée — cas courant, la page
-- Séances & visio a d'ailleurs une tuile « À clôturer » pour ça) basculait sur le nouveau
-- professeur alors qu'elle avait été donnée, ou aurait dû l'être, par l'ancien. Conséquence
-- concrète : au moment où l'ancien professeur clôture enfin cette séance, c'est le NOUVEAU qui
-- reçoit le crédit d'heures (`hour_ledger`, écrit à la clôture d'après `sessions.teacher_id`),
-- donc la rémunération.
--
-- Le point de coupure est `now()`, l'instant exact de l'appel, et non `current_date` : ce dernier
-- ramènerait la coupure à minuit et ferait basculer les séances déjà données plus tôt dans la
-- journée du transfert. C'est aussi `now()` qui correspond littéralement à « date et heure de
-- transfert » — `teacher_assignments.date_debut` est une date (jour), elle ne peut pas porter
-- cette précision (voir 0039).
--
-- Même correction pour le volet collectif : on ne désinscrit l'élève transféré que des séances
-- collectives À VENIR. Le désinscrire d'une séance collective passée effacerait sa présence à un
-- cours qui a bien eu lieu.
--
-- Le type de retour ne change pas : `create or replace` suffit, pas de `drop function` (piège
-- 42P13 rencontré en 0046, voir son commentaire).
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
  -- Figé une seule fois : les deux sélections ci-dessous doivent partager exactement le même
  -- point de coupure, sinon une séance pile à cet instant pourrait tomber des deux côtés.
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
