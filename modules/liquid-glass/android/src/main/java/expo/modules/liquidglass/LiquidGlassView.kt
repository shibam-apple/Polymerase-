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
 *  - API 33+  optional Gaussian frost → AGSL glass shader: a smooth lens across the rim bevel (from a
 *             rounded-rect signed distance field), a flat tint and a hairline rim light. No colour split,
 *             no glow. 1 backdrop sample + 3 SDF evaluations per pixel.
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
      uniform float rim;
      uniform float line;
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

        // Outward surface normal from the distance field.
        float2 n = float2(sdRoundRect(p + float2(1.0, 0.0), hs, radius) - d,
                          sdRoundRect(p + float2(0.0, 1.0), hs, radius) - d);
        float nl = length(n);
        n = nl > 0.0001 ? n / nl : float2(0.0, 0.0);

        // Smooth lens across the rim bevel: u = 1 at the edge, 0 where the flat top begins. The
        // displacement grows with u^3, so the flat middle shows the backdrop undistorted and the bend
        // eases in without a visible step. One sample: no colour split.
        float u = clamp(1.0 + d / bevel, 0.0, 1.0);
        float3 col = backdrop.eval(coord - n * refraction * u * u * u).rgb;

        // Flat body tint.
        col = mix(col, tint.rgb, tint.a);

        // Hairline rim light: brightest where the edge faces the top-left light, a fainter matching
        // rim on the opposite edge, nothing inside. No glow.
        float2 L = float2(-0.6, -0.8);
        float lit = dot(n, L);
        float edge = 1.0 - smoothstep(0.0, line, -d);
        col += rim * edge * (0.18 + 0.82 * max(lit, 0.0) + 0.35 * max(-lit, 0.0));
        return half4(min(col, float3(1.0, 1.0, 1.0)), 1.0);
      }
    """
  }

  var cornerRadiusDp = 24f
  var refraction = 1f
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
      sh.setFloatUniform("rim", specular)
      sh.setFloatUniform("line", 1.2f * density)
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
