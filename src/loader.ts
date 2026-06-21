// Intro loader: types the main title, then reveals the app. Runs before the
// engine so the walk-in entrance plays only after the loader is gone.

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TITLE = "AGENT PAYS AGENT";

export function runLoader(): Promise<void> {
  return new Promise((resolve) => {
    const loader = document.getElementById("loader");
    const titleEl = document.getElementById("loaderTitle");
    if (!loader || !titleEl) {
      resolve();
      return;
    }

    const finish = () => {
      loader.classList.add("is-done");
      window.setTimeout(
        () => {
          loader.remove();
          resolve();
        },
        reduced ? 0 : 450,
      );
    };

    // Reduced motion: show the full title briefly, then reveal.
    if (reduced) {
      titleEl.textContent = TITLE;
      window.setTimeout(finish, 300);
      return;
    }

    // Type the title one character at a time, then hold and reveal.
    let i = 0;
    const tick = () => {
      titleEl.textContent = TITLE.slice(0, i);
      if (i >= TITLE.length) {
        loader.classList.add("is-typed"); // stop the cursor blink
        window.setTimeout(finish, 500);
        return;
      }
      i += 1;
      window.setTimeout(tick, 95);
    };
    tick();
  });
}
