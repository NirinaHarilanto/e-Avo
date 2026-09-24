-- Professeur d'une classe de cours collectif propagé instantanément à ses élèves — demande
-- client du 2026-09-24 : « tous les étudiants de la même classe auront le même professeur »,
-- et c'est ce même rattachement (`teacher_assignments`, la même table qui pilote déjà « Mes
-- étudiants » côté professeur individuel/duo) qui doit les faire apparaître dans l'espace du
-- professeur, section Étudiants — sans plomberie séparée à maintenir pour le collectif.
--
-- `attribuer_professeur()` (0039) fait déjà l'écriture atomique (clôture l'affectation active
-- puis en ouvre une nouvelle, sous l'unique index qui garantit au plus une affectation active par
-- élève) mais exige `is_admin_etablissement()` : une fonction pensée pour un appel direct de
-- l'admin, pas pour un trigger qui doit s'exécuter quel que soit le contexte d'écriture
-- (supabase-js de l'admin, ou service_role côté serveur — ex. la conversion automatique d'un
-- prospect vers sa classe, api/admin/convert-prospect.ts). Les deux triggers ci-dessous
-- réutilisent donc la même logique via une fonction dédiée, sans cette vérification : c'est
-- l'écriture déjà autorisée sur `cohort_classes`/`cohort_enrollments` qui sert de garde, pas une
-- seconde vérification dans le trigger qu'elle déclenche.

create or replace function public.synchroniser_professeur_classe(p_student_id uuid, p_teacher_id uuid, p_langue text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Déjà à jour : rien à faire (évite une clôture/réouverture inutile si le trigger se
  -- redéclenche pour une raison qui ne change pas le professeur effectif).
  if exists (
    select 1 from public.teacher_assignments
    where student_id = p_student_id and teacher_id is not distinct from p_teacher_id and date_fin is null
  ) then
    return;
  end if;

  update public.teacher_assignments
     set date_fin = current_date,
         motif_changement = coalesce(motif_changement, 'Changement de professeur de la classe de cours collectif')
   where student_id = p_student_id and date_fin is null;

  if p_teacher_id is not null then
    insert into public.teacher_assignments (etablissement_id, student_id, teacher_id, langue, date_debut, motif_changement)
    select p.etablissement_id, p_student_id, p_teacher_id, p_langue, current_date, 'Professeur de la classe de cours collectif'
    from public.profiles p
    where p.id = p_student_id;
  end if;
end;
$$;

-- Un professeur assigné (ou changé, ou retiré) sur une classe : répercuté sur tous ses inscrits
-- actuels d'un coup.
create or replace function public.propager_professeur_classe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_langue text;
  r record;
begin
  if new.teacher_id is not distinct from old.teacher_id then
    return new;
  end if;

  select c.langue into v_langue from public.cohorts c where c.id = new.cohort_id;

  for r in select student_id from public.cohort_enrollments where cohort_class_id = new.id loop
    perform public.synchroniser_professeur_classe(r.student_id, new.teacher_id, coalesce(v_langue, 'Anglais'));
  end loop;

  return new;
end;
$$;

create trigger cohort_classes_propager_professeur
  after update of teacher_id on public.cohort_classes
  for each row
  execute function public.propager_professeur_classe();

-- Un élève rejoint une classe (ou en change) : reçoit immédiatement le professeur de sa nouvelle
-- classe, sans attendre une action séparée de l'admin — sinon l'invariant « même classe, même
-- professeur » resterait faux le temps qu'un admin y pense.
create or replace function public.propager_professeur_a_l_inscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_langue text;
  v_ancien_teacher_id uuid;
begin
  if tg_op = 'UPDATE' and old.cohort_class_id is not distinct from new.cohort_class_id then
    return new;
  end if;

  if new.cohort_class_id is not null then
    select cc.teacher_id, c.langue into v_teacher_id, v_langue
      from public.cohort_classes cc
      join public.cohorts c on c.id = cc.cohort_id
     where cc.id = new.cohort_class_id;

    if v_teacher_id is not null then
      perform public.synchroniser_professeur_classe(new.student_id, v_teacher_id, coalesce(v_langue, 'Anglais'));
    end if;
  elsif tg_op = 'UPDATE' and old.cohort_class_id is not null then
    -- Retiré de sa classe sans en rejoindre une autre : ferme l'affectation, mais seulement si
    -- elle venait bien du professeur de CETTE classe — une affectation individuelle/duo sans
    -- rapport avec le collectif n'est jamais touchée ici.
    select teacher_id into v_ancien_teacher_id from public.cohort_classes where id = old.cohort_class_id;
    if v_ancien_teacher_id is not null then
      update public.teacher_assignments
         set date_fin = current_date, motif_changement = 'Retiré de la classe de cours collectif'
       where student_id = new.student_id and teacher_id = v_ancien_teacher_id and date_fin is null;
    end if;
  end if;

  return new;
end;
$$;

create trigger cohort_enrollments_propager_professeur
  after insert or update of cohort_class_id on public.cohort_enrollments
  for each row
  execute function public.propager_professeur_a_l_inscription();

-- Rattrapage rétroactif : les classes déjà créées avec un professeur, et les élèves déjà
-- affectés, avant cette migration n'ont jamais déclenché ces triggers.
do $$
declare
  r record;
begin
  for r in
    select ce.student_id, cc.teacher_id, coalesce(c.langue, 'Anglais') as langue
      from public.cohort_enrollments ce
      join public.cohort_classes cc on cc.id = ce.cohort_class_id
      join public.cohorts c on c.id = cc.cohort_id
     where cc.teacher_id is not null
  loop
    perform public.synchroniser_professeur_classe(r.student_id, r.teacher_id, r.langue);
  end loop;
end $$;
