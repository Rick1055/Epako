"""Lift the moss-root scene out of epako_sylva_experience.html into web/public/sylva/scene.js, unchanged except:
the mock's page-only parts (dock, image plates, play ring) are switched off, and the scene tells the page that frames
it when it is drawing and when it is too slow, and follows the pointer the page passes on."""
import pathlib
import sys

src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines(keepends=True)
out = pathlib.Path(sys.argv[2])
# The scene script: from the line after its <script> tag (line 1721, 1-based) to the IIFE's close before </script>.
body = "".join(src[1721:])
end = body.index("})();\n\n</script>") + len("})();\n")
code = body[:end]

for fn in ["function drawDock(dt) {", "function drawSpec(dt) {", "function initDock() {", "function startPortalReveal() {", "function revealPortal(fig) {"]:
    assert code.count(fn) == 1, fn
    code = code.replace(fn, fn + " return; /* the mock's page parts: not on this page */")

hook = "    if (++frames === 2) window.__ready = true;\n"
assert code.count(hook) == 1
code = code.replace(hook, """    if (++frames === 2) window.__ready = true;
    watchPace();
""")

boot = "  /* ── boot ──"
assert code.count(boot) == 1
code = code.replace(boot, """  /* ── the page that frames this one ─────────────────────────────────
     Tells it when the first frames are drawn (so it can fade the scene in over its still picture), and when the
     scene can't hold 30 frames a second once the scan-in is over (so it can put the still back). Follows the
     pointer the page passes on, since this frame takes no pointer events itself. */
  var paceFrom = 0, paceFrames = 0, paceDone = false;
  function tell(what) { if (window.parent !== window) window.parent.postMessage({ sylva: what }, location.origin); }
  function watchPace() {
    if (frames === 2) tell('ready');
    if (paceDone) return;
    var now = performance.now();
    if (!paceFrom) { if (frames > 2 && !scanning) paceFrom = now; return; }
    paceFrames++;
    if (now - paceFrom >= 2000) {
      paceDone = true;
      if (paceFrames / ((now - paceFrom) / 1000) < 30) tell('slow');
    }
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.sylva !== 'pointer') return;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: e.data.x, clientY: e.data.y }));
  });

  /* ── boot ──""")

header = "/* The moss root from epako_sylva_experience.html, lifted by web/scripts/make_sylva.py (see web/public/sylva/index.html). */\n"
out.write_text(header + code, encoding="utf-8")
print("wrote", out, len(code), "chars")
