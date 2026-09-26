package expo.modules.liquidglass

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiquidGlass")

    /** "shader" (API 33+, AGSL), "blur" (API 31–32, Gaussian RenderEffect) or "none". */
    Constant("tier") { LiquidGlassView.tier() }

    View(LiquidGlassView::class) {
      Name("LiquidGlassView")
      Prop("backdropTag") { view: LiquidGlassView, tag: Int? -> view.setBackdropTag(tag) }
      Prop("cornerRadius") { view: LiquidGlassView, v: Float -> view.cornerRadiusDp = v }
      Prop("refraction") { view: LiquidGlassView, v: Float -> view.refraction = v }
      Prop("dispersion") { view: LiquidGlassView, v: Float -> view.dispersion = v }
      Prop("bevel") { view: LiquidGlassView, v: Float -> view.bevelDp = v }
      Prop("frost") { view: LiquidGlassView, v: Float -> view.frostDp = v }
      Prop("specular") { view: LiquidGlassView, v: Float -> view.specular = v }
      Prop("tint") { view: LiquidGlassView, v: String -> view.setTint(v) }
      OnViewDidUpdateProps { view: LiquidGlassView -> view.onPropsUpdated() }
    }
  }
}
