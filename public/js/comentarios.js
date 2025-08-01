function toggleSidebar() {
  document.querySelector(".sidebar")?.classList.toggle("open");
  document.querySelector(".overlay")?.classList.toggle("show");
}
function closeSidebar() {
  document.querySelector(".sidebar")?.classList.remove("open");
  document.querySelector(".overlay")?.classList.remove("show");
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});


/* document.addEventListener("click", (e) => {
  const item = e.target.closest(".menu-item");
  if (!item) return;

  const href = item.getAttribute("href");

  // Si tiene href válido (no es "#"), cierra sidebar y deja que el navegador navegue
  if (href && href !== "#" && href.trim() !== "") {
    closeSidebar();
    // No hacemos return, dejamos que el enlace funcione normalmente
    return;
  }

  // Si no tiene href o es "#", solo activamos visualmente
  e.preventDefault();
  document.querySelectorAll(".menu-item").forEach((i) =>
    i.classList.remove("active")
  );
  item.classList.add("active");
  closeSidebar();
});
 */