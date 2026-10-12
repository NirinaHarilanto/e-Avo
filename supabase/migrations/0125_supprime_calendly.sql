-- Retire le lien Calendly (0025) — demande client du 2026-10-12 après vérification exhaustive :
-- son seul consommateur possible, FormulaireProspect.tsx, n'était importé nulle part dans
-- l'application. Le vrai mécanisme de réservation d'appel diagnostic est celui bâti par 0042
-- (creneaux_disponibilites/reservation_parametres/rendez_vous), lui-même construit EN
-- REMPLACEMENT de Calendly (le commentaire de 0042 cite ses limites : le prospect quittait le
-- site, ses réponses n'arrivaient jamais en base, l'établissement devait recopier le rendez-vous
-- à la main). Rien ne lit donc plus `calendly_url` au moment de cette migration.

alter table public.etablissements drop column if exists calendly_url;
