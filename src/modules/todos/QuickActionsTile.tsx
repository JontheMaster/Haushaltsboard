import { ListPlus, ShoppingCart, Zap } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { Tile } from '../../components/Tile'
import { useDevice } from '../../lib/device'
import { CoinButton } from '../coin/CoinFlip'
import { usePlanFlow } from '../meals/MealsTab'
import { RecipeDice } from '../meals/RecipeDice'
import { useRecipes } from '../meals/recipeStore'
import type { TileProps } from '../types'
import { useEnabledModules } from '../useModules'

/** Handy-Kachel: die häufigsten Handgriffe auf einen Blick (nur was gerade eingeschaltet ist) */
export function QuickActionsTile({ delay }: TileProps) {
  const { newTodo, goTab, showToast } = useDevice()
  const enabled = useEnabledModules()
  const { recipes } = useRecipes()
  const flow = usePlanFlow(showToast ?? (() => {}))
  return (
    <Tile title="Schnell" icon={Zap} delay={delay}>
      <div className="hb-quick">
        <button type="button" className="hb-quick-btn" onClick={newTodo}>
          <Icon icon={ListPlus} size={24} />
          Todo
        </button>
        {enabled?.has('einkauf') && (
          <button type="button" className="hb-quick-btn" onClick={() => goTab?.('einkauf')}>
            <Icon icon={ShoppingCart} size={24} />
            Einkauf
          </button>
        )}
        {enabled?.has('essensplan') && !!recipes?.length && (
          <span className="hb-quick-btn is-wrap">
            <RecipeDice recipes={recipes} onPlan={(r) => flow.setPlan({ recipe: r })} />
            Was koche ich?
          </span>
        )}
        <span className="hb-quick-coin">
          <CoinButton variant="phone" />
        </span>
      </div>
      {flow.sheets({})}
    </Tile>
  )
}
