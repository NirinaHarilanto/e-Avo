-- Permet à l'admin d'un établissement de renseigner son lien Calendly, affiché sur la landing
-- publique (section réservation) à la place du sélecteur de disponibilités générique.
alter table public.etablissements
  add column calendly_url text;

-- Corrige au passage "etablissements_admin_update" (0004) : la policy ne vérifiait que
-- l'appartenance à l'établissement (id = current_etablissement_id()), pas le rôle admin — tout
-- profil approuvé (élève ou professeur) de l'établissement pouvait donc déjà modifier son
-- branding (nom, slug, couleur, logo) via un appel client direct, malgré le commentaire de 0004
-- ("réservée à son admin") qui indiquait une intention jamais appliquée. Nécessaire maintenant
-- que cette policy va aussi gouverner l'écriture de calendly_url depuis l'espace admin.
drop policy "etablissements_admin_update" on public.etablissements;

create policy "etablissements_admin_update"
  on public.etablissements for update
  to authenticated
  using (id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (id = public.current_etablissement_id() and public.is_admin_etablissement());
