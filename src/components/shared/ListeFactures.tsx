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

interface ListeFacturesProps {
  /* Colonne de rattachement : `student_id` dans l'espace élève, `teacher_id` dans l'espace
     professeur. Les deux pages étaient jusqu'ici deux fichiers quasi identiques. */
  colonne: 'student_id' | 'teacher_id'
  titreVide: string
  descriptionVide: string
}

export function ListeFactures({ colonne, titreVide, descriptionVide }: ListeFacturesProps) {
  const { profile } = useProfileContext()
  const [factures, setFactures] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [factureAImprimer, setFactureAImprimer] = useState<Invoice | null>(null)

  const charger = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data } = await supabase.from('invoices').select('*').eq(colonne, profile.id).order('date_emission', { ascending: false })
    setFactures(data ?? [])
    setLoading(false)
  }, [profile, colonne])

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

      {factureAImprimer && <FactureImprimable facture={factureAImprimer} destinataire={profile} onFermer={() => setFactureAImprimer(null)} />}
    </div>
  )
}
