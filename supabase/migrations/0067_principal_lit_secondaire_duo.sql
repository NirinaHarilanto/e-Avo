-- Suite immédiate de 0066 : `profiles_duo_partenaire_select` (0054) ne couvrait que la lecture
-- du PRINCIPAL par le SECONDAIRE (« la secondaire doit pouvoir lire le profil de sa principale »).
-- La direction inverse n'existait pas — nécessaire maintenant qu'un contrat DUO doit afficher
-- l'identité des DEUX destinataires à l'un comme à l'autre (MesContrats.tsx : le principal doit
-- voir qui est son partenaire pour comprendre où en est la double signature, et réciproquement).
-- Prédicat simple sur une colonne, pas de sous-requête sur `profiles` : aucun risque de la
-- récursion que `est_partenaire_duo()` (0054) évite par ailleurs en étant security definer.
create policy "profiles_principal_lit_secondaire_duo"
  on public.profiles for select
  to authenticated
  using (duo_partenaire_id = auth.uid());
