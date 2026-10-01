-- Retrait de la clause de médiation de la consommation des modèles de contrat — demande client du
-- 2026-10-01 : « dans les modèles de contrats, enlève la partie "MÉDIATION DE LA CONSOMMATION", et
-- enlève les zones à renseigner les concernants ».
--
-- Un seul des deux modèles la porte (« Contrat d'inscription et de prestation de cours de langue »,
-- public étudiant) : son ARTICLE 13, et les deux variables `nom_mediateur` /
-- `coordonnees_mediateur` qu'il consomme — ce sont elles, les « zones à renseigner », affichées par
-- LancerApprobationContrat.tsx à chaque émission.
--
-- Écrit en transformation de l'existant (regexp_replace) plutôt qu'en réécriture du corps entier :
-- le modèle a pu être retouché à la main par l'admin depuis sa création (il est éditable dans
-- l'écran Contrats), et un corps figé ici écraserait ces retouches sans le dire.
--
-- Les contrats DÉJÀ ÉMIS ne sont pas touchés : `contracts.corps_genere` est figé à l'émission
-- (0031) et vaut pièce signée — en réécrire le texte après signature serait un faux.

-- 1. Suppression du bloc de l'article, de son titre jusqu'au titre de l'article suivant.
--    `\s*` en fin de motif absorbe la ligne vide laissée derrière, pour ne pas créer un trou.
update public.contract_templates
set corps_template = regexp_replace(
  corps_template,
  'ARTICLE 13 — MÉDIATION DE LA CONSOMMATION.*?\s*(?=ARTICLE 14 —)',
  '',
  'gs'
)
where corps_template like '%MÉDIATION DE LA CONSOMMATION%';

-- 2. Renumérotation des articles suivants : 14→13, 15→14, 16→15. Ordre croissant à dessein —
--    chaque numéro cible est inférieur à sa source, donc aucune collision avec un numéro pas
--    encore traité (14→13 consomme le seul « 14 » avant que 15→14 n'en recrée un).
update public.contract_templates
set corps_template = replace(replace(replace(
  corps_template,
  'ARTICLE 14 — RESPONSABILITÉ', 'ARTICLE 13 — RESPONSABILITÉ'),
  'ARTICLE 15 — LITIGES ET DROIT APPLICABLE', 'ARTICLE 14 — LITIGES ET DROIT APPLICABLE'),
  'ARTICLE 16 — DISPOSITIONS DIVERSES ET SIGNATURE', 'ARTICLE 15 — DISPOSITIONS DIVERSES ET SIGNATURE')
where public_cible = 'etudiant';

-- 3. Les deux variables disparaissent de la liste à renseigner. `jsonb_agg` sur un tableau vidé
--    rendrait `null` : le `coalesce` garde un tableau vide, forme attendue par le code client
--    (`variables_disponibles.map(...)`).
update public.contract_templates
set variables_disponibles = coalesce(
  (
    select jsonb_agg(v)
    from jsonb_array_elements(variables_disponibles) as v
    where v->>'cle' not in ('nom_mediateur', 'coordonnees_mediateur')
  ),
  '[]'::jsonb
)
where variables_disponibles::text like '%mediateur%';
