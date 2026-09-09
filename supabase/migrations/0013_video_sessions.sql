-- Table volontairement agnostique du prestataire (cf. visioconférence reportée) : un
-- enregistrement par séance, avec un provider/room_ref génériques. Tant qu'aucun prestataire
-- réel n'est branché, `room_ref` peut contenir un lien factice/configurable saisi par l'admin
-- ou le professeur, pour que l'UI "Rejoindre la visioconférence" soit déjà fonctionnelle de
-- bout en bout côté navigation, même sans salle réelle derrière.
create table public.video_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  provider text,
  room_ref text,
  statut text,
  enregistrement_url text,
  created_at timestamptz not null default now()
);

alter table public.video_sessions enable row level security;

create policy "video_sessions_admin_all"
  on public.video_sessions for all
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = video_sessions.session_id
        and s.etablissement_id = public.current_etablissement_id()
    )
    and public.is_admin_etablissement()
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = video_sessions.session_id
        and s.etablissement_id = public.current_etablissement_id()
    )
    and public.is_admin_etablissement()
  );

create policy "video_sessions_teacher_all"
  on public.video_sessions for all
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = video_sessions.session_id and s.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = video_sessions.session_id and s.teacher_id = auth.uid()
    )
  );

create policy "video_sessions_student_select"
  on public.video_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.session_enrollments se
      where se.session_id = video_sessions.session_id and se.student_id = auth.uid()
    )
  );
