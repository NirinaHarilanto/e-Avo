-- Policies dépendant des fonctions de 0003 : self-service sur profiles, visibilité admin,
-- et la policy de mise à jour du branding d'établissement reportée depuis 0001.

create policy "profiles_self_select"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_self_update"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Un admin_etablissement voit tous les profils (élèves, professeurs) de son établissement.
create policy "profiles_admin_select_etablissement"
  on public.profiles for select
  to authenticated
  using (
    etablissement_id = public.current_etablissement_id()
    and public.is_admin_etablissement()
  );

-- Mise à jour du branding d'un établissement réservée à son admin (dépend de
-- current_etablissement_id(), d'où le report depuis 0001).
create policy "etablissements_admin_update"
  on public.etablissements for update
  to authenticated
  using (id = public.current_etablissement_id())
  with check (id = public.current_etablissement_id());
