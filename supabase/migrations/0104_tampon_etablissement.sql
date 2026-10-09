-- Tampon de l'établissement, en image, appliqué sur les factures, devis et contrats (demande
-- client du 2026-10-09 : « ajoute la possibilité de rajouter le tampon de HOC sous forme
-- d'image, qui sera utilisé sur toutes les factures, devis, et contrats dans l'application »).
-- Même mécanique que la signature de profil (0047) : une image déposée une fois dans l'espace
-- admin, réutilisée automatiquement sur chaque document généré — mais UN tampon par
-- établissement, pas un par profil, d'où une colonne sur `etablissements` plutôt que sur
-- `profiles`, et un chemin de stockage sans identifiant de profil.

alter table public.etablissements add column tampon_path text;

-- Bucket DÉDIÉ, distinct de `signatures` (0047) et de `documents` (0018) : même besoin de
-- lecture large qu'une signature (le tampon doit être visible par n'importe quelle personne de
-- l'établissement qui consulte ou télécharge un document — élève lisant sa facture, professeur
-- relisant son contrat — pas seulement l'admin qui l'a déposé), mais une écriture réservée aux
-- administrateurs : une signature identifie SON auteur (chaque profil écrit la sienne), un
-- tampon identifie l'établissement et n'a donc de sens que déposé par qui en a la charge.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tampons', 'tampons', false, 2097152, array['image/png'])
on conflict (id) do nothing;

-- Lecture : même établissement, comme `signatures_storage_select` (0047) — nécessaire pour
-- qu'un élève ou un professeur, pas seulement l'admin, voie le tampon sur SON propre document.
create policy "tampons_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'tampons'
    and (storage.foldername(name))[1] = public.current_etablissement_id()::text
  );

-- Écriture (dépôt, remplacement, suppression) : réservée à un administrateur de cet
-- établissement, contrairement à `signatures` où chaque profil écrit la sienne — ici il n'y a
-- qu'UN tampon, partagé, qui n'a pas vocation à être modifiable par n'importe quel professeur
-- ou élève authentifié.
create policy "tampons_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tampons'
    and (storage.foldername(name))[1] = public.current_etablissement_id()::text
    and public.is_admin_etablissement()
  );

create policy "tampons_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'tampons'
    and (storage.foldername(name))[1] = public.current_etablissement_id()::text
    and public.is_admin_etablissement()
  )
  with check (
    bucket_id = 'tampons'
    and (storage.foldername(name))[1] = public.current_etablissement_id()::text
    and public.is_admin_etablissement()
  );

create policy "tampons_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tampons'
    and (storage.foldername(name))[1] = public.current_etablissement_id()::text
    and public.is_admin_etablissement()
  );
