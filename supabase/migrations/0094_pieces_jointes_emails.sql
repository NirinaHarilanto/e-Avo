-- Pièces jointes des e-mails envoyés depuis un modèle (0091) — demande client du 2026-10-01 :
-- « mets la possibilité de rajouter une pièce jointe ».
--
-- Bucket dédié plutôt que le bucket `documents` existant : là-bas, la RLS de `storage.objects`
-- exige qu'une ligne `documents` porte déjà le `storage_path` du fichier (0018/0086). Joindre une
-- brochure à un mail obligerait donc à créer une pièce dans l'espace documentaire de l'admin,
-- qui n'a rien à y faire et polluerait son explorateur. Un bucket à part garde les deux usages
-- distincts.
--
-- 10 Mo : les pièces jointes des modèles sont des brochures, procédures, lettres d'engagement et
-- factures. Resend accepte davantage, mais un e-mail de 20 Mo est refusé par la plupart des
-- messageries de destination — mieux vaut le dire au moment du dépôt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pieces-jointes-emails',
  'pieces-jointes-emails',
  false,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

/* Dépôt et relecture réservés à l'admin de l'établissement : la sous-section Template e-mails est
   côté admin uniquement. L'envoi lui-même relit le fichier avec la clé de service (qui ignore la
   RLS), ces policies ne servent donc qu'au navigateur de l'admin. */
create policy "pieces_jointes_emails_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'pieces-jointes-emails' and public.is_admin_etablissement());

create policy "pieces_jointes_emails_admin_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'pieces-jointes-emails' and public.is_admin_etablissement());

create policy "pieces_jointes_emails_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'pieces-jointes-emails' and public.is_admin_etablissement());
