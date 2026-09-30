-- Supports de cours rattachés à un compte rendu de séance — demande client du 2026-09-30 : « au
-- moment de la rédaction du compte rendu, il faudrait rajouter la possibilité au professeur de
-- rattacher des supports de cours liés à la séance, visible par l'étudiant, le professeur, et
-- l'admin ». `on delete set null`, pas cascade : supprimer un compte rendu (nouvelle possibilité
-- admin, même demande) ne doit pas emporter le fichier à l'aveugle côté base — l'endpoint qui
-- gère cette suppression (api/admin/supprimer-compte-rendu.ts) nettoie explicitement le fichier
-- Storage ET la ligne `documents` avant de supprimer le compte rendu lui-même, dans cet ordre,
-- même précaution que api/documents/supprimer.ts.
alter table public.documents
  add column session_report_id uuid references public.session_reports(id) on delete set null;

create index documents_session_report_id on public.documents (session_report_id) where session_report_id is not null;
