-- Reprise d'antériorité : les heures déjà suivies avant la mise en service de l'application.
--
-- Demande client du 2026-10-29, à l'occasion de la reprise des vraies données. Les fiches des
-- professeurs tiennent, pour chaque élève, le forfait souscrit ET les heures qu'il lui reste —
-- « forfait 40 h, reste 26 h » veut dire 14 h déjà suivies. L'application ne savait reprendre
-- qu'une moitié de cette information : les heures consommées ne s'écrivent que par la clôture
-- d'une séance (0011), si bien que la seule façon d'afficher le bon restant était de mettre le
-- RESTE dans `packages.total_heures`. Un dossier annonçait alors « forfait 26 h » à un élève qui
-- en a souscrit 40, son montant payé ne correspondait plus à ses heures, et les 14 h suivies
-- n'existaient nulle part.
--
-- `hour_ledger` reçoit donc une troisième source, à côté de la séance (0011) et de la prestation
-- externe (0131) : le FORFAIT lui-même. Une écriture de reprise porte `package_id` et signifie
-- « heures suivies avant que l'application n'en tienne le compte ». Inventer des séances aurait
-- été l'autre voie : elle fabriquait des dates, des horaires et des professeurs qui n'ont jamais
-- existé, polluait les plannings et les relevés d'heures, et aurait rendu les professeurs
-- créditeurs d'heures déjà réglées hors application.
--
-- Rien d'autre ne bouge dans le code : la vue `student_hours_summary` (0012) somme les débits
-- sans regarder d'où ils viennent, et les écrans qui comptent les heures D'UNE VAGUE joignent,
-- eux, par `session_id` (FicheCandidatCollectifModale, api/_lib/finDeForfait.ts) — une reprise,
-- qui n'en a pas, n'y entre jamais. C'est exactement ce qu'il faut : elle précède la vague.

begin;

alter table public.hour_ledger
  add column package_id uuid references public.packages(id) on delete cascade;

comment on column public.hour_ledger.package_id is
  'Forfait dont cette écriture reprend les heures suivies AVANT la mise en service (0140). Exclusif avec session_id et prestation_externe_id.';

-- `num_nonnulls(session_id, prestation_externe_id) = 1` (0131) devient une contrainte à trois
-- sources : une écriture en porte toujours exactement une.
alter table public.hour_ledger drop constraint hour_ledger_une_seule_source;

alter table public.hour_ledger
  add constraint hour_ledger_une_seule_source
  check (num_nonnulls(session_id, prestation_externe_id, package_id) = 1);

-- Une reprise ne peut être qu'un débit d'élève : créditer un professeur d'heures données avant
-- la mise en service le ferait entrer dans son TimeSheet (0081) et le ferait payer une seconde
-- fois pour des cours déjà réglés hors application.
alter table public.hour_ledger
  add constraint hour_ledger_reprise_debit_etudiant
  check (package_id is null or (type_ecriture = 'debit_etudiant' and student_id is not null));

-- Une seule reprise par forfait — même rôle que `hour_ledger_credit_unique` (0011) et
-- `hour_ledger_credit_prestation_unique` (0131) : un import rejoué ne doit jamais débiter deux
-- fois les mêmes heures. L'index est partiel, sans quoi tous les débits de séance (package_id
-- nul) entreraient en collision. Rappel de 0011 : deux NULL ne sont jamais égaux en SQL, mais un
-- index unique les stocke quand même — le `where` est ce qui les tient hors de l'index.
create unique index hour_ledger_reprise_unique
  on public.hour_ledger (package_id)
  where package_id is not null;

commit;
