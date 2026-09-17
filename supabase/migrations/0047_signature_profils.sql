-- Signature de contrat sous forme d'image (demande client du 2026-09-17) : chaque profil
-- (admin, professeur, étudiant) peut déposer l'image de sa signature depuis un nouvel espace
-- "Mon profil" ; quand une personne signe un contrat, c'est cette image qui s'affiche sur le
-- document (à défaut, repli texte "Vu et approuvé par {prénom} {nom}", géré côté client).

alter table public.profiles add column signature_path text;

-- Bucket DÉDIÉ, distinct de `documents` (0018) : les policies de `documents` n'autorisent la
-- lecture qu'à l'uploader/owner/admin/prof-de-l'élève, alors qu'une signature de contrat doit
-- être visible par l'AUTRE partie du contrat (l'étudiant doit voir la signature de
-- l'établissement et réciproquement) — un besoin que `documents` ne couvre pas sans affaiblir
-- ses règles pour tout le monde. Chemin fixe {etablissement_id}/{profile_id}/signature.png :
-- un ré-upload écrase l'ancien via `upload(path, file, { upsert: true })`, pas d'orphelin à
-- nettoyer, pas de table de métadonnées nécessaire pour un seul fichier par profil.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 2097152, array['image/png'])
on conflict (id) do nothing;

-- Lecture : même établissement (nécessaire pour que l'autre partie d'un contrat voie la
-- signature). Risque accepté et déjà présent à l'identique sur `documents` (0018) : le chemin
-- contient deux UUID non énumérables sans droit de `list`, donc pas plus exposé que l'existant.
create policy "signatures_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = public.current_etablissement_id()::text
  );

create policy "signatures_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = public.current_etablissement_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "signatures_storage_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'signatures' and (storage.foldername(name))[2] = auth.uid()::text);

create policy "signatures_storage_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[2] = auth.uid()::text);

-- Correctif de sécurité trouvé en préparant ce chantier, sans lien direct avec la signature :
-- `profiles.taux_horaire` (tarif horaire d'un professeur, ajouté en 0029) n'était protégé par
-- aucun garde-fou au-delà de role/etablissement_id/status dans `empecher_promotion_profil`
-- (0015) — un professeur pouvait déjà le modifier lui-même via `profiles_self_update` (0004,
-- qui ne restreint aucune colonne). La nouvelle page "Mon profil" réutilise
-- InformationsPersonnelles.tsx (qui inclut ce champ) en self-service pour le professeur : sans
-- ce correctif, le trou existant deviendrait trivialement exploitable en un clic au lieu de
-- nécessiter la console.
create or replace function public.empecher_promotion_profil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() not in ('service_role', 'postgres') then
    if new.role is distinct from old.role
      or new.etablissement_id is distinct from old.etablissement_id
      or new.status is distinct from old.status
    then
      raise exception 'Modification de role/etablissement_id/status réservée au backend (service_role).';
    end if;
    if new.taux_horaire is distinct from old.taux_horaire and auth.uid() = old.id and not public.is_admin_etablissement() then
      raise exception 'Modification du taux horaire réservée à un administrateur.';
    end if;
  end if;
  return new;
end;
$$;
