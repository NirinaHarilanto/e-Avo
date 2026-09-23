-- Enquête de satisfaction de fin de séance (demande client du 2026-09-23) : « à chaque fin de
-- séance, l'étudiant devra renseigner une petite enquête de satisfaction... avec un système
-- d'étoiles... visible par l'admin et le professeur ayant fait la séance. »
--
-- Volontairement minimal (template validé avec le client) : note globale obligatoire, note de
-- clarté pédagogique et commentaire facultatifs. Une ligne par élève et par séance, jamais
-- modifiable une fois soumise (pas de policy update/delete côté client) — cohérent avec le reste
-- des saisies « à chaud » de l'application (diagnostic, compte rendu de séance).
create table public.session_satisfaction (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  session_id uuid not null references public.sessions(id),
  student_id uuid not null references public.profiles(id),
  note_globale smallint not null check (note_globale between 1 and 5),
  note_pedagogie smallint check (note_pedagogie between 1 and 5),
  commentaire text,
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);

alter table public.session_satisfaction enable row level security;

create policy "session_satisfaction_student_select"
  on public.session_satisfaction for select
  to authenticated
  using (student_id = auth.uid());

-- Uniquement pour une séance terminée, où l'appelant est soit lui-même inscrit
-- (is_student_of_session, 0033), soit le second membre d'un binôme DUO dont le PRINCIPAL est
-- inscrit — un secondaire n'a jamais sa propre ligne session_enrollments (0054, son dossier est
-- celui du principal) alors qu'il a bien assisté au même cours en visio et a sa propre opinion à
-- donner.
create policy "session_satisfaction_student_insert"
  on public.session_satisfaction for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and exists (select 1 from public.sessions s where s.id = session_id and s.statut = 'terminee')
    and (
      public.is_student_of_session(session_id)
      or exists (
        select 1 from public.profiles moi
        join public.session_enrollments se on se.student_id = moi.duo_partenaire_id
        where moi.id = auth.uid() and se.session_id = session_satisfaction.session_id
      )
    )
  );

create policy "session_satisfaction_admin_select"
  on public.session_satisfaction for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Le professeur ne voit que les enquêtes des séances qu'il a lui-même données.
create policy "session_satisfaction_teacher_select"
  on public.session_satisfaction for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_satisfaction.session_id and s.teacher_id = auth.uid()
    )
  );
