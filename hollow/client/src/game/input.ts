/** Клавиатура и мышь: удерживаемые клавиши, одиночные нажатия, захват указателя. */
export class Input {
  keys = new Set<string>();
  pressed: string[] = [];
  mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, leftReleased: false, rightPressed: false };
  locked = false;
  enabled = true;
  private el: HTMLElement;
  private handlers: [EventTarget, string, EventListener][] = [];

  constructor(el: HTMLElement) {
    this.el = el;
    const on = (t: EventTarget, ev: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(ev, fn as EventListener, opts);
      this.handlers.push([t, ev, fn as EventListener]);
    };
    on(window, "keydown", (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (!e.repeat) this.pressed.push(e.code);
      this.keys.add(e.code);
      if (["Space", "Tab", "KeyQ", "KeyR", "KeyF", "KeyE"].includes(e.code) && this.locked) e.preventDefault();
    });
    on(window, "keyup", (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, "blur", () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
    on(el, "mousedown", (e: MouseEvent) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    on(window, "mouseup", (e: MouseEvent) => {
      if (e.button === 0) { if (this.mouse.left) this.mouse.leftReleased = true; this.mouse.left = false; }
      if (e.button === 2) this.mouse.right = false;
    });
    on(el, "contextmenu", (e: Event) => e.preventDefault());
    on(document, "mousemove", (e: MouseEvent) => {
      if (!this.locked) return;
      // защита от скачков при входе в захват
      this.mouse.dx += Math.max(-200, Math.min(200, e.movementX));
      this.mouse.dy += Math.max(-200, Math.min(200, e.movementY));
    });
    on(document, "pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) {
        this.mouse.left = this.mouse.right = false;
        this.keys.clear();
      }
    });
  }

  lock() {
    if (this.locked) return;
    const p = this.el.requestPointerLock?.() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string) {
    return this.enabled && this.keys.has(code);
  }

  /** Сбрасывает одиночные события в конце кадра. */
  endFrame() {
    this.pressed = [];
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.leftPressed = this.mouse.leftReleased = this.mouse.rightPressed = false;
  }

  dispose() {
    for (const [t, ev, fn] of this.handlers) t.removeEventListener(ev, fn);
    this.unlock();
  }
}
