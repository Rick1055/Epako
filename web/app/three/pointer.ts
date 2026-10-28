// Where the pointer is, -1..1 across the window (y up), read every frame by the scene. The canvas itself takes
// no pointer events (DESIGN.md: buttons and text always win), so this listens on the window instead.
export const pointer = { x: 0, y: 0, moved: -1e9 };

export function listenToPointer() {
  const move = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    pointer.moved = performance.now();
  };
  // A touch parts the grass where it lands, once, instead of following the finger (scrolling is never captured).
  const down = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      pointer.moved = performance.now();
    }
  };
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerdown", down, { passive: true });
  return () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerdown", down);
  };
}
