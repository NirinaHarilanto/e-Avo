-- Un diagnostic call peut désormais être rattaché directement à un ÉTUDIANT — demande client du
-- 2026-11-04, dans le cadre de l'assistant de création manuelle d'un étudiant : « on doit pouvoir
-- renseigner [...] son diagnostic call ».
--
-- Le blocage était structurel, pas un oubli d'interface : `diagnostic_calls.prospect_id` est
-- `not null` depuis 0006, et un étudiant créé à la main par api/admin/inviter-etudiant.ts n'a
-- aucun prospect (`profiles.prospect_id` reste nul). Aucune ligne de diagnostic ne pouvait donc
-- lui être attachée, et l'administration n'avait nulle part où consigner l'appel qu'elle venait
-- de mener avec lui.
--
-- Écarté : créer un prospect « technique » derrière chaque élève. Il serait entré dans le
-- pipeline commercial et aurait faussé les taux de conversion — exactement le travers corrigé le
-- 2026-10-19 (voir la règle « supprimé ne doit plus empêcher ni compter »).

begin;

alter table public.diagnostic_calls
  add column student_id uuid references public.profiles(id) on delete cascade,
  alter column prospect_id drop not null;

-- Un diagnostic porte sur UNE personne : soit un prospect (parcours commercial), soit un étudiant
-- (créé à la main). Jamais les deux, jamais aucun des deux — sans cette contrainte, une ligne
-- orpheline passerait inaperçue et n'apparaîtrait dans aucun des deux écrans.
alter table public.diagnostic_calls
  add constraint diagnostic_calls_une_seule_personne
  check (num_nonnulls(prospect_id, student_id) = 1);

create index diagnostic_calls_student on public.diagnostic_calls (student_id);

comment on column public.diagnostic_calls.student_id is
  'Étudiant créé à la main, sans passage par le pipeline prospect (0158). Exclusif avec '
  'prospect_id : un diagnostic porte sur une personne et une seule.';

-- L'élève doit lire SON diagnostic. `diagnostic_calls_student_select` (0037) ne joint que par
-- `profiles.prospect_id` : elle ne voit donc rien d'une ligne portée par `student_id`. Deuxième
-- policy plutôt que réécriture de la première — les deux chemins coexistent, et toucher à
-- l'existante risquerait de fermer l'accès aux dossiers venus du pipeline.
create policy "diagnostic_calls_student_direct_select"
  on public.diagnostic_calls for select
  to authenticated
  using (student_id = auth.uid());

-- Le partenaire d'un binôme lit aussi le diagnostic de l'autre (règle posée en 0065) : la même
-- ouverture est due quand la ligne est portée par `student_id`, sans quoi un DUO créé à la main
-- se comporterait autrement qu'un DUO venu du pipeline.
create policy "diagnostic_calls_duo_partenaire_direct_select"
  on public.diagnostic_calls for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles moi
      where moi.id = auth.uid() and moi.duo_partenaire_id = diagnostic_calls.student_id
    )
    or exists (
      select 1 from public.profiles autre
      where autre.id = diagnostic_calls.student_id and autre.duo_partenaire_id = auth.uid()
    )
  );

-- Le professeur d'un élève voit son diagnostic, comme il voit déjà son niveau (0072) : c'est ce
-- qui lui dit où l'élève en est avant la première séance.
create policy "diagnostic_calls_teacher_direct_select"
  on public.diagnostic_calls for select
  to authenticated
  using (student_id is not null and public.is_teacher_of_student(student_id));

commit;
