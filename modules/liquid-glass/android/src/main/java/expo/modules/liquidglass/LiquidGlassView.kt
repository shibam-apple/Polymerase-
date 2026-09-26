package expo.modules.liquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Outline
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.ViewOutlineProvider
import android.view.ViewTreeObserver
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.max
import kotlin.math.min

/**
 * Liquid glass for Android.
 *
 * Every frame (pre-draw) the backdrop view is recorded into a hardware [RenderNode] — this re-uses the
 * children's existing display lists, so it is cheap — and drawn behind this view's content through a
 * GPU [RenderEffect] chain:
 *
 *  - API 33+  light Gaussian frost → AGSL glass shader: spherical-cap lens refraction from a rounded-rect
 *             signed distance field, per-channel dispersion (chromatic aberration), specular rim light and
 *             Fresnel-style edge brightening. 3 backdrop samples + 3 SDF evaluations per pixel.
 *  - API 31–32 Gaussian backdrop blur only (the fallback tier).
 *  - older     draws nothing; the JS side shows a frosted fill instead.
 */
@SuppressLint("ViewConstructor")
class LiquidGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  companion object {
    fun tier(): String = when {
      Build.VERSION.SDK_INT >= 33 -> "shader"
      Build.VERSION.SDK_INT >= 31 -> "blur"
      else -> "none"
    }

    /** > 0 while any glass view is recording its backdrop: nested glass skips drawing (no recursion). */
    private var recordingDepth = 0

    private const val AGSL = """
      uniform shader backdrop;
      uniform float2 size;
      uniform float2 origin;
      uniform float radius;
      uniform float bevel;
      uniform float refraction;
      uniform float dispersion;
      uniform float specular;
      uniform float4 tint;

      float sdRoundRect(float2 p, float2 b, float r) {
        float2 q = abs(p) - b + float2(r, r);
        return length(max(q, float2(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - r;
      }

      half4 main(float2 coord) {
        float2 hs = size * 0.5;
        float2 p = coord - origin - hs;
        float d = sdRoundRect(p, hs, radius);
        if (d > 0.0) { return backdrop.eval(coord); }

        // Outward surface normal from the distance field (forward differences).
        float2 n = float2(sdRoundRect(p + float2(1.0, 0.0), hs, radius) - d,
                          sdRoundRect(p + float2(0.0, 1.0), hs, radius) - d);
        float nl = length(n);
        n = nl > 0.0001 ? n / nl : float2(0.0, 0.0);

        // Spherical-cap lens across the bevel: u = 1 at the rim, 0 where the flat top begins.
        float u = clamp(1.0 + d / bevel, 0.0, 1.0);
        // Slope of a circular profile h = sqrt(1 - u^2) (|dh/du| = u / sqrt(1 - u^2)), kept bounded.
        float slope = u / sqrt(max(1.0 - u * u, 0.02));
        // Small-angle Snell refraction: the ray bends toward the centre in proportion to the slope.
        float2 off = -n * refraction * (slope / (1.0 + slope));

        // Dispersion: red bends least, blue most (chromatic aberration at the rim).
        float4 cr = backdrop.eval(coord + off * (1.0 - dispersion));
        float4 cg = backdrop.eval(coord + off);
        float4 cb = backdrop.eval(coord + off * (1.0 + dispersion));
        float3 col = float3(cr.r, cg.g, cb.b);

        // Glass body tint, a little denser where the glass is thicker (toward the rim).
        col = mix(col, tint.rgb, tint.a * (0.7 + 0.3 * u));

        // Specular: key light from the top-left on the curved rim, a crisp 1 px edge, Fresnel glow.
        float2 L = float2(-0.55, -0.835);
        float spec = pow(max(dot(n, L), 0.0), 2.0) * u * u * u;
        float edge = 1.0 - smoothstep(0.0, 1.5, -d);
        float fres = pow(u, 5.0) * 0.25;
        col += specular * (spec * 0.9 + edge * 0.35 + fres);
        return half4(min(col, float3(1.0, 1.0, 1.0)), 1.0);
      }
    """
  }

  var cornerRadiusDp = 24f
  var refraction = 1f
  var dispersion = 0.35f
  var bevelDp = 18f
  var frostDp = 2f
  var specular = 0.6f
  private var tint = floatArrayOf(1f, 1f, 1f, 0.3f)

  private var backdropTag: Int? = null
  private var backdrop: View? = null
  private val density = resources.displayMetrics.density
  private val node: RenderNode? = if (Build.VERSION.SDK_INT >= 31) RenderNode("LiquidGlass") else null
  private var shader: RuntimeShader? = null
  private val selfLoc = IntArray(2)
  private val backLoc = IntArray(2)
  private var lastX = Int.MIN_VALUE
  private var lastY = Int.MIN_VALUE

  private val preDraw = ViewTreeObserver.OnPreDrawListener {
    record()
    true
  }

  init {
    setWillNotDraw(false)
    clipToOutline = true
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setRoundRect(0, 0, view.width, view.height, radiusPx())
      }
    }
  }

  private fun radiusPx(): Float = min(cornerRadiusDp * density, min(width, height) / 2f)
  private fun marginPx(): Int = ((refraction * bevelDp * 0.6f + frostDp * 3f + 4f) * density).toInt()

  fun setBackdropTag(tag: Int?) {
    backdropTag = tag
    backdrop = null
    resolveBackdrop()
  }

  fun setTint(value: String) {
    try {
      val c = Color.parseColor(value)
      tint = floatArrayOf(Color.red(c) / 255f, Color.green(c) / 255f, Color.blue(c) / 255f, Color.alpha(c) / 255f)
    } catch (_: IllegalArgumentException) {
    }
  }

  fun onPropsUpdated() {
    invalidateOutline()
    rebuildEffect()
    invalidate()
  }

  private fun resolveBackdrop() {
    val tag = backdropTag ?: return
    if (backdrop != null) return
    val v = appContext.findView<View>(tag) ?: return
    // A backdrop that contains this view would record itself: refuse it.
    var p = parent
    while (p != null) {
      if (p === v) return
      p = p.parent
    }
    backdrop = v
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(preDraw)
    resolveBackdrop()
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(preDraw)
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    invalidateOutline()
    rebuildEffect()
  }

  private fun rebuildEffect() {
    if (Build.VERSION.SDK_INT < 31) return
    val n = node ?: return
    if (width == 0 || height == 0) return
    val frostPx = frostDp * density
    val blur = if (frostPx > 0.5f) RenderEffect.createBlurEffect(frostPx, frostPx, Shader.TileMode.CLAMP) else null
    if (Build.VERSION.SDK_INT >= 33) {
      val sh = shader ?: RuntimeShader(AGSL).also { shader = it }
      val m = marginPx().toFloat()
      sh.setFloatUniform("size", width.toFloat(), height.toFloat())
      sh.setFloatUniform("origin", m, m)
      sh.setFloatUniform("radius", radiusPx())
      sh.setFloatUniform("bevel", max(1f, bevelDp * density))
      sh.setFloatUniform("refraction", refraction * bevelDp * density * 0.5f)
      sh.setFloatUniform("dispersion", dispersion)
      sh.setFloatUniform("specular", specular)
      sh.setFloatUniform("tint", tint[0], tint[1], tint[2], tint[3])
      val glass = RenderEffect.createRuntimeShaderEffect(sh, "backdrop")
      n.setRenderEffect(if (blur != null) RenderEffect.createChainEffect(glass, blur) else glass)
    } else {
      // Gaussian backdrop blur fallback (Android 12).
      val r = max(frostPx, 14f * density)
      n.setRenderEffect(RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP))
    }
  }

  /** Re-record the backdrop region under this view. Runs in pre-draw, so it lands in the same frame. */
  private fun record() {
    if (Build.VERSION.SDK_INT < 31) return
    val n = node ?: return
    if (width == 0 || height == 0 || !isShown || recordingDepth > 0) return
    resolveBackdrop()
    val b = backdrop ?: return
    getLocationInWindow(selfLoc)
    b.getLocationInWindow(backLoc)
    val m = marginPx()
    val w = width + 2 * m
    val h = height + 2 * m
    n.setPosition(0, 0, w, h)
    val c = n.beginRecording(w, h)
    recordingDepth++
    try {
      c.translate((backLoc[0] - selfLoc[0] + m).toFloat(), (backLoc[1] - selfLoc[1] + m).toFloat())
      b.draw(c)
    } finally {
      recordingDepth--
      n.endRecording()
    }
    // Moving glass (scrolling) must redraw this frame; a still view picks up the re-recorded node as is.
    if (selfLoc[0] != lastX || selfLoc[1] != lastY) {
      lastX = selfLoc[0]
      lastY = selfLoc[1]
      invalidate()
    }
  }

  override fun dispatchDraw(canvas: Canvas) {
    val n = node
    if (Build.VERSION.SDK_INT >= 31 && n != null && recordingDepth == 0 && canvas.isHardwareAccelerated && n.hasDisplayList()) {
      val m = marginPx().toFloat()
      canvas.save()
      canvas.translate(-m, -m)
      canvas.drawRenderNode(n)
      canvas.restore()
    }
    super.dispatchDraw(canvas)
  }
}
