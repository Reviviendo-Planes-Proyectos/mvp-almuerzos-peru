// Variables globales
let currentUser = null;
let currentRestaurant = null;
let allComments = [];
let filteredComments = [];

// Variables de cache para comentarios
let commentsCache = new Map();

// Inicialización de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDNbgT9yeSBMhsftW4FOe_SB7bfSg44CPI",
  authDomain: "cashma-8adfb.firebaseapp.com",
  projectId: "cashma-8adfb",
  storageBucket: "cashma-8adfb.appspot.com",
  messagingSenderId: "92623435008",
  appId: "1:92623435008:web:8d4b4d58c0ccb9edb5afe5",
};

// Variables globales de Firebase
let auth;

// Inicializar Firebase cuando esté disponible
function waitForFirebaseAndInitialize() {
  if (typeof firebase !== 'undefined' && firebase.apps) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    console.log('Firebase initialized successfully in comentarios');
    return true;
  }
  return false;
}

// Intentar inicializar Firebase inmediatamente
if (!waitForFirebaseAndInitialize()) {
  // Si no está disponible, esperar un poco
  let attempts = 0;
  const maxAttempts = 20;
  const checkFirebase = setInterval(() => {
    attempts++;
    if (waitForFirebaseAndInitialize() || attempts >= maxAttempts) {
      clearInterval(checkFirebase);
      if (attempts >= maxAttempts) {
        console.error('Firebase failed to load after maximum attempts in comentarios');
      }
    }
  }, 100);
}

// Inicializar Firebase de forma lazy
document.addEventListener("DOMContentLoaded", () => {
  // Firebase ya está inicializado arriba
});

// Función para crear datos de ejemplo (solo para pruebas)
function createSampleComments() {
  return [
    {
      id: "sample1",
      content:
        "¡Excelente ceviche! El pescado estaba súper fresco y el punto de cocción perfecto. La cantidad de limón era ideal, no muy ácido. Sin duda volveré a pedirlo. El servicio también fue muy rápido.",
      createdAt: { seconds: Date.now() / 1000 - 86400 }, // ayer
      dish: {
        id: "dish1",
        name: "Ceviche de Pescado",
        price: 18.0,
        photoUrl: "images/default-dish.jpg.png",
      },
      user: {
        id: "user1",
        displayName: "María González",
        email: "maria@example.com",
      },
    },
    {
      id: "sample2",
      content:
        "Muy rico el arroz con pollo, la porción es generosa y el sabor tradicional. Solo le faltaba un poquito más de sazón al arroz, pero en general muy bueno. El pollo estaba tierno.",
      createdAt: { seconds: Date.now() / 1000 - 172800 }, // hace 2 días
      dish: {
        id: "dish2",
        name: "Arroz con Pollo",
        price: 15.0,
        photoUrl: "images/default-dish.jpg.png",
      },
      user: {
        id: "user2",
        displayName: "Carlos Mendoza",
        email: "carlos@example.com",
      },
    },
  ];
}

// Función para obtener comentarios del endpoint
async function loadComments() {
  if (!currentUser || !currentRestaurant) {
    console.error("Usuario o restaurante no disponible");
    showError("Información de usuario o restaurante no disponible");
    return;
  }



  // Mostrar indicador de carga
  showLoadingIndicator();

  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(
      `/api/restaurants/${currentRestaurant.id}/comments`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      }
    );


    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error del servidor al obtener comentarios:", errorText);
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();


    allComments = data.comments || [];

    // TEMPORAL: Si no hay comentarios reales, mostrar datos de ejemplo
    if (allComments.length === 0) {
      console.log("No hay comentarios reales, mostrando datos de ejemplo");
      allComments = createSampleComments();
    }

    filteredComments = [...allComments];

    // Ocultar indicador de carga
    hideLoadingIndicator();

    renderComments();
    populateFilterOptions();
  } catch (error) {
    console.error("Error al cargar comentarios:", error);
    hideLoadingIndicator();
    showError(`No se pudieron cargar los comentarios: ${error.message}`);
  }
}

// Función para renderizar comentarios
function renderComments() {
  const commentsContainer = document.querySelector(".comments-section");

  // Limpiar contenido actual excepto header y filtros
  const existingContent = commentsContainer.querySelectorAll(
    ".comment-card, .no-comments-message, .error-message, .loading-indicator"
  );
  existingContent.forEach((element) => element.remove());

  if (filteredComments.length === 0) {
    const noCommentsMsg = document.createElement("div");
    noCommentsMsg.className = "no-comments-message";
    noCommentsMsg.innerHTML = `
      <p>
        ${
          allComments.length === 0
            ? "Aún no hay comentarios en tu restaurante"
            : "No hay comentarios para el platillo seleccionado"
        }
      </p>
    `;
    commentsContainer.appendChild(noCommentsMsg);
    return;
  }

  filteredComments.forEach((comment) => {
    const commentCard = createCommentCard(comment);
    commentsContainer.appendChild(commentCard);
  });
}

// Función para crear una tarjeta de comentario
function createCommentCard(comment) {
  const card = document.createElement("div");
  card.className = "comment-card";

  // Formatear fecha
  const date = comment.createdAt
    ? new Date((comment.createdAt._seconds || comment.createdAt.seconds) * 1000)
    : new Date();

  const formattedDate =
    date.toLocaleDateString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }) +
    " – " +
    date.toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  // Crear iniciales del usuario
  const userInitials = getUserInitials(comment.user.displayName);

  card.innerHTML = `
    <div class="comment-header">
      <div class="dish-info-row">
        <img src="${comment.dish.photoUrl || "images/default-dish.jpg.png"}" 
             alt="${comment.dish.name}" 
             class="dish-icon" 
             onerror="this.src='images/default-dish.jpg.png'" />
        <div class="dish-details">
          <h2 class="dish-name">${comment.dish.name}</h2>
          <span class="dish-price">S/ ${parseFloat(comment.dish.price).toFixed(2)}</span>
        </div>
        <div class="comment-date">${formattedDate}</div>
      </div>
    </div>
    <div class="user-info">
      <div class="user-avatar">${userInitials}</div>
      <div class="user-details">
        <strong class="user-name">${comment.user.displayName}</strong>
        <small class="user-stats">Cliente</small>
      </div>
    </div>
    <p class="comment-text">${comment.content}</p>
  `;

  return card;
}

// Función para obtener iniciales del nombre
function getUserInitials(displayName) {
  if (!displayName) return "U";

  const names = displayName.split(" ");
  if (names.length >= 2) {
    return (names[0][0] + names[1][0]).toUpperCase();
  }
  return displayName.substring(0, 2).toUpperCase();
}

// Función para poblar las opciones del filtro
function populateFilterOptions() {
  const filterSelect = document.getElementById("filter");
  if (!filterSelect) return;

  // Limpiar opciones existentes excepto "Todos"
  filterSelect.innerHTML = '<option value="all">Todos los platillos</option>';

  // Obtener platos únicos
  const uniqueDishes = [
    ...new Map(
      allComments.map((comment) => [comment.dish.id, comment.dish])
    ).values(),
  ];

  uniqueDishes.forEach((dish) => {
    const option = document.createElement("option");
    option.value = dish.id;
    option.textContent = dish.name;
    filterSelect.appendChild(option);
  });
}

// Función para filtrar comentarios
function filterComments(dishId) {
  if (dishId === "all") {
    filteredComments = [...allComments];
  } else {
    filteredComments = allComments.filter(
      (comment) => comment.dish.id === dishId
    );
  }
  renderComments();
}

// Función para mostrar errores
function showError(message, isPersistent = false) {
  // Limpiar errores previos
  const existingErrors = document.querySelectorAll(".error-message");
  existingErrors.forEach((error) => error.remove());

  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;

  const commentsSection = document.querySelector(".comments-section");
  commentsSection.insertBefore(errorDiv, commentsSection.firstChild);

  // Solo remover automáticamente si no es persistente
  if (!isPersistent) {
    setTimeout(() => errorDiv.remove(), 5000);
  }
}

// Función para mostrar indicador de carga
function showLoadingIndicator() {
  const commentsContainer = document.querySelector(".comments-section");

  // Limpiar contenido actual excepto header y filtros
  const existingComments = commentsContainer.querySelectorAll(
    ".comment-card, .no-comments-message, .error-message"
  );
  existingComments.forEach((element) => element.remove());

  const loadingDiv = document.createElement("div");
  loadingDiv.className = "loading-indicator";
  loadingDiv.id = "loading-indicator";
  commentsContainer.appendChild(loadingDiv);
}

// Función para ocultar indicador de carga
function hideLoadingIndicator() {
  const loadingIndicator = document.getElementById("loading-indicator");
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
}

// Función para verificar el estado actual de autenticación
function checkAuthState() {
  console.log("=== VERIFICACIÓN MANUAL DE AUTENTICACIÓN ===");
  const currentUser = auth.currentUser;
  console.log("Current user:", currentUser);

  if (currentUser) {
    console.log("Usuario UID:", currentUser.uid);
    console.log("Usuario email:", currentUser.email);
    console.log("Usuario displayName:", currentUser.displayName);
  } else {
    console.log("No hay usuario autenticado");
  }
  console.log("==========================================");
}

// Función para cerrar sesión
function logout() {
  auth
    .signOut()
    .then(() => {
      window.location.href = "login.html";
    })
    .catch((error) => {
      console.error("Error al cerrar sesión:", error);
    });
}

// Funciones del sidebar
function toggleSidebar() {
  document.querySelector(".sidebar")?.classList.toggle("open");
  document.querySelector(".overlay")?.classList.toggle("show");
}

function closeSidebar() {
  document.querySelector(".sidebar")?.classList.remove("open");
  document.querySelector(".overlay")?.classList.remove("show");
}

// Inicialización cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => {


  // Verificar que Firebase esté disponible
  if (typeof firebase === "undefined") {
    console.error("❌ Firebase no está disponible");
    showError("Error: Firebase no se pudo cargar");
    return;
  }

  if (typeof auth === "undefined") {
    console.error("❌ Firebase Auth no está disponible");
    showError("Error: Firebase Auth no se pudo cargar");
    return;
  }



  // Event listener para el filtro
  const filterSelect = document.getElementById("filter");
  if (filterSelect) {
    filterSelect.addEventListener("change", (e) => {
      filterComments(e.target.value);
    });
  }

  // Event listener para cerrar sidebar con Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebar();
  });

  // Timeout para evitar "Verificando sesión..." indefinidamente
  const authTimeout = setTimeout(() => {
    console.warn("⏰ Timeout de autenticación, redirigiendo a login");
    window.location.href = "login.html";
  }, 10000); // 10 segundos

  // Autenticación con Firebase
  auth.onAuthStateChanged(async (user) => {
    // Limpiar el timeout una vez que Firebase responde
    clearTimeout(authTimeout);



    if (user) {
      currentUser = user;


      try {
        // Obtener información del restaurante del usuario
        const idToken = await user.getIdToken();
 

        const response = await fetch(`/api/restaurants/user/${user.uid}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
        });


        if (response.ok) {
          const restaurant = await response.json();
   

          if (restaurant && restaurant.id) {
            currentRestaurant = restaurant;
        

            // Actualizar el nombre del restaurante en el sidebar
            const sidebarRestaurant =
              document.getElementById("sidebar-restaurant");
            if (sidebarRestaurant) {
              sidebarRestaurant.textContent =
                currentRestaurant.name || "Restaurante";
            }

            // Cargar comentarios
            await loadComments();
          } else {
            console.error("❌ No se encontraron restaurantes para el usuario");
            showError(
              "No tienes restaurantes registrados. Crea un restaurante primero.",
              true
            );
            // Redirigir a dashboard para que puedan crear un restaurante
              setTimeout(() => {
              window.location.href = 'dashboard.html';
            }, 3000); 
          }
        } else {
          const errorText = await response.text();
          console.error("❌ Error del servidor:", response.status, errorText);

          if (response.status === 403) {
            showError("No tienes permisos para acceder a esta sección", true);
             setTimeout(() => {
              window.location.href = 'index.html';
            }, 3000); 
          } else if (response.status === 404) {
            showError(
              "No tienes restaurantes registrados. Crea un restaurante primero.",
              true
            );
             setTimeout(() => {
              window.location.href = 'dashboard.html';
            }, 3000); 
          } else {
            showError(
              `Error al obtener información del restaurante: ${response.status}`
            );
          }
        }
      } catch (error) {
        console.error("❌ Error al obtener restaurante:", error);
        showError("Error al cargar la información del restaurante");
      }
    } else {
      console.log("❌ Usuario no autenticado, redirigiendo a login");
      // Dar un poco de tiempo para que Firebase termine de cargar
       setTimeout(() => {
        window.location.href = 'login.html';
      }, 1000); 
    }
  });
});
