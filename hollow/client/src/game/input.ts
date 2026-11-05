/** Клавиатура и мышь: удерживаемые клавиши, одиночные нажатия, захват указателя.
 *  Если браузер не даёт захватить мышь (встроенные окна, политика сайта, повтор сразу после Esc),
 *  включается запасной режим: курсор виден, обзор — движением мыши, у краёв экрана и стрелками. */
export class Input {
  keys = new Set<string>();
  pressed: string[] = [];
  mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, leftReleased: false, rightPressed: false };
  /** Игра принимает управление (настоящий захват или запасной режим). */
  locked = false;
  /** Запасной режим без захвата указателя. */
  soft = false;
  /** −1…1: курсор у левого/правого края экрана в запасном режиме. */
  edge = 0;
  enabled = true;
  private el: HTMLElement;
  private handlers: [EventTarget, string, EventListener][] = [];
  private pending = 0;
  private lockFailures = 0;

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
      if (["Space", "Tab", "KeyQ", "KeyR", "KeyF", "KeyG", "KeyZ", "KeyX", "KeyE", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code) && this.locked) e.preventDefault();
      // в запасном режиме Esc браузер не перехватывает — выходим из управления сами
      if (e.code === "Escape" && this.soft && this.locked) this.setLocked(false);
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
      this.mouse.dx += Math.max(-200, Math.min(200, e.movementX || 0));
      this.mouse.dy += Math.max(-200, Math.min(200, e.movementY || 0));
      if (this.soft) {
        const w = window.innerWidth;
        const k = 0.08 * w;
        this.edge = e.clientX < k ? -(1 - e.clientX / k) : e.clientX > w - k ? (e.clientX - (w - k)) / k : 0;
      }
    });
    on(document, "mouseleave", () => (this.edge = 0));
    on(document, "pointerlockchange", () => {
      const has = document.pointerLockElement === this.el;
      if (has) {
        this.soft = false;
        this.lockFailures = 0;
        this.setLocked(true);
      } else if (!this.soft) {
        this.setLocked(false);
      }
    });
    on(document, "pointerlockerror", () => this.fallback());
  }

  private setLocked(v: boolean) {
    this.locked = v;
    if (!v) {
      this.mouse.left = this.mouse.right = false;
      this.keys.clear();
      this.edge = 0;
    }
    window.dispatchEvent(new CustomEvent("hollow-lock", { detail: { locked: v, soft: this.soft } }));
  }

  /** Захват не удался — играем без него. */
  private fallback() {
    if (this.locked || !this.pending) return;
    window.clearTimeout(this.pending);
    this.pending = 0;
    this.lockFailures++;
    this.soft = true;
    this.setLocked(true);
  }

  lock() {
    if (this.locked) return;
    // после двух отказов подряд не мучаем браузер — сразу запасной режим
    if (this.lockFailures >= 2 || typeof this.el.requestPointerLock !== "function") {
      this.pending = 1;
      this.fallback();
      return;
    }
    window.clearTimeout(this.pending);
    this.pending = window.setTimeout(() => this.fallback(), 500);
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === "function") p.catch(() => this.fallback());
    } catch {
      this.fallback();
    }
  }

  unlock() {
    window.clearTimeout(this.pending);
    this.pending = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.locked) {
      this.soft = false;
      this.setLocked(false);
    }
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
    window.clearTimeout(this.pending);
    for (const [t, ev, fn] of this.handlers) t.removeEventListener(ev, fn);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
