import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { FactureImprimable } from '../facturation/FactureImprimable'
import { BadgeStatutFacture } from './BadgeStatutFacture'
import { GrilleStats, Stat } from '../ui/Stat'
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

export function ListeFactures({ colonne, titreVide, descriptionVide }: ListeFacturesProps) {
  const { profile, idEtudiantEffectif } = useProfileContext()
  // DUO (0054) : côté élève, la facturation vit sous le principal du binôme — `teacher_id`
  // n'est jamais concerné, aucun professeur n'a de duo_partenaire_id.
  const idCible = colonne === 'student_id' ? idEtudiantEffectif : profile?.id
  const [factures, setFactures] = useState<Invoice[]>([])
  /* Le vrai destinataire des factures : `idCible`, pas forcément `profile` (une secondaire DUO
     imprime des factures émises au nom de la principale — voir le module de renommage plus
     bas). Chargé une fois, réutilisé pour toutes les factures de la liste. */
  const [profilCible, setProfilCible] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [factureAImprimer, setFactureAImprimer] = useState<Invoice | null>(null)

  const charger = useCallback(async () => {
    if (!idCible) return
    setLoading(true)
    const [{ data }, { data: profilData }] = await Promise.all([
      supabase.from('invoices').select('*').eq(colonne, idCible).order('date_emission', { ascending: false }),
      idCible === profile?.id ? Promise.resolve({ data: profile }) : supabase.from('profiles').select('*').eq('id', idCible).maybeSingle(),
    ])
    setFactures(data ?? [])
    setProfilCible(profilData ?? null)
    setLoading(false)
  }, [idCible, colonne, profile])

  useEffect(() => {
    charger()
  }, [charger])

  if (loading) return <EtatChargement lignes={3} hauteur={68} />
  if (factures.length === 0) return <EtatVide icone="facturation" titre={titreVide} description={descriptionVide} />

  const total = factures.filter((f) => f.statut !== 'annulee').reduce((somme, f) => somme + f.montant_ttc, 0)
  const regle = factures.filter((f) => f.statut === 'payee').reduce((somme, f) => somme + f.montant_ttc, 0)
  const enAttente = total - regle

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <GrilleStats min={180}>
        <Stat libelle="Total" valeur={total.toFixed(2)} unite="Ar" ton="or" aide="Hors documents annulés" />
        <Stat libelle="Réglé" valeur={regle.toFixed(2)} unite="Ar" ton="teal" />
        <Stat libelle="En attente" valeur={enAttente.toFixed(2)} unite="Ar" ton={enAttente > 0 ? 'bleu' : 'neutre'} />
      </GrilleStats>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {factures.map((f) => (
          <div key={f.id} className="card card-lift" style={{ padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flexGrow: 1, minWidth: 200 }}>
              <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
                {f.numero}
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
            <button onClick={() => setFactureAImprimer(f)} style={boutonSecondaireStyle}>
              Voir / Imprimer
            </button>
          </div>
        ))}
      </div>

      {factureAImprimer && <FactureImprimable facture={factureAImprimer} destinataire={profilCible} onFermer={() => setFactureAImprimer(null)} />}
    </div>
  )
}
