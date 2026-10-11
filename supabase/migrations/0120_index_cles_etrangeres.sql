-- Index sur les clés étrangères les plus sollicitées — revue de performance du 2026-10-11.
--
-- Constat : 110 clés étrangères du schéma n'avaient AUCUN index. Postgres n'en crée pas
-- automatiquement (contrairement aux clés primaires et aux contraintes d'unicité), et deux effets
-- en découlent, tous deux invisibles aux volumes actuels :
--
--   1. Lecture. La RLS de ce projet filtre presque toujours sur `etablissement_id`, et ses
--      fonctions `security definer` (is_teacher_of_student, est_membre_de_vague…) rejoignent
--      `profiles`, `sessions`, `cohort_enrollments`… à CHAQUE ligne évaluée. Sans index, chacune
--      de ces vérifications est un parcours séquentiel complet de la table.
--   2. Écriture. Supprimer une ligne référencée (un profil, un établissement, un forfait) force
--      Postgres à parcourir intégralement chaque table qui la référence pour vérifier la
--      contrainte — en gardant un verrou pendant ce temps.
--
-- Portée volontairement limitée aux colonnes réellement interrogées par l'application, pas aux
-- 110 : un index a un coût en écriture et en espace, et indexer une colonne que personne ne filtre
-- (`supprime_par`, `decidee_par_profile_id`, `traite_par`…) ne rendrait rien en échange.
--
-- `if not exists` partout : la migration doit pouvoir être rejouée sans erreur, comme les
-- précédentes. Créés sans `concurrently` : les tables visées sont petites (quelques centaines de
-- lignes au plus), la prise de verrou est de l'ordre de la milliseconde — `concurrently` serait à
-- reconsidérer si cette migration devait être rejouée sur une base déjà volumineuse.

-- --- Portée établissement : filtrée par presque toutes les policies RLS ---
create index if not exists idx_profiles_etablissement on public.profiles (etablissement_id);
create index if not exists idx_prospects_etablissement on public.prospects (etablissement_id);
create index if not exists idx_sessions_etablissement on public.sessions (etablissement_id);
create index if not exists idx_packages_etablissement on public.packages (etablissement_id);
create index if not exists idx_hour_ledger_etablissement on public.hour_ledger (etablissement_id);
create index if not exists idx_documents_etablissement on public.documents (etablissement_id);
create index if not exists idx_student_payments_etablissement on public.student_payments (etablissement_id);
create index if not exists idx_teacher_payments_etablissement on public.teacher_payments (etablissement_id);
create index if not exists idx_contracts_etablissement on public.contracts (etablissement_id);
create index if not exists idx_cohorts_etablissement on public.cohorts (etablissement_id);
create index if not exists idx_cohort_enrollments_etablissement on public.cohort_enrollments (etablissement_id);
create index if not exists idx_cohort_classes_etablissement on public.cohort_classes (etablissement_id);
create index if not exists idx_notifications_etablissement on public.notifications (etablissement_id);
create index if not exists idx_messages_etablissement on public.messages (etablissement_id);
create index if not exists idx_session_reports_etablissement on public.session_reports (etablissement_id);
create index if not exists idx_tarifs_etablissement on public.tarifs (etablissement_id);

-- --- Portée élève : tout l'espace étudiant et tous les dossiers de l'admin ---
create index if not exists idx_session_enrollments_student on public.session_enrollments (student_id);
create index if not exists idx_packages_student on public.packages (student_id);
create index if not exists idx_hour_ledger_student on public.hour_ledger (student_id);
create index if not exists idx_student_payments_student on public.student_payments (student_id);
create index if not exists idx_cohort_enrollments_student on public.cohort_enrollments (student_id);
create index if not exists idx_session_satisfaction_student on public.session_satisfaction (student_id);
create index if not exists idx_niveau_evaluations_student on public.niveau_evaluations (student_id);
create index if not exists idx_documents_owner on public.documents (owner_profile_id);
create index if not exists idx_notifications_destinataire on public.notifications (destinataire_profile_id);

-- --- Portée professeur : agenda, heures, rémunérations ---
create index if not exists idx_sessions_teacher on public.sessions (teacher_id);
create index if not exists idx_teacher_assignments_teacher on public.teacher_assignments (teacher_id);
create index if not exists idx_hour_ledger_teacher on public.hour_ledger (teacher_id);
create index if not exists idx_session_reports_teacher on public.session_reports (teacher_id);
create index if not exists idx_teacher_payments_teacher on public.teacher_payments (teacher_id);
create index if not exists idx_cohorts_teacher on public.cohorts (teacher_id);
create index if not exists idx_cohort_classes_teacher on public.cohort_classes (teacher_id);

-- --- Binôme DUO : résolu à chaque chargement de liste et de dossier ---
create index if not exists idx_profiles_duo_partenaire on public.profiles (duo_partenaire_id);
create index if not exists idx_prospects_duo_partenaire on public.prospects (duo_partenaire_id);

-- --- Contrats : lus par destinataire dans les trois espaces ---
create index if not exists idx_contracts_destinataire on public.contracts (destinataire_profile_id);
create index if not exists idx_contracts_destinataire_secondaire on public.contracts (destinataire_secondaire_profile_id);

-- --- Facturation : rapprochements document <-> encaissement ---
create index if not exists idx_invoices_student on public.invoices (student_id);
create index if not exists idx_invoices_teacher on public.invoices (teacher_id);
create index if not exists idx_invoices_payment on public.invoices (payment_id);
create index if not exists idx_invoices_quote on public.invoices (quote_id);
create index if not exists idx_quotes_student on public.quotes (student_id);
create index if not exists idx_hour_ledger_timesheet on public.hour_ledger (timesheet_id);
create index if not exists idx_hour_ledger_teacher_payment on public.hour_ledger (teacher_payment_id);

-- --- Divers chemins chauds ---
create index if not exists idx_session_modifications_session on public.session_modifications (session_id);
create index if not exists idx_rendez_vous_prospect on public.rendez_vous (prospect_id);
create index if not exists idx_document_partages_par on public.document_partages (partage_par_profile_id);
