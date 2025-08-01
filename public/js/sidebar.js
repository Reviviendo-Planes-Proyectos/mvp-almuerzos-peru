// Funciones para manejar el sidebar en todas las páginas
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

// Marcar como activo el item correcto según la URL actual
document.addEventListener("DOMContentLoaded", () => {
  const currentFile = window.location.pathname.split("/").pop();
  
  document.querySelectorAll(".menu-item").forEach((item) => {
    const href = item.getAttribute("href");
    if (href === currentFile) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
});

// Manejar clics en elementos del menú
document.addEventListener("click", (e) => {
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
