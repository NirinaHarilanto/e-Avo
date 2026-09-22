-- Complète 0061 : un membre secondaire d'un binôme DUO (0054) demande un forfait pour le
-- dossier PARTAGÉ (celui du principal), pas pour son propre id de connexion — la policy insert
-- de 0061 (`student_id = auth.uid()`) refuserait donc systématiquement sa demande. Même garde
-- que partout ailleurs dans le schéma DUO : `est_partenaire_duo()`, security definer.
drop policy "demandes_forfait_student_insert" on public.demandes_forfait;

create policy "demandes_forfait_student_insert"
  on public.demandes_forfait for insert
  to authenticated
  with check (statut = 'en_attente' and (student_id = auth.uid() or public.est_partenaire_duo(student_id)));

drop policy "demandes_forfait_student_select" on public.demandes_forfait;

create policy "demandes_forfait_student_select"
  on public.demandes_forfait for select
  to authenticated
  using (student_id = auth.uid() or public.est_partenaire_duo(student_id));
