-- Corrige à la racine le bug « l'attribution de professeur n'est pas prise en compte ».
--
-- `date_debut` est une date (jour), pas un instant : changer le professeur d'un élève le jour
-- même laissait deux lignes portant exactement la même `date_debut` — l'ancienne (clôturée) et
-- la nouvelle. Les écrans qui déduisaient l'affectation courante d'un tri `date_debut desc`
-- suivi d'un premier élément (useDossierEtudiant.ts, EtudiantsAdmin.tsx) reprenaient donc
-- parfois l'ancienne : à égalité de clé de tri, PostgreSQL ne garantit aucun ordre.
--
-- La vérité métier n'a jamais été « la ligne la plus récente » mais « la seule ligne dont
-- date_fin est nulle » — c'est déjà le filtre utilisé par useProfesseurDetailAdmin.ts et
-- useCalendrierProfesseur.ts. Cette migration fait de cette règle une garantie de la base, et
-- rend l'attribution atomique (jusqu'ici : un UPDATE puis un INSERT séparés côté client, dont
-- l'échec du second laissait l'élève sans aucun professeur actif).

-- 1. Réparation des données existantes : si un élève cumule plusieurs affectations actives,
--    ne garder ouverte que la plus récente, clôturer les autres à aujourd'hui.
with classees as (
  select
    id,
    row_number() over (partition by student_id order by date_debut desc, created_at desc) as rang
  from public.teacher_assignments
  where date_fin is null
)
update public.teacher_assignments ta
set
  date_fin = current_date,
  motif_changement = coalesce(
    ta.motif_changement,
    'Clôture automatique : plusieurs affectations actives simultanées pour cet élève (migration 0039).'
  )
from classees c
where ta.id = c.id and c.rang > 1;

-- 2. Garde-fou définitif : un élève ne peut plus avoir deux professeurs actifs en même temps.
--    Toute régression future échoue bruyamment à l'écriture au lieu de se traduire par un
--    affichage aléatoire.
create unique index teacher_assignments_une_seule_active
  on public.teacher_assignments (student_id)
  where date_fin is null;

-- 3. Attribution atomique. Le client appelait `update` puis `insert` en deux allers-retours ;
--    ici les deux écritures vivent dans la même transaction (le corps d'une fonction plpgsql),
--    donc soit le changement de professeur est complet, soit il n'a pas eu lieu.
--    security definer pour la même raison que `is_admin_etablissement()` (0003) : les
--    contrôles lisent `profiles`, table dont les policies dépendent elles-mêmes de ces
--    fonctions. Les droits sont vérifiés explicitement en tête de fonction.
create or replace function public.attribuer_professeur(
  p_student_id uuid,
  p_teacher_id uuid,
  p_langue text default null,
  p_motif text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etablissement_id uuid;
  v_avait_professeur boolean;
  v_langue text := nullif(btrim(coalesce(p_langue, '')), '');
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

  select exists (
    select 1 from public.teacher_assignments
    where student_id = p_student_id and date_fin is null
  ) into v_avait_professeur;

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
    case when v_avait_professeur then v_motif else null end
  )
  returning id into v_nouvelle_id;

  return v_nouvelle_id;
end;
$$;

revoke all on function public.attribuer_professeur(uuid, uuid, text, text) from public;
grant execute on function public.attribuer_professeur(uuid, uuid, text, text) to authenticated;
