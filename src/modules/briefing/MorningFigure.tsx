// Kleine Figur auf dem Hügel, seitlich gesehen (schaut nach links, zum Board): steht mit einer Tasse,
// aus der Dampf steigt, trinkt ab und zu einen Schluck, atmet, blinzelt und wiegt sich leicht.
// Passt sich dem Wetter an: Schirm bei Regen, Mütze und Schal bei Kälte, Sonnenhut bei Hitze. Flach in Campfire-Tönen.
// Zwei Figuren, die sich abwechseln: „f“ (Zopf, Pulli in Beere) und „m“ (kurze Haare, Pulli in Blau).
//
// Aufbau (hinten → vorn): Schatten, hinteres Bein, Schirm-Arm (bei Regen), vorderes Bein, Pulli (deckt die Hüfte),
// Ausschnitt, Hals, Kopf, Arm mit Tasse. Maße: Hals (131 | 100), Hüfte auf Höhe 166, Boden auf 222.

type Props = { rain: boolean; cold: boolean; hot: boolean; variant: 'f' | 'm' }

export function MorningFigure({ rain, cold, hot, variant }: Props) {
  const male = variant === 'm'
  return (
    <svg className={`hb-fig is-${variant}`} viewBox="0 0 220 236" aria-hidden="true">
      <ellipse cx="128" cy="226" rx="40" ry="5" className="hb-fig-shadow" />

      <g className="hb-fig-sway">
        {/* Beine: hinteres etwas heller, leichter Schritt */}
        <path d="M 138 160 L 142 214" className="hb-fig-leg is-back" />
        <ellipse cx="136" cy="219" rx="12" ry="6" className="hb-fig-shoe is-back" />
        <path d="M 124 160 L 118 214" className="hb-fig-leg" />
        <ellipse cx="111" cy="219" rx="13" ry="6.5" className="hb-fig-shoe" />

        <g className="hb-fig-body">
          {/* Schirm-Arm (hinten, nur bei Regen) */}
          {rain && (
            <g>
              <path d="M 150 72 L 146 10" className="hb-fig-stick" />
              <path
                d="M 90 36 C 102 -4, 188 -4, 202 36 C 192 28, 180 28, 174 36 C 166 26, 154 26, 146 36 C 138 26, 126 26, 118 36 C 112 28, 100 28, 90 36 Z"
                className="hb-fig-umbrella"
              />
              <path d="M 146 118 C 154 102, 156 86, 150 72" className="hb-fig-arm is-back" />
              <circle cx="150" cy="72" r="5.5" className="hb-fig-skin" />
            </g>
          )}

          {/* Pulli: deckt die Hüfte ab, so gibt es keinen sichtbaren Übergang zu den Beinen */}
          <path
            d="M 114 170 C 110 148, 110 124, 116 112 C 122 102, 142 102, 148 112 C 154 124, 154 148, 150 170 C 140 176, 124 176, 114 170 Z"
            className="hb-fig-shirt"
          />

          {/* Ausschnitt liegt ganz im Pulli, darüber der Hals */}
          <ellipse cx="131" cy="109" rx="9" ry="3.5" className="hb-fig-neckline" />
          <rect x="126" y="94" width="10" height="15" rx="3" className="hb-fig-skin" />
          {cold && (
            <>
              <path d="M 121 102 C 125 110, 137 110, 141 102 L 141 110 C 137 116, 125 116, 121 110 Z" className="hb-fig-scarf" />
              <path d="M 124 110 L 118 132 L 128 130 Z" className="hb-fig-scarf" />
            </>
          )}

          {/* Kopf (etwas tiefer gesetzt, kurzer Hals) */}
          <g transform="translate(0 6)">
            <g className="hb-fig-head">
              <ellipse cx="128" cy="70" rx="20" ry="22" className="hb-fig-skin" />
              <path d="M 109 68 C 104 72, 105 77, 110 78" className="hb-fig-skin hb-fig-nose" />
              <ellipse cx="137" cy="73" rx="4" ry="5" className="hb-fig-ear" />
              {male ? (
                // kurze Haare mit Koteletten, enden über dem Ohr
                <path
                  d="M 108 62 C 108 44, 148 40, 150 62 C 151 70, 148 74, 144 76 C 143 70, 141 66, 136 64 L 135 72 C 132 70, 131 66, 131 62 C 122 64, 114 64, 108 62 Z"
                  className="hb-fig-hair"
                />
              ) : (
                <>
                  <path
                    d="M 108 64 C 108 42, 148 40, 149 66 C 150 82, 144 90, 140 92 C 142 80, 140 70, 133 63 C 126 66, 116 66, 108 64 Z"
                    className="hb-fig-hair"
                  />
                  {!cold && !hot && <circle cx="151" cy="60" r="7" className="hb-fig-hair" />}
                </>
              )}
              <ellipse cx="116" cy="70" rx="2" ry="2.4" className="hb-fig-eye" />
              <circle cx="120" cy="80" r="4" className="hb-fig-cheek" />
              {cold && !hot && (
                <g className="hb-fig-beanie">
                  <path d="M 106 60 C 106 36, 150 34, 151 60 Z" />
                  <rect x="104" y="56" width="49" height="8" rx="4" />
                  <circle cx="129" cy="34" r="6" />
                </g>
              )}
              {hot && (
                <g className="hb-fig-hat">
                  <ellipse cx="128" cy="54" rx="34" ry="6" />
                  <path d="M 110 54 C 110 34, 146 34, 146 54 Z" />
                  <rect x="110" y="48" width="36" height="5" className="hb-fig-hatband" />
                </g>
              )}
            </g>
          </g>

          {/* Arm mit Tasse (vorn): trinkt ab und zu einen Schluck */}
          <g className="hb-fig-sip">
            <path d="M 124 116 C 120 132, 120 144, 118 146 L 106 134" className="hb-fig-arm" />
            <circle cx="105" cy="133" r="5.5" className="hb-fig-skin" />
            <g className="hb-fig-mug">
              <path d="M 90 118 L 104 118 L 102 140 L 92 140 Z" />
              <path d="M 90 123 C 82 123, 82 133, 91 133" className="hb-fig-handle" />
            </g>
            {!rain && (
              <g className="hb-fig-steam">
                <path d="M 94 112 C 90 106, 98 102, 94 96" />
                <path d="M 100 112 C 96 104, 104 100, 100 92" />
              </g>
            )}
          </g>
        </g>
      </g>
    </svg>
  )
}
