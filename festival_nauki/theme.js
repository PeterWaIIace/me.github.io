(function () {
  const STORAGE_KEY = "swarmnasium-theme";
  const root = document.documentElement;
  const stored = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const fallback = root.dataset.themeDefault || (prefersDark ? "dark" : "light");
  const initial = stored === "light" || stored === "dark" ? stored : fallback;

  root.dataset.theme = initial;

  const SUN =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></svg>';
  const MOON =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>';

  function render(button, theme) {
    const toLight = theme === "dark";
    button.innerHTML = toLight ? SUN : MOON;
    button.setAttribute("aria-label", toLight ? "Włącz tryb jasny / Switch to light mode" : "Włącz tryb ciemny / Switch to dark mode");
    button.setAttribute("title", toLight ? "Tryb jasny / Light" : "Tryb ciemny / Dark");
  }

  function apply(theme) {
    root.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => render(button, theme));
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      render(button, root.dataset.theme);
      button.addEventListener("click", () => {
        apply(root.dataset.theme === "dark" ? "light" : "dark");
      });
    });
  });
})();
