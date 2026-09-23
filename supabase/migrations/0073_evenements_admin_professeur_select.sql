-- Le professeur peut désormais créer un rendez-vous « autre » (entretien, séance d'information…)
-- depuis son propre agenda (demande client du 2026-09-23), en plus d'une séance de cours — même
-- distinction que RendezVousAdmin.tsx (point 3 du 2026-09-23). Ces événements vivent dans
-- `evenements_admin` (0044), qui n'avait jusqu'ici qu'une policy pour l'admin
-- ("evenements_admin_admin_all") : un professeur qui les créait via /api/professeur/creer-evenement
-- (clé service_role, contourne le RLS en écriture) ne pouvait ensuite jamais les RELIRE depuis son
-- propre agenda — le client lit toujours via la clé authenticated, soumise au RLS.
--
-- Lecture seule, bornée à son propre établissement et aux événements où il est concerné : créateur,
-- ou participant obligatoire/optionnel. L'écriture (création/annulation) continue de passer par les
-- routes serveur (api/professeur/creer-evenement.ts, api/professeur/annuler-evenement.ts), comme
-- pour l'admin (voir teacherAuth.ts : aucune policy d'écriture professeur n'est nécessaire ici).
create policy "evenements_admin_teacher_select"
  on public.evenements_admin for select
  to authenticated
  using (
    etablissement_id = public.current_etablissement_id()
    and (
      cree_par = auth.uid()
      or auth.uid() = any(participants_obligatoires)
      or auth.uid() = any(participants_optionnels)
    )
  );
