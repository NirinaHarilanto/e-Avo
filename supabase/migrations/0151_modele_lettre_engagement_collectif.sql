-- Lettre d'engagement de paiement, troisième modèle de contrat — demande client du 2026-10-31 :
-- « pour les étudiants en cours collectif, une lettre d'engagement pour payer la totalité des
-- frais de scolarité doit être signée [...] Importe ce modèle dans la section contrat. Le
-- mécanisme de signature doit être pareil que le mécanisme de signature des contrats, il faut
-- juste rajouter le template de la lettre d'engagement comme un autre modèle de contrat dans la
-- liste des modèles existants. »
--
-- Rien de neuf côté mécanique, et c'est exactement ce que demande le client : un modèle de plus
-- dans `contract_templates` (0021), donc la même émission nominative, la même substitution de
-- variables (src/lib/contrats.ts), la même signature électronique depuis les deux espaces, et le
-- même instantané figé à l'émission (`corps_genere`).
--
-- Texte repris de « Lettre d'engagement - maquette.pdf » fourni par le client, les pointillés à
-- remplir devenant des {{variables}} — convention déjà en place pour les deux autres modèles.
-- Deux ajustements de forme, signalés :
--   * « Je soussigné, Monsieur ____ » devient « Je soussigné(e), {{nom_etudiant}} » : la majorité
--     des apprenantes de HOC sont des femmes, et le nom est déjà connu de la fiche.
--   * le bloc de signature reprend celui du modèle étudiant (0103), pour que les deux documents
--     se signent et s'impriment de la même façon.
--
-- `insert ... select` et non `insert ... values` : `etablissement_id` et `created_by_profile_id`
-- sont tous deux `not null` et référencent des lignes réelles. Le `where not exists` rend la
-- migration rejouable, et l'empêche de créer un doublon si le modèle a déjà été posé à la main.
insert into public.contract_templates (etablissement_id, nom, public_cible, corps_template, variables_disponibles, created_by_profile_id)
select
  e.id,
  'Lettre d''engagement — paiement en plusieurs tranches',
  'etudiant',
  $corps$LETTRE D'ENGAGEMENT — PAIEMENT EN PLUSIEURS TRANCHES

À {{ville_signature}}, le {{date_signature}}.

Je soussigné(e), {{nom_etudiant}}, titulaire du CIN ou passeport n° {{numero_piece_identite}}, résidant au {{adresse_etudiant}}, m'engage à régler le montant total des prestations de cours d'anglais proposées par Hari Online Club, soit la somme de {{montant_total}}, selon les modalités suivantes :

— 1re tranche : {{montant_tranche_1}}, à régler le {{date_tranche_1}} ;
— 2e tranche : {{montant_tranche_2}}, à régler au plus tard le {{date_tranche_2}}.

L'INSCRIPTION IMPLIQUE UN ENGAGEMENT JUSQU'À LA FIN DU PROGRAMME

Je reconnais avoir pris connaissance des conditions de paiement et m'engage à suivre l'intégralité de la formation. S'agissant d'un package global de {{nombre_heures}} heures, aucun arrêt de formation ne pourra être envisagé une fois le processus engagé, même en cas de paiement partiel ou d'heures déjà consommées.

Je m'engage également à respecter les échéances indiquées ci-dessus.

Fait pour servir et valoir ce que de droit.

La présente lettre est signée électroniquement depuis les espaces respectifs des Parties sur la plateforme, cette signature valant engagement ferme et définitif.


Pour l'Établissement — {{etablissement_directrice}}, CEO de Hari Online Club


L'Étudiant (ou son représentant légal) — {{nom_etudiant}}
Mention « Lu et approuvé » :$corps$,
  $vars$[
    {"cle": "nom_etudiant", "label": "Nom complet de l'étudiant", "source": "nom_complet"},
    {"cle": "numero_piece_identite", "label": "Numéro de CIN ou de passeport"},
    {"cle": "adresse_etudiant", "label": "Adresse de l'étudiant", "source": "adresse"},
    {"cle": "montant_total", "label": "Montant total des frais de scolarité", "source": "montant_programme"},
    {"cle": "nombre_heures", "label": "Nombre d'heures du programme", "source": "heures_programme"},
    {"cle": "montant_tranche_1", "label": "Montant de la 1re tranche (ex. 150 000 Ar)"},
    {"cle": "date_tranche_1", "label": "Date de règlement de la 1re tranche"},
    {"cle": "montant_tranche_2", "label": "Montant de la 2e tranche (ex. 150 000 Ar)"},
    {"cle": "date_tranche_2", "label": "Date limite de règlement de la 2e tranche"},
    {"cle": "ville_signature", "label": "Ville de signature (ex. Antananarivo)"},
    {"cle": "date_signature", "label": "Date de signature"},
    {"cle": "etablissement_directrice", "label": "Nom de la CEO", "source": "etablissement_directrice"}
  ]$vars$::jsonb,
  (
    select p.id from public.profiles p
    where p.etablissement_id = e.id and p.role = 'admin_etablissement'
    order by p.created_at
    limit 1
  )
from public.etablissements e
where exists (
    select 1 from public.profiles p
    where p.etablissement_id = e.id and p.role = 'admin_etablissement'
  )
  and not exists (
    select 1 from public.contract_templates t
    where t.etablissement_id = e.id and t.nom like 'Lettre d''engagement%'
  );
