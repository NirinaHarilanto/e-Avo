import { useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useCacheRequete } from '../../hooks/useCacheRequete'
import { supabase } from '../../lib/supabaseClient'
import { FactureImprimable, estRecu } from '../facturation/FactureImprimable'
import type { ActionImpression } from '../facturation/OverlayImpression'
import { BadgeStatutFacture } from './BadgeStatutFacture'
import { GrilleStats, Stat } from '../ui/Stat'
import { Onglets } from '../ui/Onglets'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement } from '../ui/Etats'
import { boutonSecondaireStyle } from '../ui/Boutons'
import type { Database } from '../../types/database.types'

type Invoice = Database['public']['Tables']['invoices']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

interface ListeFacturesProps {
  /* Colonne de rattachement : `student_id` dans l'espace élève, `teacher_id` dans l'espace
     professeur. Les deux pages étaient jusqu'ici deux fichiers quasi identiques. */
  colonne: 'student_id' | 'teacher_id'
  titreVide: string
  descriptionVide: string
}

type Onglet = 'factures' | 'recus'

/* Chargement des factures/reçus de la personne — sorti de ListeFactures pour passer par
   useCacheRequete (demande client du 2026-09-30 : « il faut que les paramètres se mettent à
   jour automatiquement ») : ce composant faisait jusqu'ici sa propre requête locale, hors du
   cache partagé, donc hors de la synchronisation instantanée entre espaces (src/lib/synchro.ts,
   0083bis) — une facture émise par l'admin n'apparaissait qu'au rechargement manuel de la page. */
function useMesFactures(colonne: 'student_id' | 'teacher_id', idCible: string | undefined) {
  const { profile } = useProfileContext()
  const { valeur, loading } = useCacheRequete(idCible ? `mes-factures-${colonne}-${idCible}` : null, async () => {
    const [{ data }, { data: profilData }] = await Promise.all([
      supabase.from('invoices').select('*').eq(colonne, idCible as string).order('date_emission', { ascending: false }),
      idCible === profile?.id ? Promise.resolve({ data: profile }) : supabase.from('profiles').select('*').eq('id', idCible as string).maybeSingle(),
    ])
    return { factures: (data ?? []) as Invoice[], profilCible: (profilData ?? null) as Profile | null }
  })
  return { factures: valeur?.factures ?? [], profilCible: valeur?.profilCible ?? null, loading }
}

/* Une transaction réglée porte à la fois une facture et un reçu (le reçu est ajouté
   automatiquement au solde complet, voir le trigger de la migration 0030/0080) : les compter
   ensemble dans un seul total double le montant affiché — bug signalé par le client le
   2026-09-30. Deux onglets, chacun avec ses propres totaux, comme côté admin
   (FacturationAdmin.tsx, qui a le même souci sur `useFactures()`). */
export function ListeFactures({ colonne, titreVide, descriptionVide }: ListeFacturesProps) {
  const { profile, idEtudiantEffectif } = useProfileContext()
  // DUO (0054) : côté élève, la facturation vit sous le principal du binôme — `teacher_id`
  // n'est jamais concerné, aucun professeur n'a de duo_partenaire_id.
  const idCible = colonne === 'student_id' ? (idEtudiantEffectif ?? undefined) : profile?.id
  const { factures, profilCible, loading } = useMesFactures(colonne, idCible)
  const [onglet, setOnglet] = useState<Onglet>('factures')
  const [factureAImprimer, setFactureAImprimer] = useState<Invoice | null>(null)
  const [action, setAction] = useState<ActionImpression>('voir')

  const { facturesSeules, recusSeuls } = useMemo(
    () => ({
      facturesSeules: factures.filter((f) => !estRecu(f)),
      recusSeuls: factures.filter((f) => estRecu(f)),
    }),
    [factures],
  )
  const listeActive = onglet === 'factures' ? facturesSeules : recusSeuls

  if (loading) return <EtatChargement lignes={3} hauteur={68} />
  if (factures.length === 0) return <EtatVide icone="facturation" titre={titreVide} description={descriptionVide} />

  const total = listeActive.filter((f) => f.statut !== 'annulee').reduce((somme, f) => somme + f.montant_ttc, 0)
  const regle = listeActive.filter((f) => f.statut === 'payee').reduce((somme, f) => somme + f.montant_ttc, 0)
  const enAttente = total - regle

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Onglets
        etiquette="Type de document"
        actif={onglet}
        onChange={setOnglet}
        onglets={[
          { value: 'factures', label: 'Factures', compteur: facturesSeules.length },
          { value: 'recus', label: 'Reçus', compteur: recusSeuls.length },
        ]}
      />

      <GrilleStats min={180}>
        <Stat libelle="Total" valeur={total.toFixed(2)} unite="Ar" ton="or" aide="Hors documents annulés" />
        <Stat libelle="Réglé" valeur={regle.toFixed(2)} unite="Ar" ton="teal" />
        <Stat libelle="En attente" valeur={enAttente.toFixed(2)} unite="Ar" ton={enAttente > 0 ? 'bleu' : 'neutre'} />
      </GrilleStats>

      {listeActive.length === 0 ? (
        <EtatVide
          icone="facturation"
          titre={onglet === 'factures' ? 'Aucune facture pour le moment' : 'Aucun reçu pour le moment'}
          description={
            onglet === 'factures'
              ? "Les factures émises par l'établissement apparaîtront ici."
              : "Un reçu est ajouté automatiquement dès qu'un règlement est intégralement soldé."
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listeActive.map((f) => (
            <div key={f.id} className="card card-lift" style={{ padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flexGrow: 1, minWidth: 200 }}>
                <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
                  {estRecu(f) ? 'Reçu' : 'Facture'} {f.numero}
                </span>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {f.objet}
                  {f.date_emission && <> · émise le {new Date(f.date_emission).toLocaleDateString('fr-FR')}</>}
                </div>
              </div>
              <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
                {f.montant_ttc.toFixed(2)} Ar
              </span>
              <BadgeStatutFacture statut={f.statut} />
              {(['voir', 'imprimer', 'telecharger'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    setAction(a)
                    setFactureAImprimer(f)
                  }}
                  style={{ ...boutonSecondaireStyle, fontSize: 12, padding: '7px 13px' }}
                >
                  {a === 'voir' ? 'Voir' : a === 'imprimer' ? 'Imprimer' : 'Télécharger'}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {factureAImprimer && <FactureImprimable facture={factureAImprimer} destinataire={profilCible} action={action} onFermer={() => setFactureAImprimer(null)} />}
    </div>
  )
}
