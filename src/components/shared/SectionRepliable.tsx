import { useState, type CSSProperties, type ReactNode } from 'react'
import { Icone } from '../ui/Icones'

/* Intitulé de section repliable : couleur d'accent (pas la simple variante claire de
   `etiquetteStyle`) pour vraiment se détacher des autres informations du pop-up, comme déjà
   fait pour « Présence » dans CarteSeance.tsx (2026-10-12). Couleur par défaut = l'or de marque,
   déjà la plus répandue pour ce rôle ; `couleur` reste paramétrable pour les pop-up ayant déjà
   leur propre identité (DetailSeanceModale.tsx utilise le bleu depuis le 2026-09-23). */
export function intituleAccentStyle(couleur = 'var(--accent-gold, #e9cf94)'): CSSProperties {
  return { fontSize: 11.5, fontWeight: 800, color: couleur, textTransform: 'uppercase', letterSpacing: 0.6 }
}

/* Section repliable d'un pop-up de séance (compte rendu...) — demande client du 2026-10-13,
   après une première version qui dépliait par défaut (2026-10-13 aussi, même journée) : « mets
   les comptes rendu par défaut plié, c'est à l'utilisateur de le déplier manuellement », chevron
   plus visible, intitulé en couleur d'accent, et une ligne de séparation qui précède l'intitulé
   pour l'aérer du bloc précédent. Un seul composant partagé entre CompteRenduSeance.tsx,
   DetailSeanceModale.tsx et AgendaEtudiant.tsx — avant cette extraction, les trois avaient chacun
   leur propre variante divergée, ce qui avait justement causé l'incohérence remontée la veille. */
export function SectionRepliable({
  titre,
  children,
  couleur,
  ouvertParDefaut = false,
}: {
  titre: string
  children: ReactNode
  couleur?: string
  /* Déplié d'emblée — demande client du 2026-10-20 : juste après la clôture d'une prestation
     externe, le compte rendu doit se proposer tout de suite (même esprit que
     `ouvrirAutomatiquement` sur CompteRenduSeance.tsx), pas rester plié derrière un clic
     supplémentaire. Faux par défaut : la règle du 2026-10-13 (« plié, à l'utilisateur de le
     déplier ») reste celle des trois autres appelants. */
  ouvertParDefaut?: boolean
}) {
  const [plie, setPlie] = useState(!ouvertParDefaut)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: plie ? 0 : 10, borderTop: '1px solid var(--border-soft, var(--border))', paddingTop: 13 }}>
      <button
        type="button"
        onClick={() => setPlie((v) => !v)}
        aria-expanded={!plie}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
      >
        <span style={intituleAccentStyle(couleur)}>{titre}</span>
        {/* Chevron rendu plus visible (demande client du 2026-10-13) : pastille circulaire
            teintée plutôt qu'une simple flèche grise de 13px perdue dans le reste du pop-up. */}
        <span
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 999,
            background: 'rgba(233,207,148,.14)',
            border: '1px solid rgba(233,207,148,.32)',
          }}
        >
          <Icone
            nom="chevron"
            taille={14}
            style={{ color: couleur ?? 'var(--accent-gold, #e9cf94)', transform: plie ? 'none' : 'rotate(90deg)', transition: 'transform .15s' }}
          />
        </span>
      </button>
      {!plie && <div>{children}</div>}
    </div>
  )
}
