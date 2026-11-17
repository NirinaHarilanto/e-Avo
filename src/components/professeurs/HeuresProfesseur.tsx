import { useState } from 'react'
import { seanceCloturable } from '../../lib/seances'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur } from '../../hooks/useCalendrierProfesseur'
import { useBonusProfesseur, usePrestationsExtra } from '../../hooks/useBonusProfesseur'
import { totalBonus } from '../../lib/bonusProfesseur'
import { totauxExtra } from '../../lib/prestationsExtra'
import { formaterMontant } from '../../lib/paiements'
import { initiales } from '../etudiants/DossierEtudiantVue'
import { EnTetePage } from '../ui/EnTetePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, EtatChargementStats } from '../ui/Etats'
import { boutonSecondaireStyle } from '../ui/Boutons'
import { formaterHeures } from '../../lib/heures'
import { KpiSatisfaction } from './KpiSatisfaction'
import { PrestationsExternes } from './PrestationsExternes'
import { TimesheetProfesseur } from './TimesheetProfesseur'
import { HistoriqueBonusModale } from './HistoriqueBonusModale'
import { HistoriqueExtraModale } from './HistoriqueExtraModale'

export function HeuresProfesseur() {
  const { profile } = useProfileContext()
  const { seances, heuresEnseignees, loading } = useCalendrierProfesseur(profile?.id)
  /* Bonus (0162) — demande client du 2026-11-18 : « est-ce que tu as rajouté le bloc Bonus du
     côté espace professeurs, en mode lecture uniquement ? [...] le professeur aurait le bouton
     "Voir" pour voir l'historique. » Jamais « Modifier » ici : accorder ou corriger un bonus
     reste une décision de l'administration (voir ProfesseurDetailAdmin.tsx). */
  const { bonus } = useBonusProfesseur(profile?.id)
  const [bonusOuvert, setBonusOuvert] = useState(false)
  const totauxBonus = totalBonus(bonus)
  /* Extra (0163) : même traitement que les bonus — visible, en lecture seule. */
  const { extras } = usePrestationsExtra(profile?.id)
  const [extraOuvert, setExtraOuvert] = useState(false)
  const totauxDesExtras = totauxExtra(extras)

  const parEtudiant = new Map<string, { prenom: string | null; nom: string | null; heures: number; seances: number }>()
  for (const seance of seances) {
    if (seance.session.statut !== 'terminee') continue
    for (const inscription of seance.inscriptions) {
      const existant = parEtudiant.get(inscription.student_id) ?? {
        prenom: inscription.etudiant?.prenom ?? null,
        nom: inscription.etudiant?.nom ?? null,
        heures: 0,
        seances: 0,
      }
      existant.heures += seance.session.duree_minutes / 60
      existant.seances += 1
      parEtudiant.set(inscription.student_id, existant)
    }
  }
  const repartition = [...parEtudiant.entries()].sort((a, b) => b[1].heures - a[1].heures)
  const seancesCloturees = seances.filter((s) => s.session.statut === 'terminee').length
  // Même règle que le bouton « Clôturer » (2026-11-04) : 5 min avant la fin prévue.
  const aCloturer = seances.filter((s) => seanceCloturable(s.session)).length
  const maximum = repartition[0]?.[1].heures ?? 0

  return (
    <ProfesseurLayout actif="Mes heures">
      <EnTetePage
        titre="Mes heures"
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <EtatChargementStats tuiles={3} />
          <EtatChargement lignes={1} hauteur={200} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <GrilleStats>
            <Stat libelle="Total heures enseignées" valeur={formaterHeures(heuresEnseignees)} ton="or" />
            <Stat libelle="Séances clôturées" valeur={seancesCloturees} ton="teal" />
            <Stat
              libelle="Séances passées à clôturer"
              valeur={aCloturer}
              ton={aCloturer > 0 ? 'alerte' : 'neutre'}
              aide={aCloturer > 0 ? 'Elles ne sont pas encore comptées dans votre total' : 'Vous êtes à jour'}
            />
            <Stat
              libelle="Bonus"
              valeur={formaterMontant(totauxBonus.enAttente)}
              ton={totauxBonus.enAttente > 0 ? 'or' : 'neutre'}
              aide={totauxBonus.paye > 0 ? `${formaterMontant(totauxBonus.paye)} déjà payés` : 'En attente de paiement'}
              pied={
                <button onClick={() => setBonusOuvert(true)} style={{ ...boutonSecondaireStyle, fontSize: 11, padding: '5px 10px' }}>
                  Voir
                </button>
              }
            />
            <Stat
              libelle="Extra"
              valeur={formaterMontant(totauxDesExtras.aPayer)}
              ton={totauxDesExtras.aPayer > 0 ? 'or' : 'neutre'}
              aide={
                totauxDesExtras.planifie > 0
                  ? `${formaterMontant(totauxDesExtras.planifie)} planifiés`
                  : totauxDesExtras.paye > 0
                    ? `${formaterMontant(totauxDesExtras.paye)} déjà payés`
                    : 'Prestations ponctuelles'
              }
              pied={
                <button onClick={() => setExtraOuvert(true)} style={{ ...boutonSecondaireStyle, fontSize: 11, padding: '5px 10px' }}>
                  Voir
                </button>
              }
            />
          </GrilleStats>

          {extraOuvert && profile && (
            <HistoriqueExtraModale
              nomProfesseur={`${profile.prenom} ${profile.nom}`}
              extras={extras}
              onFermer={() => setExtraOuvert(false)}
            />
          )}

          {bonusOuvert && profile && (
            <HistoriqueBonusModale
              nomProfesseur={`${profile.prenom} ${profile.nom}`}
              bonus={bonus}
              onFermer={() => setBonusOuvert(false)}
            />
          )}

          <TimesheetProfesseur />

          <Section
            titre="Répartition par élève"
            compteur={repartition.length}
          >
            {repartition.length === 0 ? (
              <EtatVide
                icone="heures"
                titre="Aucune séance clôturée pour le moment"
                description="Dès que vous aurez clôturé une première séance depuis votre agenda, la répartition de vos heures apparaîtra ici."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {repartition.map(([studentId, ligne]) => (
                  <div key={studentId} className="row-hl" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 6px', borderBottom: '1px solid var(--border-soft)' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--voile, rgba(255,255,255,.06))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {initiales({ prenom: ligne.prenom, nom: ligne.nom })}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexGrow: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                        {ligne.prenom} {ligne.nom}
                      </span>
                      <span style={{ display: 'block', height: 4, borderRadius: 999, background: 'var(--fond-champ, rgba(0,0,0,.22))', overflow: 'hidden' }}>
                        <span
                          style={{
                            display: 'block',
                            height: '100%',
                            width: maximum > 0 ? `${(ligne.heures / maximum) * 100}%` : '0%',
                            background: 'var(--accent-blue)',
                            borderRadius: 999,
                          }}
                        />
                      </span>
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>
                      {ligne.seances} séance{ligne.seances > 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', flexShrink: 0 }}>{formaterHeures(ligne.heures)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Le même bloc que sur la fiche admin, en lecture et clôture : « le bloc devra être
              également visible dans l'espace professeur » (2026-10-19). Le professeur ne crée pas
              ses propres prestations — c'est l'administration qui les engage. */}
          <PrestationsExternes professeur={profile} peutCloturer />

          <KpiSatisfaction teacherId={profile?.id} />
        </div>
      )}
    </ProfesseurLayout>
  )
}
