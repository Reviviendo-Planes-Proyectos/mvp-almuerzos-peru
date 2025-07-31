function toggleSidebar() {
  document.querySelector(".sidebar")?.classList.toggle("open");
  document.querySelector(".overlay")?.classList.toggle("show");
}
function closeSidebar() {
  document.querySelector(".sidebar")?.classList.remove("open");
  document.querySelector(".overlay")?.classList.remove("show");
}

// Cerrar con ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});

// Marcar activo, cerrar menú y/o navegar
document.addEventListener("click", (e) => {
  const item = e.target.closest(".menu-item");
  if (!item) return;

  const href = item.getAttribute("href");
  // Si es un enlace real distinto de "#" y no está vacío, dejamos que navegue:
  if (href && href !== "#" && href.trim() !== "") {
    closeSidebar();
    return; // NO preventDefault → el navegador cargará qr.html
  }

  // Si no, era un "item" interno (href="#"), hacemos la lógica SPA:
  e.preventDefault();
  document
    .querySelectorAll(".menu-item")
    .forEach((i) => i.classList.remove("active"));
  item.classList.add("active");
  closeSidebar();
});


// Poner el nombre real del restaurante en el sidebar
window.addEventListener("DOMContentLoaded", () => {
  const mainName = document.getElementById("restaurant-name");
  const sideName = document.getElementById("sidebar-restaurant");
  if (mainName && sideName)
    sideName.textContent = mainName.textContent || "Restaurante";
});