(function () {
  const STORAGE_KEY = "swarmnasium-theme";
  const root = document.documentElement;
  const stored = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const fallback = root.dataset.themeDefault || (prefersDark ? "dark" : "light");
  const initial = stored === "light" || stored === "dark" ? stored : fallback;

  root.dataset.theme = initial;

  function label(theme) {
    return theme === "dark" ? "Jasny / Light" : "Ciemny / Dark";
  }

  function apply(theme) {
    root.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.textContent = label(theme);
      button.setAttribute("aria-label", theme === "dark" ? "Włącz tryb jasny / Switch to light mode" : "Włącz tryb ciemny / Switch to dark mode");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.textContent = label(root.dataset.theme);
      button.addEventListener("click", () => {
        apply(root.dataset.theme === "dark" ? "light" : "dark");
      });
    });
  });
})();
