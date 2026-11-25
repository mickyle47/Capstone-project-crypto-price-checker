// Tiny loading state: when a form marked with `data-loading` is submitted,
// show "Loading…" on its button and stop double-clicks.
document.querySelectorAll("form[data-loading]").forEach((form) => {
  const button = form.querySelector("button[type=submit]");
  if (!button) return;

  form.addEventListener("submit", () => {
    button.dataset.label = button.textContent;
    button.textContent = "Loading…";
    button.disabled = true;
  });
});

// If the user comes back with the Back button, the page may be restored from
// the browser cache with the button still stuck on "Loading…". Reset it.
window.addEventListener("pageshow", () => {
  document.querySelectorAll("button[data-label]").forEach((button) => {
    button.textContent = button.dataset.label;
    button.disabled = false;
  });
});
