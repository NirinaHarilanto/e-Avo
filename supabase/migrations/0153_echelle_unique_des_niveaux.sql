-- Une seule échelle de niveau dans toute l'application — demande client du 2026-10-31 :
-- « il faudrait uniformiser les niveaux dans toute l'application HOC : Beginner, Intermediate,
-- Advanced ».
--
-- Deux échelles désignaient jusqu'ici LA MÊME CHOSE, le niveau d'anglais d'une personne :
--   * le CECRL (A1 → C1, et jusqu'à C2 côté recrutement) pour le quiz écrit, le niveau évalué à
--     l'appel diagnostic, le niveau arrêté au test oral et les tests de recrutement ;
--   * Beginner / Intermediate / Advanced pour les classes de niveau (0074).
-- Le même champ « Niveau évalué » affichait donc « A1 » sur un dossier et « Intermediate » sur
-- un autre. Relevé en base avant cette migration : 20 dossiers en CECRL contre 54 dans l'échelle
-- anglaise.
--
-- C'est l'échelle ANGLAISE qui l'emporte : c'est celle des classes, celle du vocabulaire du
-- client, et celle qui porte déjà la majorité des dossiers. La correspondance appliquée est
-- exactement celle que le client avait fixée le 2026-10-11 et que `categorieDepuisNiveauEstime`
-- utilisait déjà pour choisir une classe — aucun élève ne change donc de classe.
--
-- Rejouable sans risque : chaque `update` est borné aux valeurs de l'ancienne échelle, et ne
-- touche jamais une ligne déjà convertie.

-- Correspondance unique, utilisée par les quatre colonnes ci-dessous. `immutable` : elle ne lit
-- rien d'autre que son argument.
create or replace function public.niveau_anglais_normalise(p_niveau text)
returns text
language sql
immutable
as $$
  select case btrim(coalesce(p_niveau, ''))
    when 'A1' then 'Beginner'
    -- Libellé porté par les lignes écrites avant la migration 0122.
    when 'A1 (débutant)' then 'Beginner'
    when 'A2' then 'Beginner'
    when 'B1' then 'Intermediate'
    when 'B2' then 'Intermediate'
    when 'C1' then 'Advanced'
    -- Le recrutement montait jusqu'à C2 : même sommet d'échelle.
    when 'C2' then 'Advanced'
    -- Niveau de classe ajouté par 0139 puis fusionné dans « Advanced » par 0141, à la demande du
    -- client. Des dossiers le portent encore.
    when 'Pre advanced' then 'Advanced'
    when 'Pre-Advanced' then 'Advanced'
    else null
  end;
$$;

comment on function public.niveau_anglais_normalise(text) is
  'Ramène un ancien niveau CECRL (ou « Pre advanced ») à l''échelle unique de HOC — Beginner, '
  'Intermediate, Advanced (0153). Rend null pour une valeur déjà à l''échelle ou inconnue : '
  'l''appelant ne doit écraser que ce qu''elle sait traduire.';

-- 1. Niveau arrêté à l'appel diagnostic ou au test oral. C'est lui que lit `niveauDefinitif`
--    (src/lib/niveauEtudiant.ts) à défaut de réévaluation, donc celui qu'affiche le dossier.
update public.diagnostic_calls
set niveau_evalue = public.niveau_anglais_normalise(niveau_evalue)
where public.niveau_anglais_normalise(niveau_evalue) is not null;

-- 2. Réévaluations de progression saisies depuis le dossier (0037) : elles priment sur le
--    diagnostic, et c'est là que vivent les niveaux des élèves repris des fiches professeurs.
update public.niveau_evaluations
set niveau = public.niveau_anglais_normalise(niveau)
where public.niveau_anglais_normalise(niveau) is not null;

-- 3. Quiz écrit et test oral d'un candidat au collectif (0063).
update public.test_positionnement_inscriptions
set niveau_estime = public.niveau_anglais_normalise(niveau_estime)
where public.niveau_anglais_normalise(niveau_estime) is not null;

update public.test_positionnement_inscriptions
set niveau_final = public.niveau_anglais_normalise(niveau_final)
where public.niveau_anglais_normalise(niveau_final) is not null;

-- 4. Tests d'anglais d'une candidature de formateur (0082) : trois épreuves notées dans un
--    `jsonb`, plus un niveau global que l'admin peut trancher lui-même. La règle d'embauche est
--    préservée — le minimum exigé était C1, qui devient Advanced, et un B2 refusé hier devient
--    Intermediate, donc toujours sous le seuil.
update public.candidatures_formateurs c
set tests = (
  select jsonb_object_agg(
    cle,
    case
      when jsonb_typeof(valeur) = 'object' and public.niveau_anglais_normalise(valeur->>'niveau') is not null
        then jsonb_set(valeur, '{niveau}', to_jsonb(public.niveau_anglais_normalise(valeur->>'niveau')))
      when cle = 'niveau_global' and public.niveau_anglais_normalise(valeur #>> '{}') is not null
        then to_jsonb(public.niveau_anglais_normalise(valeur #>> '{}'))
      else valeur
    end
  )
  from jsonb_each(c.tests) as e(cle, valeur)
)
where c.tests <> '{}'::jsonb;

-- Les bilans de quiz déjà rédigés (`diagnostic_calls.notes`,
-- `test_positionnement_inscriptions.bilan`) ne sont PAS réécrits : ce sont des comptes rendus
-- figés à la correction, au même titre que `contracts.corps_genere` (0021). Leur première ligne
-- cite le niveau tel qu'il a été annoncé au candidat ce jour-là, et le réécrire a posteriori
-- ferait dire au document autre chose que ce qui a été dit.
