-- Demande client du 2026-09-23 : « pour les informations qui diffèrent entre les deux
-- personnes [du duo], il faudrait afficher les informations des deux personnes... que l'on a
-- déjà défini dans la trame diagnostique » — dans l'onglet Parcours pédagogique de l'espace
-- étudiant. Chaque membre d'un binôme a désormais son PROPRE diagnostic_calls (0060, trame à
-- deux vitesses), mais `diagnostic_calls_student_select` (0037) ne laisse lire que SON PROPRE
-- prospect_id — ni l'un ni l'autre ne pouvait donc voir le diagnostic individuel de son
-- partenaire. Règle symétrique : je peux lire le diagnostic dont le titulaire (retrouvé par
-- prospect_id) est mon partenaire DUO, dans un sens comme dans l'autre (principal <-> secondaire).
-- Policy sur `diagnostic_calls`, pas sur `profiles` : aucun risque de la récursion que
-- `est_partenaire_duo()` (0054) évite en étant security definer pour SES propres usages.
create policy "diagnostic_calls_duo_partenaire_select"
  on public.diagnostic_calls for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles titulaire
      where titulaire.prospect_id = diagnostic_calls.prospect_id
        and (titulaire.duo_partenaire_id = auth.uid() or titulaire.id = (select duo_partenaire_id from public.profiles where id = auth.uid()))
    )
  );
