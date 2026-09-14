import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { supabase } from '../../lib/supabaseClient'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { BarreOutils, ChampRecherche } from '../ui/BarreOutils'
import { champStyle } from '../ui/Champ'

type FiltreCharge = 'tous' | 'sans' | 'leger' | 'charge'

const OPTIONS_CHARGE: { value: FiltreCharge; label: string }[] = [
  { value: 'tous', label: 'Toutes les charges' },
  { value: 'sans', label: 'Sans élève actif (0)' },
  { value: 'leger', label: '1 à 2 élèves actifs' },
  { value: 'charge', label: '3 élèves actifs ou plus' },
]

function correspondALaCharge(nb: number, filtre: FiltreCharge): boolean {
  if (filtre === 'tous') return true
  if (filtre === 'sans') return nb === 0
  if (filtre === 'leger') return nb >= 1 && nb <= 2
  return nb >= 3
}

export function ProfesseursAdmin() {
  const navigate = useNavigate()
  const { professeurs, loading, recharger } = useProfesseurs()
  const [comptes, setComptes] = useState<Record<string, number>>({})
  const [heures, setHeures] = useState<Record<string, number>>({})
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [filtreCharge, setFiltreCharge] = useState<FiltreCharge>('tous')

  useEffect(() => {
    if (professeurs.length === 0) return
    const teacherIds = professeurs.map((p) => p.id)
    supabase
      .from('teacher_assignments')
      .select('teacher_id')
      .in('teacher_id', teacherIds)
      .is('date_fin', null)
      .then(({ data }) => {
        const compte: Record<string, number> = {}
        for (const row of data ?? []) {
          compte[row.teacher_id] = (compte[row.teacher_id] ?? 0) + 1
        }
        setComptes(compte)
      })
    supabase
      .from('teacher_hours_summary')
      .select('*')
      .in('teacher_id', teacherIds)
      .then(({ data }) => {
        setHeures(Object.fromEntries((data ?? []).map((row) => [row.teacher_id, row.heures_enseignees])))
      })
  }, [professeurs])

  const totalEleves = Object.values(comptes).reduce((total, n) => total + n, 0)
  const totalHeures = Object.values(heures).reduce((total, n) => total + n, 0)
  const sansEleve = professeurs.filter((p) => (comptes[p.id] ?? 0) === 0).length

  const filtres = useMemo(
    () =>
      professeurs.filter((p) => {
        const correspondNom = `${p.prenom ?? ''} ${p.nom ?? ''} ${p.email ?? ''}`.toLowerCase().includes(recherche.toLowerCase())
        return correspondNom && correspondALaCharge(comptes[p.id] ?? 0, filtreCharge)
      }),
    [professeurs, recherche, filtreCharge, comptes],
  )

  return (
    <AdminLayout actif="Professeurs">
      <EnTetePage
        compact
        titre="Professeurs"
        description="L’équipe enseignante de l’établissement et sa charge actuelle. Cliquez sur une carte pour ouvrir la fiche détaillée du professeur."
        actions={
          <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
            <Icone nom="plus" taille={15} />
            {formulaireOuvert ? 'Fermer' : 'Inviter un professeur'}
          </button>
        }
      />

      <GuidePage
        id="admin-professeurs"
        compact
        etapes={[
          <>
            <strong>Invitez</strong> un professeur par e-mail : il définira son mot de passe et accèdera à son espace,
            où il planifiera lui-même ses séances.
          </>,
          <>
            Ouvrez sa fiche pour voir ses élèves, ses heures enseignées par élève, et renseigner son{' '}
            <strong>taux horaire</strong> — c’est lui qui alimente le calcul des rémunérations.
          </>,
          <>
            L’attribution d’un élève ne se fait pas ici mais depuis le dossier de l’élève, page{' '}
            <strong>Étudiants</strong> : chaque changement y est tracé avec son motif.
          </>,
          <>
            Utilisez la <strong>recherche</strong> ou le filtre par <strong>charge</strong> pour retrouver un
            professeur, ou repérer ceux qui n’ont pas encore d’élève attribué.
          </>,
        ]}
      />

      {formulaireOuvert && (
        <FormulaireInvitation
          endpoint="/api/admin/inviter-professeur"
          roleLabel="un professeur"
          onTermine={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}

      {loading ? (
        <EtatChargement lignes={2} hauteur={130} />
      ) : professeurs.length === 0 ? (
        <EtatVide
          icone="professeurs"
          titre="Aucun professeur pour le moment"
          description="Invitez votre premier professeur pour pouvoir attribuer des élèves et planifier des séances. Tant qu’aucun professeur n’est enregistré, aucun cours ne peut être programmé."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GrilleStats min={160} compact>
            <Stat compact libelle="Professeurs" valeur={professeurs.length} ton="or" />
            <Stat compact libelle="Élèves attribués" valeur={totalEleves} ton="teal" aide="Attributions en cours, tous professeurs confondus" />
            <Stat compact libelle="Heures enseignées" valeur={totalHeures} unite="h" ton="bleu" aide="Depuis l’ouverture de l’établissement" />
            <Stat
              compact
              libelle="Sans élève attribué"
              valeur={sansEleve}
              ton={sansEleve > 0 ? 'alerte' : 'neutre'}
              aide={sansEleve > 0 ? 'Disponibles pour de nouvelles attributions' : 'Tous les professeurs ont au moins un élève'}
            />
          </GrilleStats>

          <BarreOutils>
            <ChampRecherche valeur={recherche} onChange={setRecherche} placeholder="Rechercher un professeur (nom ou e-mail)…" etiquette="Rechercher un professeur" />
            <select
              value={filtreCharge}
              onChange={(e) => setFiltreCharge(e.target.value as FiltreCharge)}
              aria-label="Filtrer par nombre d’élèves actifs"
              style={{ ...champStyle, width: 'auto', minWidth: 200, flexShrink: 0 }}
            >
              {OPTIONS_CHARGE.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </BarreOutils>

          {filtres.length === 0 && (
            <EtatVide
              compact
              icone="recherche"
              titre="Aucun professeur ne correspond"
              description="Essayez un autre nom, ou passez le filtre de charge sur « Toutes les charges »."
            />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
            {filtres.map((prof) => (
              <button
                key={prof.id}
                onClick={() => navigate(`/admin/professeurs/${prof.id}`)}
                className="card card-lift"
                style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--accent-blue-gradient)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>
                    {(prof.prenom?.[0] ?? '').toUpperCase()}
                    {(prof.nom?.[0] ?? '').toUpperCase()}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span className="brand-font" style={{ fontSize: 13.5, color: 'var(--ink)' }}>
                      {prof.prenom} {prof.nom}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {prof.email}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {comptes[prof.id] ?? 0} élève{(comptes[prof.id] ?? 0) > 1 ? 's' : ''} actif{(comptes[prof.id] ?? 0) > 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>{heures[prof.id] ?? 0} h enseignées</span>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: 'var(--accent-blue)' }}>
                  Ouvrir la fiche
                  <Icone nom="chevron" taille={11} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
