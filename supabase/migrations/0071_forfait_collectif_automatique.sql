-- Forfait d'heures automatique à l'entrée dans une vague — demande client du 2026-09-23
-- (point 9) : « chaque étudiant aura un forfait de 32 heures par défaut, paramétrable depuis
-- l'espace admin ».
--
-- En trigger plutôt qu'au fil des appelants : on inscrit un élève à une vague depuis trois
-- endroits au moins (le dossier étudiant, le choix de programme initial, et la conversion
-- automatique d'un candidat au test oral côté serveur). Poser la règle en base garantit qu'aucun
-- chemin ne l'oublie, et qu'un chemin ajouté plus tard l'héritera sans rien faire.
create or replace function public.creer_forfait_collectif()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heures integer;
begin
  -- Un élève qui change de vague garde son forfait entamé : on ne recrée rien, sinon son
  -- compteur d'heures repartirait de zéro à chaque réaffectation.
  if exists (
    select 1 from public.packages p
    where p.student_id = new.student_id and p.type_programme = 'collectif'
  ) then
    return new;
  end if;

  select coalesce(c.heures_forfait, e.heures_forfait_collectif)
    into v_heures
    from public.cohorts c
    join public.etablissements e on e.id = c.etablissement_id
   where c.id = new.cohort_id;

  if v_heures is null then
    return new;
  end if;

  insert into public.packages (etablissement_id, student_id, type_programme, total_heures)
  values (new.etablissement_id, new.student_id, 'collectif', v_heures);

  return new;
end;
$$;

create trigger cohort_enrollments_forfait_collectif
  after insert on public.cohort_enrollments
  for each row
  execute function public.creer_forfait_collectif();
