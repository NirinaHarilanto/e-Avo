-- Demande client du 2026-10-20, capture à l'appui : « Agendas Google des professeurs » affichait
-- « Professeur HOC HOKA » et « PROX 2 professeur 2 » comme « Non connecté », à relancer. Les deux
-- sont des comptes SUPPRIMÉS (status = 'suspended') — vérifié en base : sur les 5 lignes « role =
-- professeur » de l'établissement, 4 sont supprimées et une seule est le vrai professeur actif.
--
-- Cause : `google_agendas_professeurs_statut` (0107) filtre par rôle et par établissement, jamais
-- par statut — exactement le même trou que celui déjà comblé ailleurs dans l'app pour un compte
-- supprimé qui continue d'empêcher ou de compter ce qu'il ne devrait plus (voir le commentaire de
-- tête de api/admin/supprimer-utilisateur.ts). Ici, il gonflait le bandeau d'alerte « N
-- professeurs n'ont pas encore d'agenda synchronisé » de comptes qui n'existent plus pour
-- personne ailleurs dans l'application.
--
-- `create or replace view` : la vue change de définition, sans rien supprimer ni recréer les
-- objets qui en dépendent (`grant select`, policies éventuelles) — PostgreSQL l'autorise tant que
-- les colonnes en sortie restent les mêmes, ce qui est le cas ici.

begin;

create or replace view public.google_agendas_professeurs_statut as
select
  p.id as profile_id,
  p.prenom,
  p.nom,
  p.email,
  gip.google_email,
  gip.connecte_le,
  gip.derniere_erreur,
  gip.scope
from public.profiles p
left join public.google_integrations_personnelles gip on gip.profile_id = p.id
where p.role = 'professeur'
  and p.status <> 'suspended'
  and p.etablissement_id = public.current_etablissement_id()
  and public.is_admin_etablissement();

-- Même trou, même principe, pour les demandes de changement d'adresse (0112) : une demande
-- laissée par un professeur depuis supprimé n'a plus personne à qui la rattacher.
create or replace view public.demandes_agenda_google_admin as
select
  d.id,
  d.profile_id,
  p.prenom,
  p.nom,
  p.email,
  d.google_email_actuel,
  d.google_email_souhaite,
  d.motif,
  d.statut,
  d.motif_refus,
  d.decide_le,
  d.created_at
from public.demandes_agenda_google d
join public.profiles p on p.id = d.profile_id
where d.etablissement_id = public.current_etablissement_id()
  and p.status <> 'suspended'
  and public.is_admin_etablissement();

commit;
