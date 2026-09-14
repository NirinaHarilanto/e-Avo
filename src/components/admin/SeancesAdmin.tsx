import { useMemo, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useSeancesAdmin, type SeanceAdmin } from '../../hooks/useSeancesAdmin'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { BadgeStatutSeance } from '../shared/BadgeStatutSeance'
import { EditerSeancePlanifieeModale } from '../shared/EditerSeancePlanifieeModale'
import { initiales } from '../etudiants/DossierEtudiantVue'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { GroupeSection } from '../ui/Section'
import { Onglets } from '../ui/Onglets'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'

const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function lundiDeLaSemaine(date: Date): Date {
  const d = new Date(date)
  const jour = d.getDay()
  const diff = jour === 0 ? -6 : 1 - jour
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

type Vue = 'semaine' | 'globale'

export function SeancesAdmin() {
  const { seances, loading, erreur, recharger } = useSeancesAdmin()
  const { professeurs } = useProfesseurs()
  const [vue, setVue] = useState<Vue>('semaine')
  const [semaineDebut, setSemaineDebut] = useState(() => lundiDeLaSemaine(new Date()))
  const [professeurId, setProfesseurId] = useState<string | null>(null)

  const semaineFin = useMemo(() => {
    const fin = new Date(semaineDebut)
    fin.setDate(fin.getDate() + 7)
    return fin
  }, [semaineDebut])

  const seancesSemaine = useMemo(
    () => seances.filter((s) => s.session.debut >= semaineDebut.toISOString() && s.session.debut < semaineFin.toISOString()),
    [seances, semaineDebut, semaineFin],
  )

  const maintenant = new Date().toISOString()
  const aVenir = seances
    .filter((s) => s.session.statut === 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
  // Chronologique comme le reste des plannings de l'app, y compris l'historique.
  const passees = seances
    .filter((s) => s.session.statut !== 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))

  return (
    <AdminLayout actif="Séances & visio">
      <EnTetePage
        compact
        titre="Séances & visio"
        description="Le planning de tous les cours de l’établissement. Les séances sont créées par les professeurs depuis leur propre espace, ou en lot depuis un forfait étudiant : cette page sert à les consulter et à les suivre."
        actions={
          <Onglets
            etiquette="Mode d’affichage du planning"
            actif={vue}
            onChange={setVue}
            onglets={[
              { value: 'semaine', label: 'Vue par semaine' },
              { value: 'globale', label: 'Vue globale' },
            ]}
          />
        }
      />

      <GuidePage
        id="admin-seances"
        compact
        etapes={[
          <>
            La <strong>vue par semaine</strong> montre l’agenda jour par jour et permet de filtrer par professeur :
            c’est la vue à utiliser pour repérer les chevauchements et les trous dans un planning.
          </>,
          <>
            La <strong>vue globale</strong> liste toutes les séances à venir puis toutes les séances passées, sans
            limite de période : pratique pour retrouver une séance ancienne.
          </>,
          <>
            Une séance passe de « Planifiée » à « Terminée » quand le professeur la clôture depuis son espace. C’est ce
            geste qui alimente les compteurs d’heures et le taux d’assiduité.
          </>,
          <>
            Le lien de visioconférence, quand il existe, apparaît directement sur la ligne de la séance à l’approche de
            son horaire.
          </>,
        ]}
      />

      {erreur && (
        <div style={{ marginBottom: 16 }}>
          <MessageErreur>{erreur}</MessageErreur>
        </div>
      )}

      {!loading && seances.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <GrilleStats min={160} compact>
            <Stat compact libelle="Séances au total" valeur={seances.length} ton="or" />
            <Stat compact libelle="À venir" valeur={aVenir.length} ton="bleu" aide="Statut « planifiée »" />
            <Stat compact libelle="Cette semaine" valeur={seancesSemaine.length} ton="teal" aide="Sur la semaine affichée" />
            <Stat
              compact
              libelle="Annulées"
              valeur={seances.filter((s) => s.session.statut === 'annulee').length}
              ton="neutre"
            />
          </GrilleStats>
        </div>
      )}

      {loading ? (
        <EtatChargement lignes={4} hauteur={74} />
      ) : vue === 'globale' ? (
        seances.length === 0 ? (
          <EtatVide
            icone="seances"
            titre="Aucune séance planifiée"
            description="Les séances apparaîtront ici dès qu’un professeur en programmera depuis son calendrier, ou dès qu’un forfait étudiant sera planifié en lot depuis son dossier."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GroupeSection compact titre={`À venir · ${aVenir.length}`}>
              {aVenir.length === 0 ? (
                <EtatVide compact icone="seances" titre="Aucune séance à venir" description="Toutes les séances programmées sont déjà passées." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {aVenir.map((seance) => (
                    <LigneSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
                  ))}
                </div>
              )}
            </GroupeSection>
            <GroupeSection compact titre={`Passées · ${passees.length}`}>
              {passees.length === 0 ? (
                <EtatVide compact icone="seances" titre="Aucune séance passée" description="L’historique se remplira au fil des séances clôturées." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {passees.map((seance) => (
                    <LigneSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
                  ))}
                </div>
              )}
            </GroupeSection>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <button
              onClick={() => setSemaineDebut((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}
            >
              ← Semaine précédente
            </button>
            <span className="brand-font" style={{ fontSize: 13.5, color: 'var(--ink)' }}>
              Semaine du {semaineDebut.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} au{' '}
              {new Date(semaineFin.getTime() - 86400000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}
            </span>
            <button
              onClick={() => setSemaineDebut((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}
            >
              Semaine suivante →
            </button>
          </div>

          <div style={{ display: 'flex', gap: 14 }}>
            <aside style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => setProfesseurId(null)}
                className="carte-ligne"
                style={{
                  textAlign: 'left',
                  borderRadius: 12,
                  border: professeurId === null ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
                  background: 'var(--surface)',
                  padding: '8px 11px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                Toutes les séances de la semaine
              </button>
              {professeurs.map((prof) => {
                const nb = seancesSemaine.filter((s) => s.professeur?.id === prof.id).length
                return (
                  <button
                    key={prof.id}
                    onClick={() => setProfesseurId(prof.id)}
                    className="carte-ligne"
                    style={{
                      textAlign: 'left',
                      borderRadius: 12,
                      border: professeurId === prof.id ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
                      background: 'var(--surface)',
                      padding: '8px 11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: 26, height: 26, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                      {initiales(prof)}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', flexGrow: 1 }}>
                      {prof.prenom} {prof.nom}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{nb}</span>
                  </button>
                )
              })}
            </aside>

            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <AgendaSemaine
                seances={professeurId ? seancesSemaine.filter((s) => s.professeur?.id === professeurId) : seancesSemaine}
                semaineDebut={semaineDebut}
              />
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function AgendaSemaine({ seances, semaineDebut }: { seances: SeanceAdmin[]; semaineDebut: Date }) {
  const jours = useMemo(() => {
    return JOURS_SEMAINE.map((label, index) => {
      const date = new Date(semaineDebut)
      date.setDate(date.getDate() + index)
      const dateIso = date.toISOString().slice(0, 10)
      const seancesJour = seances
        .filter((s) => s.session.debut.slice(0, 10) === dateIso)
        .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
      return { label, date, seancesJour }
    })
  }, [seances, semaineDebut])

  if (seances.length === 0) {
    return (
      <EtatVide
        icone="seances"
        titre="Aucune séance cette semaine"
        description="Utilisez les flèches ci-dessus pour changer de semaine, ou retirez le filtre par professeur s’il en reste un d’actif."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {jours.map(({ label, date, seancesJour }) => (
        <div key={label} className="card" style={{ padding: '9px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: seancesJour.length ? 7 : 0 }}>
            <span className="brand-font" style={{ fontSize: 12.5, color: 'var(--ink)' }}>
              {label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          </div>
          {seancesJour.length === 0 ? (
            <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0 }}>Aucune séance.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {seancesJour.map((seance) => (
                <div key={seance.session.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.03)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', width: 46, flexShrink: 0 }}>
                    {new Date(seance.session.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="brand-font" style={{ fontSize: 12, color: 'var(--ink)', width: 150, flexShrink: 0 }}>
                    {seance.professeur ? `${seance.professeur.prenom} ${seance.professeur.nom}` : 'Professeur inconnu'}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-2)', flexGrow: 1, minWidth: 150 }}>
                    {seance.session.type === 'individuel' ? 'Individuel' : 'Collectif'} · {seance.session.duree_minutes} min ·{' '}
                    {seance.inscriptions.map((i) => `${i.etudiant?.prenom ?? '?'} ${i.etudiant?.nom ?? ''}`).join(', ') || 'aucun élève inscrit'}
                  </span>
                  <BadgeStatutSeance statut={seance.session.statut} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function LigneSeance({ seance, onChange }: { seance: SeanceAdmin; maintenant: string; onChange: () => void }) {
  const [editionOuverte, setEditionOuverte] = useState(false)
  const modifiable = seance.session.statut === 'planifiee'

  return (
    <div
      onClick={modifiable ? () => setEditionOuverte(true) : undefined}
      className={modifiable ? 'card card-lift row-hl' : 'card card-lift'}
      style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', cursor: modifiable ? 'pointer' : 'default' }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--muted)', width: 150, flexShrink: 0 }}>
        {new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
      <span className="brand-font" style={{ fontSize: 13.5, color: 'var(--ink)', width: 170, flexShrink: 0 }}>
        {seance.professeur ? `${seance.professeur.prenom} ${seance.professeur.nom}` : 'Professeur inconnu'}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1, minWidth: 200 }}>
        {seance.session.type === 'individuel' ? 'Individuel' : 'Collectif'} · {seance.session.duree_minutes} min ·{' '}
        {seance.inscriptions.map((i) => `${i.etudiant?.prenom ?? '?'} ${i.etudiant?.nom ?? ''}`).join(', ') || 'aucun élève inscrit'}
      </span>
      {seance.session.changement_statut === 'en_attente' && (
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', background: 'rgba(255,190,110,.14)', border: '1px solid rgba(255,190,110,.3)', borderRadius: 999, padding: '3px 9px' }}>
          Changement en attente
        </span>
      )}
      <BadgeStatutSeance statut={seance.session.statut} />

      {editionOuverte && (
        <div onClick={(e) => e.stopPropagation()}>
          <EditerSeancePlanifieeModale
            session={seance.session}
            onFermer={() => setEditionOuverte(false)}
            onEnregistre={() => {
              setEditionOuverte(false)
              onChange()
            }}
          />
        </div>
      )}
    </div>
  )
}
