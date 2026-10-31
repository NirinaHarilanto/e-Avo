-- Remplacer UN professeur désigné, par un ou plusieurs autres — demande client du 2026-10-31,
-- capture à l'appui : « quand il y a deux professeurs, et que le bouton changer professeur est
-- appuyé, il faudrait afficher un pop-up et sélectionner le professeur à remplacer parmi les deux
-- et choisir le ou les professeurs qui le ou les remplacent ».
--
-- C'est précisément le cas que 0138 avait REFUSÉ, faute de savoir lequel remplacer :
--
--   if v_nb_actives > 1 then
--     raise exception 'Cet étudiant a plusieurs professeurs : retirez celui à remplacer, puis ajoutez le nouveau.'
--
-- Le refus était le bon choix à ce moment-là (deviner aurait clôturé les deux affectations et
-- transféré les séances d'une seule, au hasard), mais le détour qu'il propose n'est pas
-- équivalent : « Retirer » ANNULE les séances à venir du professeur retiré
-- (api/admin/retirer-professeur.ts), alors qu'un remplacement doit les TRANSFÉRER. L'admin qui
-- suivait la consigne perdait donc le planning de l'élève à chaque changement de formateur.
--
-- Cette fonction lève l'ambiguïté par l'appelant plutôt que par une devinette : il désigne
-- l'affectation à clôturer, et la liste de celles à ouvrir. `attribuer_professeur` (0039, 0046,
-- 0055, 0061, 0138) n'est PAS touchée — elle garde son garde-fou et reste la voie d'une première
-- attribution, où il n'y a rien à remplacer.
--
-- Pourquoi plusieurs remplaçants : le client peut répartir les heures d'un formateur qui s'en va
-- entre deux collègues. Les séances déjà planifiées, elles, ne se répartissent pas toutes seules
-- — `sessions.teacher_id` ne porte qu'un professeur — donc elles vont au PREMIER de la liste,
-- celui que l'écran présente comme le repreneur. Les autres entrent sans séance, comme le fait
-- déjà `ajouter_professeur`.

create function public.remplacer_professeur(
  p_affectation_id uuid,
  p_teacher_ids uuid[],
  p_motif text default null
)
returns table (
  seances_individuelles_transferees integer,
  seances_collectives_desinscrites integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etablissement_id uuid;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_student_id uuid;
  v_ancien_teacher_id uuid;
  v_teacher_ids uuid[];
  v_repreneur_id uuid;
  v_affectation_repreneur_id uuid;
  v_teacher_id uuid;
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

  /* L'affectation doit être ACTIVE : rouvrir une période déjà close reviendrait à réécrire
     l'historique du parcours, que la fiche de l'élève affiche période par période. */
  select ta.student_id, ta.teacher_id
  into v_student_id, v_ancien_teacher_id
  from public.teacher_assignments ta
  join public.profiles eleve on eleve.id = ta.student_id
  where ta.id = p_affectation_id
    and ta.date_fin is null
    and eleve.etablissement_id = v_etablissement_id;

  if v_student_id is null then
    raise exception 'Affectation introuvable ou déjà clôturée.' using errcode = '42501';
  end if;

  /* Doublons retirés et ordre d'arrivée conservé : le premier élément désigne le repreneur des
     séances, l'écran le présente comme tel — un `distinct` ordinaire le choisirait au hasard. */
  select coalesce(array_agg(t.id order by t.rang), '{}')
  into v_teacher_ids
  from (
    select id, min(rang) as rang
    from unnest(p_teacher_ids) with ordinality as e(id, rang)
    where id is not null
    group by id
  ) t;

  if cardinality(v_teacher_ids) = 0 then
    raise exception 'Indiquez au moins un professeur remplaçant.' using errcode = '22023';
  end if;

  if v_ancien_teacher_id = any(v_teacher_ids) then
    raise exception 'Le professeur remplacé ne peut pas être son propre remplaçant.' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_teacher_ids) as e(id)
    where not exists (
      select 1 from public.profiles p
      where p.id = e.id and p.etablissement_id = v_etablissement_id and p.role = 'professeur'
    )
  ) then
    raise exception 'Professeur introuvable dans cet établissement.' using errcode = '42501';
  end if;

  /* Un remplaçant déjà attribué à cet élève violerait l'index unique du couple posé en 0138.
     Message explicite plutôt que la violation brute (23505), que l'admin verrait telle quelle. */
  if exists (
    select 1 from public.teacher_assignments ta
    where ta.student_id = v_student_id
      and ta.date_fin is null
      and ta.id <> p_affectation_id
      and ta.teacher_id = any(v_teacher_ids)
  ) then
    raise exception 'Un des professeurs choisis enseigne déjà à cet élève.' using errcode = '22023';
  end if;

  update public.teacher_assignments
  set date_fin = current_date, motif_changement = coalesce(v_motif, motif_changement)
  where id = p_affectation_id;

  /* `langue` figée à « Anglais » comme le font `attribuer_professeur` depuis 0061 et
     `ajouter_professeur` depuis 0138 : HOC n'enseigne que l'anglais et le champ n'est plus saisi
     nulle part. */
  v_repreneur_id := v_teacher_ids[1];
  foreach v_teacher_id in array v_teacher_ids loop
    insert into public.teacher_assignments (
      etablissement_id, student_id, teacher_id, langue, date_debut, motif_changement
    )
    values (v_etablissement_id, v_student_id, v_teacher_id, 'Anglais', current_date, v_motif);
  end loop;

  /* L'affectation du repreneur, relue après la boucle plutôt que capturée par un `returning`
     dans la boucle : celui-ci serait écrasé à chaque tour et seul le dernier survivrait. */
  select id into v_affectation_repreneur_id
  from public.teacher_assignments
  where student_id = v_student_id and teacher_id = v_repreneur_id and date_fin is null;

  /* Transfert des séances encore à venir, exactement selon les règles de `attribuer_professeur`
     (0046/0055) : seules les séances INDIVIDUELLES postérieures à l'instant du transfert et
     encore « planifiée » changent de main ; les séances collectives, elles, appartiennent à une
     classe et non à l'élève — on l'en désinscrit, à réinscrire à la main si besoin. */
  select coalesce(array_agg(s.id), '{}')
  into v_sessions_individuel_ids
  from public.session_enrollments se
  join public.sessions s on s.id = se.session_id
  where se.student_id = v_student_id
    and se.teacher_assignment_id = p_affectation_id
    and s.statut = 'planifiee'
    and s.type = 'individuel'
    and s.teacher_id = v_ancien_teacher_id
    and s.debut >= v_instant_transfert;

  if cardinality(v_sessions_individuel_ids) > 0 then
    update public.sessions
    set teacher_id = v_repreneur_id
    where id = any(v_sessions_individuel_ids);
    get diagnostics v_nb_individuelles = row_count;

    update public.session_enrollments
    set teacher_assignment_id = v_affectation_repreneur_id
    where student_id = v_student_id
      and session_id = any(v_sessions_individuel_ids);
  end if;

  select coalesce(array_agg(se.id), '{}')
  into v_enrollments_collectif_ids
  from public.session_enrollments se
  join public.sessions s on s.id = se.session_id
  where se.student_id = v_student_id
    and se.teacher_assignment_id = p_affectation_id
    and s.statut = 'planifiee'
    and s.type = 'collectif'
    and s.teacher_id = v_ancien_teacher_id
    and s.debut >= v_instant_transfert;

  if cardinality(v_enrollments_collectif_ids) > 0 then
    delete from public.session_enrollments
    where id = any(v_enrollments_collectif_ids);
    get diagnostics v_nb_desinscrites = row_count;
  end if;

  return query select v_nb_individuelles, v_nb_desinscrites;
end;
$$;

comment on function public.remplacer_professeur(uuid, uuid[], text) is
  'Clôture UNE affectation désignée et ouvre une affectation par remplaçant (0148). Les séances '
  'individuelles encore à venir passent au premier remplaçant de la liste. Complète '
  'attribuer_professeur (0039/0138), qui refuse le cas « plusieurs professeurs actifs ».';

revoke all on function public.remplacer_professeur(uuid, uuid[], text) from public;
grant execute on function public.remplacer_professeur(uuid, uuid[], text) to authenticated;
