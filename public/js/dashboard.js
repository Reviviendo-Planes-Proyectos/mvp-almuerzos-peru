const firebaseConfig = {
  apiKey: "AIzaSyDNbgT9yeSBMhsftW4FOe_SB7bfSg44CPI",
  authDomain: "cashma-8adfb.firebaseapp.com",
  projectId: "cashma-8adfb",
  storageBucket: "cashma-8adfb.appspot.com",
  messagingSenderId: "92623435008",
  appId: "1:92623435008:web:8d4b4d58c0ccb9edb5afe5",
};

// Variables de cache para optimizar rendimiento
let dashboardCache = new Map();
let restaurantDataCache = null;

// Variables globales de Firebase
let auth, db, storage;

// Inicializar Firebase cuando esté disponible
function waitForFirebaseAndInitialize() {
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.auth && firebase.firestore && firebase.storage) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    console.log('Firebase initialized successfully in dashboard');
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
        console.error('Firebase failed to load after maximum attempts in dashboard');
      }
    }
  }, 100);
}

// Inicializar Firebase de forma lazy
document.addEventListener("DOMContentLoaded", () => {
  showLoadingState();
});

let currentUser = null;
let currentRestaurant = null;
let currentCardId = null;
let compressedDishImageFile = null;
let compressedRestaurantImageFile = null;
let compressedRestaurantLogoFile = null;
let editingDish = null;
let originalCardName = "";
let cropper = null;
let currentImageInput = null;
let currentPreview = null;

// Función para mostrar estado de carga optimizado
function showLoadingState() {
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.innerHTML = `
      <div style="text-align: center;">
        <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #ffd100; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
        <p style="font-weight: 700; font-size: 1.25rem; color: #1f2937;">Cargando Dashboard...</p>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
  }
}
let currentPlaceholder = null;
let currentDeleteBtn = null;

function checkAuthStatus() {
  if (!auth) {
    console.warn('Firebase auth not initialized yet');
    return;
  }
  
  if (auth.currentUser) {
    currentUser = auth.currentUser;
    if (document.getElementById("cards-section").style.display !== "block") {
      document.getElementById("cards-section").style.display = "block";
      loadDashboardData();
    }
  } else {
    window.location.replace("/login.html");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Esperar a que Firebase esté listo antes de configurar auth
  const waitForAuth = () => {
    if (auth) {
      auth.onAuthStateChanged((user) => {
        if (user) {
          currentUser = user;
          document.getElementById("cards-section").style.display = "block";
          loadDashboardData();
          
          // Actualizar el estado del restaurante cada minuto
          setInterval(updateRestaurantStatus, 60000);
        } else {
          window.location.href = "/login.html";
        }
      });
    } else {
      setTimeout(waitForAuth, 100);
    }
  };
  
  waitForAuth();
  document
    .getElementById("new-card-form")
    .addEventListener("submit", handleCreateCard);
  document
    .getElementById("new-dish-form")
    .addEventListener("submit", handleCreateDish);
  document
    .getElementById("edit-dish-form")
    .addEventListener("submit", handleUpdateDish);
  document
    .getElementById("delete-card-button")
    .addEventListener("click", () => openModal("deleteCardAlert"));
  document
    .getElementById("confirm-delete-card-btn")
    .addEventListener("click", handleDeleteCard);
  document
    .getElementById("confirm-delete-dish-btn")
    .addEventListener("click", handleDeleteDish);
  document
    .getElementById("edit-restaurant-form")
    .addEventListener("submit", handleUpdateRestaurant);
  setupEditRestaurantImageUploader();
  setupImageUploader();
});

async function loadDashboardData() {
  if (!currentUser) return;
  const loadingOverlay = document.getElementById("loading-overlay");
  const mainContent = document.getElementById("main-content");
  try {
    // *** CAMBIO CRÍTICO: Enviar el ID Token ***
    const idToken = await currentUser.getIdToken();

    const restaurantResponse = await fetch(
      `/api/restaurants/user/${currentUser.uid}`,
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      }
    );
    if (!restaurantResponse.ok) {
      // Manejar errores 403 (Forbidden) específicamente
      if (restaurantResponse.status === 403) {
        console.error(
          "Acceso denegado: El usuario no es un dueño o su token no coincide."
        );
        alert(
          "No tienes los permisos necesarios para acceder al dashboard. Serás redirigido."
        );
        window.location.replace("/index.html"); // Redirige a la página principal
        return; // Importante para detener la ejecución
      }
      if (restaurantResponse.status === 404) {
        // Si es 404, significa que es dueño pero no tiene restaurante, redirige a registrar
        window.location.href = "/login.html?action=register";
        return;
      }
      throw new Error(
        `Error ${restaurantResponse.status}: ${restaurantResponse.statusText}`
      );
    }
    currentRestaurant = await restaurantResponse.json();
    const banner = document.getElementById("restaurant-banner");
    document.getElementById("restaurant-name").textContent =
      currentRestaurant.name;
    
    // Actualizar el logo del restaurante
    const logoImg = document.getElementById("restaurant-logo");
    const logoPlaceholder = document.getElementById("restaurant-icon-placeholder");
    if (currentRestaurant.logoUrl && logoImg && logoPlaceholder) {
      logoImg.src = currentRestaurant.logoUrl;
      logoImg.style.display = "block";
      logoPlaceholder.style.display = "none";
    } else if (logoImg && logoPlaceholder) {
      logoImg.style.display = "none";
      logoPlaceholder.style.display = "block";
    }
    
    // Actualizar la ubicación del restaurante
    const locationElement = document.getElementById("restaurant-location");
    if (locationElement) {
      const locationUrl = currentRestaurant.location;
      const district = currentRestaurant.district || "Ubicación no disponible";
      const locationText = district + "-Ver mapa";
      
      if (locationUrl && locationUrl.trim() !== "") {
        // Si hay URL de ubicación, configurar como enlace
        locationElement.href = locationUrl;
        locationElement.textContent = locationText;
        locationElement.style.display = "inline";
        locationElement.style.pointerEvents = "auto";
      } else {
        // Si no hay URL, mostrar solo texto sin enlace
        locationElement.href = "#";
        locationElement.textContent = locationText;
        locationElement.style.pointerEvents = "none";
        locationElement.style.textDecoration = "none";
        locationElement.style.cursor = "default";
      }
    }
    
    // Actualizar horario de cierre (usando el horario del día actual o lunes como default)
    const hoursElement = document.getElementById("restaurant-hours");
    if (hoursElement && currentRestaurant.schedule) {
      const today = new Date().getDay(); // 0 = domingo, 1 = lunes, etc.
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDay = dayNames[today];
      
      if (currentRestaurant.schedule[currentDay] && currentRestaurant.schedule[currentDay].to) {
        // Mostrar solo la hora de cierre
        hoursElement.textContent = currentRestaurant.schedule[currentDay].to;
      } else if (currentRestaurant.schedule.monday && currentRestaurant.schedule.monday.to) {
        // Usar lunes como fallback
        hoursElement.textContent = currentRestaurant.schedule.monday.to;
      } else {
        hoursElement.textContent = "8:00 pm";
      }
    }

    // Actualizar estado del restaurante (ABIERTO/CERRADO) basado en el horario actual
    updateRestaurantStatus();
    
    // Actualizar calificación y cantidad de reseñas usando el nuevo endpoint
    const ratingElement = document.getElementById("restaurant-rating");
    if (ratingElement) {
      try {
        const idToken = await currentUser.getIdToken();
        const ratingResponse = await fetch(`/api/restaurants/${currentRestaurant.id}/rating`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        
        if (ratingResponse.ok) {
          const ratingData = await ratingResponse.json();
          
          // Mostrar el número total de likes (corazones) que tiene el restaurante
          ratingElement.textContent = `${ratingData.totalLikes}`;
        } else {
          console.error("Error fetching restaurant rating:", ratingResponse.status, ratingResponse.statusText);
          // Fallback: mostrar valores por defecto
          ratingElement.textContent = "0";
        }
      } catch (error) {
        console.error("Error fetching restaurant rating:", error);
        // Fallback: mostrar valores por defecto
        ratingElement.textContent = "0";
      }
    }
    
    
    await loadRestaurantCards(); // Llama a la siguiente función de carga
    if (loadingOverlay) loadingOverlay.style.display = "none";
    if (mainContent) mainContent.style.display = "block";
  } catch (error) {
    console.error("Error cargando el dashboard:", error);
    if (loadingOverlay) {
      loadingOverlay.innerHTML =
        '<p style="text-align: center; color: red; font-weight: 700;">Error de conexión o permisos.<br>Asegúrate de que el servidor (server.js) esté corriendo y tu cuenta tenga permisos de dueño.</p>';
    }
  }
}

// Función para actualizar el estado del restaurante (ABIERTO/CERRADO)
function updateRestaurantStatus() {
  if (!currentRestaurant || !currentRestaurant.schedule) return;
  
  const statusBadge = document.querySelector('.status-badge');
  if (!statusBadge) return;
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes(); // Tiempo actual en minutos
  const today = now.getDay(); // 0 = domingo, 1 = lunes, etc.
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[today];
  
  let daySchedule = currentRestaurant.schedule[currentDay];
  
  // Si no hay horario para hoy, usar lunes como fallback
  if (!daySchedule || !daySchedule.from || !daySchedule.to) {
    daySchedule = currentRestaurant.schedule.monday;
  }
  
  if (!daySchedule || !daySchedule.from || !daySchedule.to) {
    // Si no hay horario definido, mostrar como cerrado
    statusBadge.textContent = 'CERRADO';
    statusBadge.style.backgroundColor = '#ef4444';
    return;
  }
  
  // Convertir horarios a minutos
  const openTime = convertTimeToMinutes(daySchedule.from);
  const closeTime = convertTimeToMinutes(daySchedule.to);
  
  // Verificar si está dentro del horario
  let isOpen = false;
  
  if (closeTime > openTime) {
    // Horario normal (ej: 9:00 - 22:00)
    isOpen = currentTime >= openTime && currentTime <= closeTime;
  } else {
    // Horario que cruza medianoche (ej: 20:00 - 02:00)
    isOpen = currentTime >= openTime || currentTime <= closeTime;
  }
  
  // Actualizar la etiqueta
  if (isOpen) {
    statusBadge.textContent = 'ABIERTO';
    statusBadge.style.backgroundColor = '#00b44e';
  } else {
    statusBadge.textContent = 'CERRADO';
    statusBadge.style.backgroundColor = '#ef4444';
  }
}

// Función auxiliar para convertir tiempo HH:MM a minutos
function convertTimeToMinutes(timeString) {
  if (!timeString) return 0;
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

async function loadRestaurantCards() {
  if (!currentRestaurant) return;
  const cardsListDiv = document.getElementById("cards-list");
  const loadingMessage = document.getElementById("loading-cards-message");
  try {
    // *** CAMBIO CRÍTICO: Enviar el ID Token ***
    const idToken = await currentUser.getIdToken();
    const cardsResponse = await fetch(
      `/api/restaurants/${currentRestaurant.id}/cards`,
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      }
    );
    if (!cardsResponse.ok) {
      if (cardsResponse.status === 403) {
        showToast("Permisos insuficientes para cargar cartas.", "error");
      }
      throw new Error(
        `Error ${cardsResponse.status}: ${cardsResponse.statusText}`
      );
    }
    const cards = await cardsResponse.json();
    if (loadingMessage) loadingMessage.style.display = "none";
    cardsListDiv.innerHTML = "";
    if (cards.length === 0) {
      cardsListDiv.innerHTML =
        '<p style="text-align: center;">Aún no tienes ninguna carta. ¡Crea una!</p>';
    } else {
      cards.forEach((card) => {
        const cardElement = document.createElement("div");
        cardElement.className = "list-item";
        cardElement.innerHTML = `
                        <div class="item-details" onclick="showDishes('${
                          card.id
                        }', '${card.name}')">
                            <h3  style="margin-right: 20px;">${card.name}</h3>
                            <p>Ver platos</p>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" data-id="${
                              card.id
                            }" class="card-toggle" ${
          card.isActive ? "checked" : ""
        }>
                            <span class="slider"></span>
                        </label>
                    `;
        cardsListDiv.appendChild(cardElement);
      });
      document.querySelectorAll(".card-toggle").forEach((toggle) => {
        toggle.addEventListener("change", handleToggleCard);
      });
    }
  } catch (error) {
    console.error("Error cargando las cartas:", error);
    cardsListDiv.innerHTML =
      '<p style="text-align: center; color: red;"><strong>Error al cargar las cartas.</strong><br>Asegúrate de que el servidor (server.js) esté corriendo y tu cuenta tenga permisos.</p>';
  }
}

async function loadDishes(cardId) {
  currentCardId = cardId;
  const dishesListDiv = document.getElementById("dishes-list");
  dishesListDiv.innerHTML = "<p>Cargando platos...</p>";

  try {
    // *** CAMBIO CRÍTICO: Enviar el ID Token ***
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/cards/${cardId}/dishes`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (!response.ok) {
      if (response.status === 403) {
        showToast("Permisos insuficientes para cargar platos.", "error");
      }
      throw new Error("Error en la respuesta del servidor al cargar platos.");
    }

    const dishes = await response.json();
    dishesListDiv.innerHTML = "";

    if (dishes.length === 0) {
      dishesListDiv.innerHTML =
        '<p style="text-align: center;">No hay platos en esta carta. ¡Añade uno!</p>';
    } else {
      dishes.forEach((dish) => {
        const dishElement = document.createElement("div");
        dishElement.className = "list-item dish-list-item";

        const imageUrl =
          dish.photoUrl ||
          `https://placehold.co/120x120/E2E8F0/4A5568?text=${encodeURIComponent(
            dish.name.substring(0, 4)
          )}`;

        dishElement.innerHTML = `

    <div class="item-details" style="cursor: pointer; flex: 1;">
        <img src="${imageUrl}" alt="Foto de ${
          dish.name
        }" style="width: 60px; height: 60px; border-radius: 0.5rem; object-fit: cover; margin-right: 1rem;">

        <div>
            <h3 title="${dish.name}">${dish.name}</h3>
            <p>S/. ${dish.price.toFixed(2)}</p>
            <p style="font-size: 0.85rem; color: #666;">Likes: ${dish.likesCount || 0}</p> 
        </div>
    </div>
    <div class="item-actions">
        <label class="toggle-switch">
            <input type="checkbox" data-id="${dish.id}" class="dish-toggle" ${
              dish.isActive ? "checked" : ""
            }>
            <span class="slider"></span>
        </label>
    </div>
`;
        
        // Hacer clickeable toda la carta excepto el toggle
        const itemDetails = dishElement.querySelector(".item-details");
        itemDetails.addEventListener("click", () => openEditDishModal(dish));
        
        // Prevenir que el click en el toggle active la edición
        const toggleSwitch = dishElement.querySelector(".toggle-switch");
        toggleSwitch.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        dishesListDiv.appendChild(dishElement);
      });

      document.querySelectorAll(".dish-toggle").forEach((toggle) => {
        toggle.addEventListener("change", handleToggleDish);
      });
    }
  } catch (error) {
    console.error("Error cargando los platos:", error);
    dishesListDiv.innerHTML =
      '<p style="text-align: center; color: red;">Error al cargar los platos.</p>';
  }
}

async function handleUpdateCardName() {
  if (!currentCardId) return;
  
  const saveButton = document.getElementById("save-card-changes-btn");
  const cardNameInput = document.getElementById("card-name-input");
  
  if (!saveButton || !cardNameInput) {
    console.error("Elementos del DOM no encontrados");
    return;
  }
  
  const newName = cardNameInput.value.trim();
  
  if (newName === originalCardName || newName === "") return;
  
  // Mostrar estado de carga
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Guardando...";
  }
  
  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/cards/${currentCardId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ name: newName }),
    });
    
    if (!response.ok) throw new Error("Error del servidor al actualizar.");
    
    originalCardName = newName;
    
    // Actualizar la lista de cartas para reflejar el cambio inmediatamente
    await loadRestaurantCards();
    
    // Mostrar toast de éxito
    showToast("Nombre de la carta guardado correctamente");
    
  } catch (error) {
    console.error("Error al actualizar el nombre:", error);
    showToast("Error al guardar el nombre de la carta", "error");
    cardNameInput.value = originalCardName;
  } finally {
    if (saveButton) {
      saveButton.textContent = "Guardar cambios";
      saveButton.disabled = true;
    }
  }
}

async function handleCreateCard(event) {
  event.preventDefault();
  if (!currentRestaurant) return;
  const form = event.target;
  const cardName = form.elements.cardName.value;
  if (!cardName.trim()) return;
  try {
    const idToken = await currentUser.getIdToken(); // Get token
    const response = await fetch("/api/cards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`, // Add token
      },
      body: JSON.stringify({
        restaurantId: currentRestaurant.id,
        name: cardName,
      }),
    });

    if (response.ok) {
      form.reset();
      closeModal(null, "newCardModal");
      showToast("Carta creada con éxito.");
      await loadRestaurantCards();
    } else {
      alert("Error al crear la carta.");
    }
  } catch (error) {
    console.error("Error de red al crear la carta:", error);
    alert("Error de conexión.");
  }
}
async function handleCreateDish(event) {
  event.preventDefault();
  if (!currentCardId) return alert("No se ha seleccionado una carta.");

  const form = event.target;
  const dishName = form.elements.dishName.value;
  const dishPrice = form.elements.dishPrice.value;
  const submitButton = form.querySelector('button[type="submit"]');

  if (!dishName.trim() || !dishPrice.trim()) return;

  submitButton.disabled = true;
  submitButton.textContent = compressedDishImageFile
    ? "Subiendo imagen..."
    : "Guardando plato...";

  try {
    let photoUrl = "/images/default-dish.jpg.png"; // Default image path from images folder

    // Solo subir imagen si se ha seleccionado una
    if (compressedDishImageFile) {
      const imageFileName = `${Date.now()}-${compressedDishImageFile.name}`;
      const idToken = await currentUser.getIdToken();
      const storageRef = storage.ref(`dishes/${currentRestaurant.id}/${imageFileName}`);
      const uploadTask = await storageRef.put(compressedDishImageFile);
      photoUrl = await uploadTask.ref.getDownloadURL();
    }

    submitButton.textContent = "Guardando plato...";
    const dishData = {
      cardId: currentCardId,
      name: dishName,
      price: dishPrice,
      photoUrl: photoUrl,
    };

    const idToken = await currentUser.getIdToken();
    const response = await fetch("/api/dishes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(dishData),
    });

    if (!response.ok) {
      throw new Error("Error al guardar los datos del plato.");
    }

    form.reset();
    document.getElementById("dish-image-preview").style.display = "none";
    document.getElementById("image-upload-placeholder").style.display = "flex";
    compressedDishImageFile = null;
    closeModal(null, "newDishModal");
    showToast("Plato creado con éxito.");
    await loadDishes(currentCardId);
  } catch (error) {
    console.error("Error en el proceso de creación del plato:", error);
    alert("No se pudo crear el plato. Por favor, inténtalo de nuevo.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Crear plato";
  }
}
async function handleToggleCard(event) {
  const cardId = event.target.dataset.id;
  const isActive = event.target.checked;
  
  console.log('Toggle card called:', { cardId, isActive });
  
  if (!currentUser) {
    console.error('No current user found');
    showToast("Usuario no autenticado", "error");
    event.target.checked = !isActive;
    return;
  }
  
  try {
    const idToken = await currentUser.getIdToken();
    console.log('Making request to toggle card:', `/api/cards/${cardId}/toggle`);
    
    const response = await fetch(`/api/cards/${cardId}/toggle`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ isActive }),
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', errorText);
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Toggle card success:', result);
    showToast(isActive ? "Carta activada" : "Carta desactivada", "success");
  } catch (error) {
    console.error("Error al actualizar la carta:", error);
    showToast("No se pudo actualizar el estado de la carta.", "error");
    event.target.checked = !isActive; // Revertir el switch si hay error
  }
}
async function handleToggleDish(event) {
  const dishId = event.target.dataset.id;
  const isActive = event.target.checked;
  
  console.log('Toggle dish called:', { dishId, isActive });
  
  if (!currentUser) {
    console.error('No current user found');
    showToast("Usuario no autenticado", "error");
    event.target.checked = !isActive;
    return;
  }
  
  try {
    const idToken = await currentUser.getIdToken();
    console.log('Making request to toggle dish:', `/api/dishes/${dishId}/toggle`);
    
    const response = await fetch(`/api/dishes/${dishId}/toggle`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ isActive }),
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', errorText);
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Toggle dish success:', result);
    showToast(isActive ? "Plato activado" : "Plato desactivado", "success");
  } catch (error) {
    console.error("Error al actualizar el plato:", error);
    showToast("No se pudo actualizar el estado del plato.", "error");
    event.target.checked = !isActive; // Revertir el switch si hay error
  }
}
async function handleDeleteCard() {
  if (!currentCardId) return;
  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/cards/${currentCardId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${idToken}`, // Add token
      },
    });
    if (response.ok) {
      closeModal(null, "deleteCardAlert");
      showToast("Carta eliminada con éxito.");
      showCards();
      await loadRestaurantCards();
    } else {
      alert("Error al eliminar la carta.");
    }
  } catch (error) {
    console.error("Error de red al eliminar la carta:", error);
    alert("Error de conexión.");
  }
}
async function logout() {
  if (!auth) {
    console.warn('Firebase auth not initialized');
    return;
  }
  
  await showLogoutModal({ duration: 2500 }); // 2.5 s
  auth.signOut();
}
window.addEventListener("pageshow", function (event) {
  if (event.persisted) {
    // Verificar que auth esté disponible antes de usarlo
    if (auth) {
      checkAuthStatus();
    }
  }
});
function showDishes(cardId, cardName) {
  currentCardId = cardId;
  originalCardName = cardName;
  document.getElementById("cards-section").style.display = "none";
  document.getElementById("dishes-section").style.display = "block";
  const cardNameInput = document.getElementById("card-name-input");
  const saveButton = document.getElementById("save-card-changes-btn");
  
  if (cardNameInput) {
    cardNameInput.value = cardName;
    
    // Limpiar eventos anteriores
    cardNameInput.onblur = null;
    cardNameInput.oninput = null;
    
    // Guardar automáticamente cuando el usuario salga del campo
    cardNameInput.addEventListener('blur', async function() {
      console.log('Blur event triggered'); // Debug
      const newName = this.value.trim();
      console.log('New name:', newName, 'Original name:', originalCardName); // Debug
      if (newName !== originalCardName && newName !== "") {
        try {
          await handleUpdateCardName();
        } catch (error) {
          console.error("Error al guardar nombre de carta:", error);
        }
      }
    });
    
    // Habilitar/deshabilitar botón según cambios y manejar contador
    cardNameInput.addEventListener('input', function() {
      const newName = this.value.trim();
      const hasChanged = newName !== originalCardName;
      const isNotEmpty = newName !== "";
      
      if (saveButton) {
        saveButton.disabled = !(hasChanged && isNotEmpty);
      }
      
      // Mostrar/ocultar alerta de límite
      showCharacterLimitAlert(this.value.length >= 35);
    });
  }
  
  // Mantener el botón visible y funcional
  if (saveButton) {
    saveButton.style.display = "block";
    saveButton.onclick = handleUpdateCardName;
  }
  
  loadDishes(cardId);
}
function showCards() {
  document.getElementById("dishes-section").style.display = "none";
  document.getElementById("cards-section").style.display = "block";
  currentCardId = null;
  const cardNameInput = document.getElementById("card-name-input");
  const saveButton = document.getElementById("save-card-changes-btn");
  
  if (cardNameInput) {
    // Limpiar eventos anteriores
    cardNameInput.onblur = null;
    cardNameInput.oninput = null;
    
    // Remover event listeners agregados dinámicamente
    const newInput = cardNameInput.cloneNode(true);
    cardNameInput.parentNode.replaceChild(newInput, cardNameInput);
    
    // Limpiar alerta
    const alert = document.getElementById("character-limit-alert");
    if (alert) alert.style.display = "none";
  }
  
  if (saveButton) {
    saveButton.onclick = null;
    saveButton.disabled = true;
    saveButton.style.display = "block";
  }
  
  loadRestaurantCards();
}
let currentlyOpenModal = null;
function openModal(modalId) {
  console.log('🔓 Abriendo modal:', modalId);
  
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "flex";
    currentlyOpenModal = modal;

    // Limpiar estado de imagen del plato cuando se abra el modal "Nuevo plato"
    if (modalId === "newDishModal") {
      clearDishImageState();
      
      // ⚡ RECONFIGURAR EVENT LISTENERS para modal de nuevo plato
      setTimeout(() => {
        console.log('🔄 Reconfigurando listeners para NUEVO plato...');
        setupModalImageListeners(false);
      }, 100);
    }
    
    // ⚡ RECONFIGURAR EVENT LISTENERS para modal de editar plato
    if (modalId === "editDishModal") {
      setTimeout(() => {
        console.log('🔄 Reconfigurando listeners para EDITAR plato...');
        setupModalImageListeners(true);
      }, 100);
    }
  }
}

// 🆕 FUNCIÓN ESPECÍFICA PARA CONFIGURAR LISTENERS EN MODALES
function setupModalImageListeners(isEditMode = false) {
  console.log('⚡ Configurando listeners específicos del modal, modo edición:', isEditMode);
  
  if (isEditMode) {
    // ===== MODAL EDITAR PLATO =====
    const editCameraBtn = document.getElementById("edit-camera-btn");
    const editGalleryBtn = document.getElementById("edit-gallery-btn");
    const editGalleryInput = document.getElementById("edit-gallery-input");
    
    console.log('📋 Elementos EDITAR en modal:', {
      editCameraBtn: !!editCameraBtn,
      editGalleryBtn: !!editGalleryBtn,
      editGalleryInput: !!editGalleryInput
    });

    // Limpiar listeners anteriores y crear nuevos
    if (editCameraBtn) {
      const newEditCameraBtn = editCameraBtn.cloneNode(true);
      editCameraBtn.parentNode.replaceChild(newEditCameraBtn, editCameraBtn);
      
      // CLICK
      newEditCameraBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🟢 MODAL CLICK: Cámara EDITAR presionada');
        
        try {
          await openCameraCapture(true);
        } catch (error) {
          console.error('❌ Error modal cámara EDITAR:', error);
          alert('Error al acceder a la cámara: ' + error.message);
        }
      });

      // TOUCH
      newEditCameraBtn.addEventListener("touchstart", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📱 MODAL TOUCH: Cámara EDITAR tocada');
        
        try {
          await openCameraCapture(true);
        } catch (error) {
          console.error('❌ Error modal cámara EDITAR (touch):', error);
          alert('Error al acceder a la cámara: ' + error.message);
        }
      }, { passive: false });
      
      console.log('✅ Cámara EDITAR reconfigurada en modal');
    }

    if (editGalleryBtn && editGalleryInput) {
      const newEditGalleryBtn = editGalleryBtn.cloneNode(true);
      editGalleryBtn.parentNode.replaceChild(newEditGalleryBtn, editGalleryBtn);
      
      // CLICK
      newEditGalleryBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔵 MODAL CLICK: Galería EDITAR presionada');
        editGalleryInput.click();
      });

      // TOUCH
      newEditGalleryBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📱 MODAL TOUCH: Galería EDITAR tocada');
        editGalleryInput.click();
      }, { passive: false });
      
      console.log('✅ Galería EDITAR reconfigurada en modal');
    }
    
  } else {
    // ===== MODAL NUEVO PLATO =====
    const cameraBtn = document.getElementById("camera-btn");
    const galleryBtn = document.getElementById("gallery-btn");
    const galleryInput = document.getElementById("gallery-input");
    
    console.log('📋 Elementos NUEVO en modal:', {
      cameraBtn: !!cameraBtn,
      galleryBtn: !!galleryBtn,
      galleryInput: !!galleryInput
    });

    // Limpiar listeners anteriores y crear nuevos
    if (cameraBtn) {
      const newCameraBtn = cameraBtn.cloneNode(true);
      cameraBtn.parentNode.replaceChild(newCameraBtn, cameraBtn);
      
      // CLICK
      newCameraBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🟢 MODAL CLICK: Cámara NUEVO presionada');
        
        try {
          await openCameraCapture(false);
        } catch (error) {
          console.error('❌ Error modal cámara NUEVO:', error);
          alert('Error al acceder a la cámara: ' + error.message);
        }
      });

      // TOUCH
      newCameraBtn.addEventListener("touchstart", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📱 MODAL TOUCH: Cámara NUEVO tocada');
        
        try {
          await openCameraCapture(false);
        } catch (error) {
          console.error('❌ Error modal cámara NUEVO (touch):', error);
          alert('Error al acceder a la cámara: ' + error.message);
        }
      }, { passive: false });
      
      console.log('✅ Cámara NUEVO reconfigurada en modal');
    }

    if (galleryBtn && galleryInput) {
      const newGalleryBtn = galleryBtn.cloneNode(true);
      galleryBtn.parentNode.replaceChild(newGalleryBtn, galleryBtn);
      
      // CLICK
      newGalleryBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔵 MODAL CLICK: Galería NUEVO presionada');
        galleryInput.click();
      });

      // TOUCH
      newGalleryBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📱 MODAL TOUCH: Galería NUEVO tocada');
        galleryInput.click();
      }, { passive: false });
      
      console.log('✅ Galería NUEVO reconfigurada en modal');
    }
  }
  
  console.log('🎉 ¡Listeners del modal configurados exitosamente!');
}
function closeModal(event, forceModalId = null) {
  let modalToClose = null;
  if (forceModalId) {
    modalToClose = document.getElementById(forceModalId);
  } else if (event && event.target.classList.contains("modal-backdrop")) {
    modalToClose = event.target;
  } else if (event && event.target.classList.contains("modal-close-btn")) {
    modalToClose = event.target.closest(".modal-backdrop");
  }
  if (modalToClose) {
    modalToClose.style.display = "none";

    // Limpiar estado de imagen del plato cuando se cierre el modal "Nuevo plato"
    if (modalToClose.id === "newDishModal") {
      clearDishImageState();
    }
  }
}

// Función para limpiar el estado temporal de la imagen del plato
function clearDishImageState() {
  // Limpiar la variable global de la imagen comprimida
  compressedDishImageFile = null;

  // Limpiar el input de archivo
  const imageInput = document.getElementById("dish-image-input");
  if (imageInput) {
    imageInput.value = "";
  }

  // Restablecer el preview a la imagen por defecto
  const preview = document.getElementById("dish-image-preview");
  const placeholder = document.getElementById("image-upload-placeholder");
  const deleteBtn = document.getElementById("new-delete-photo-btn");

  if (preview && placeholder) {
    preview.src = "https://placehold.co/120x120/E2E8F0/4A5568?text=Imagen";
    preview.style.display = "none";
    placeholder.style.display = "block";
  }

  // Ocultar botón eliminar
  if (deleteBtn) {
    deleteBtn.style.display = "none";
  }

  // Limpiar el formulario completo
  const form = document.getElementById("new-dish-form");
  if (form) {
    form.reset();
  }

  // Cerrar el cropper si está abierto
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  // Cerrar el modal de cropper si está abierto
  const cropperModal = document.getElementById("cropperModal");
  if (cropperModal && cropperModal.style.display !== "none") {
    cropperModal.style.display = "none";
  }
}
function setupImageUploader() {
  console.log('🔧 Configurando event listeners para imágenes...');
  
  const imageInput = document.getElementById("dish-image-input");
  const cameraInput = document.getElementById("camera-input");
  const galleryInput = document.getElementById("gallery-input");
  const cameraBtn = document.getElementById("camera-btn");
  const galleryBtn = document.getElementById("gallery-btn");
  const newDeleteBtn = document.getElementById("new-delete-photo-btn");

  console.log('📋 Elementos encontrados:', {
    imageInput: !!imageInput,
    cameraInput: !!cameraInput,
    galleryInput: !!galleryInput,
    cameraBtn: !!cameraBtn,
    galleryBtn: !!galleryBtn,
    newDeleteBtn: !!newDeleteBtn
  });

  // Configuración para modal de nuevo plato
  if (imageInput) {
    imageInput.addEventListener("change", handleImageSelection);
  }
  if (cameraInput) {
    cameraInput.addEventListener("change", handleImageSelection);
  }
  if (galleryInput) {
    galleryInput.addEventListener("change", handleImageSelection);
  }

  // Configurar botón eliminar para modal de nuevo plato
  if (newDeleteBtn) {
    newDeleteBtn.addEventListener("click", handleDeleteNewPhoto);
  }

  // ✅ BOTÓN CÁMARA - NUEVO PLATO
  if (cameraBtn) {
    console.log('📸 Configurando botón cámara...');
    
    // Evento CLICK
    cameraBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🟢 CLICK: Botón cámara presionado');
      
      try {
        await openCameraCapture(false);
      } catch (error) {
        console.error('❌ Error al abrir cámara:', error);
        alert('Error al acceder a la cámara: ' + error.message);
      }
    });

    // Evento TOUCH para móviles
    cameraBtn.addEventListener("touchstart", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 TOUCH: Botón cámara tocado');
      
      try {
        await openCameraCapture(false);
      } catch (error) {
        console.error('❌ Error al abrir cámara (touch):', error);
        alert('Error al acceder a la cámara: ' + error.message);
      }
    }, { passive: false });
    
    console.log('✅ Botón cámara configurado correctamente');
  } else {
    console.error('❌ Botón cámara NO encontrado!');
  }

  // ✅ BOTÓN GALERÍA - NUEVO PLATO
  if (galleryBtn && galleryInput) {
    console.log('🖼️ Configurando botón galería...');
    
    // Evento CLICK
    galleryBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔵 CLICK: Botón galería presionado');
      galleryInput.click();
    });

    // Evento TOUCH para móviles
    galleryBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 TOUCH: Botón galería tocado');
      galleryInput.click();
    }, { passive: false });
    
    console.log('✅ Botón galería configurado correctamente');
  } else {
    console.error('❌ Botón galería o input NO encontrado!', {
      galleryBtn: !!galleryBtn,
      galleryInput: !!galleryInput
    });
  }

  // Configuración para modal de editar plato
  const editCameraInput = document.getElementById("edit-camera-input");
  const editGalleryInput = document.getElementById("edit-gallery-input");
  const editCameraBtn = document.getElementById("edit-camera-btn");
  const editGalleryBtn = document.getElementById("edit-gallery-btn");

  console.log('📋 Elementos EDITAR encontrados:', {
    editCameraInput: !!editCameraInput,
    editGalleryInput: !!editGalleryInput,
    editCameraBtn: !!editCameraBtn,
    editGalleryBtn: !!editGalleryBtn
  });

  if (editCameraInput) {
    editCameraInput.addEventListener("change", handleEditImageSelection);
  }

  if (editGalleryInput) {
    editGalleryInput.addEventListener("change", handleEditImageSelection);
  }

  // ✅ BOTÓN CÁMARA - EDITAR PLATO
  if (editCameraBtn) {
    console.log('📸 Configurando botón cámara EDITAR...');
    
    // Evento CLICK
    editCameraBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🟢 CLICK: Botón cámara EDITAR presionado');
      
      try {
        await openCameraCapture(true);
      } catch (error) {
        console.error('❌ Error al abrir cámara EDITAR:', error);
        alert('Error al acceder a la cámara: ' + error.message);
      }
    });

    // Evento TOUCH para móviles
    editCameraBtn.addEventListener("touchstart", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 TOUCH: Botón cámara EDITAR tocado');
      
      try {
        await openCameraCapture(true);
      } catch (error) {
        console.error('❌ Error al abrir cámara EDITAR (touch):', error);
        alert('Error al acceder a la cámara: ' + error.message);
      }
    }, { passive: false });
    
    console.log('✅ Botón cámara EDITAR configurado correctamente');
  } else {
    console.error('❌ Botón cámara EDITAR NO encontrado!');
  }

  // ✅ BOTÓN GALERÍA - EDITAR PLATO  
  if (editGalleryBtn && editGalleryInput) {
    console.log('🖼️ Configurando botón galería EDITAR...');
    
    // Evento CLICK
    editGalleryBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔵 CLICK: Botón galería EDITAR presionado');
      editGalleryInput.click();
    });

    // Evento TOUCH para móviles
    editGalleryBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 TOUCH: Botón galería EDITAR tocado');
      editGalleryInput.click();
    }, { passive: false });
    
    console.log('✅ Botón galería EDITAR configurado correctamente');
  } else {
    console.error('❌ Botón galería EDITAR o input NO encontrado!', {
      editGalleryBtn: !!editGalleryBtn,
      editGalleryInput: !!editGalleryInput
    });
  }
  
  console.log('🎉 ¡Configuración de event listeners completada!');
}
// Función auxiliar para obtener dimensiones de la imagen
function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(url);
    };
    img.onerror = (error) => {
      reject(error);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// Función para validar tipos de archivo
function validateFileType(file) {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const blockedTypes = ["image/avif", "image/heic", "image/heif"];

  // Verificar si el tipo está explícitamente bloqueado
  if (blockedTypes.includes(file.type.toLowerCase())) {
    showModalAlert("Solo se permite subir fotos");
    return false;
  }

  // Verificar si el tipo está en la lista de permitidos
  if (!allowedTypes.includes(file.type.toLowerCase())) {
    showModalAlert("Solo se permite subir fotos");
    return false;
  }

  return true;
}

// Función para abrir la captura de cámara
async function openCameraCapture(isEditMode = false, isRestaurantImage = false, isRestaurantLogo = false) {
  console.log('📸 Intentando abrir cámara, modo edición:', isEditMode, 'imagen restaurante:', isRestaurantImage, 'logo restaurante:', isRestaurantLogo);
  
  try {
    // Verificar si el navegador soporta getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('❌ El navegador no soporta getUserMedia');
      alert(
        "Tu navegador no soporta el acceso a la cámara. Intenta usar Chrome, Firefox o Safari más recientes."
      );
      return;
    }

    console.log('✅ Navegador soporta getUserMedia, solicitando permisos...');

    // Configuración optimizada para móviles
    const constraints = {
      video: {
        facingMode: { ideal: "environment" }, // Preferir cámara trasera
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 }
      },
      audio: false
    };

    console.log('📋 Configuración de cámara:', constraints);

    // Solicitar acceso a la cámara
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    console.log('✅ Acceso a cámara obtenido exitosamente');
    console.log('📊 Stream info:', {
      active: stream.active,
      tracks: stream.getTracks().length,
      videoTrack: stream.getVideoTracks()[0]?.label
    });

    // Crear el modal de cámara
    createCameraModal(stream, isEditMode, isRestaurantImage, isRestaurantLogo);
    
  } catch (error) {
    console.error('❌ Error al acceder a la cámara:', error);

    // Mensajes de error más específicos y útiles
    let userMessage = "Error al acceder a la cámara: ";
    
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      userMessage += "Permisos denegados. Ve a la configuración de tu navegador y permite el acceso a la cámara para este sitio.";
    } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      userMessage += "No se encontró ninguna cámara en tu dispositivo. Verifica que tu cámara esté conectada y funcionando.";
    } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      userMessage += "La cámara está siendo utilizada por otra aplicación. Cierra otras aplicaciones que puedan estar usando la cámara.";
    } else if (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError") {
      userMessage += "Tu cámara no cumple con los requisitos necesarios. Intenta con otro dispositivo.";
    } else if (error.name === "NotSupportedError") {
      userMessage += "Tu navegador no soporta esta funcionalidad. Intenta actualizar tu navegador.";
    } else if (error.name === "TypeError") {
      userMessage += "Error de configuración. Intenta recargar la página.";
    } else {
      userMessage += error.message || "Error desconocido. Intenta de nuevo.";
    }
    
    alert(userMessage);
  }
}

// Función para crear el modal de cámara
function createCameraModal(stream, isEditMode = false, isRestaurantImage = false, isRestaurantLogo = false) {
  // Crear el modal
  const modal = document.createElement("div");
  modal.id = "camera-modal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  // Crear el contenedor del video
  const videoContainer = document.createElement("div");
  videoContainer.style.cssText = `
    position: relative;
    max-width: 90vw;
    max-height: 70vh;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
  `;

  // Crear el elemento video
  const video = document.createElement("video");
  video.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
  `;
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;

  // Crear los controles
  const controls = document.createElement("div");
  controls.style.cssText = `
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 20px;
  `;

  // Botón de captura
  const captureBtn = document.createElement("button");
  captureBtn.innerHTML = "📸 Tomar Foto";
  captureBtn.style.cssText = `
    background: #007bff;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    font-weight: 600;
  `;

  // Botón de cerrar
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "❌ Cerrar";
  closeBtn.style.cssText = `
    background: #dc3545;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    font-weight: 600;
  `;

  // Eventos
  captureBtn.addEventListener("click", () => {
    capturePhoto(video, stream, modal, isEditMode, isRestaurantImage, isRestaurantLogo);
  });

  closeBtn.addEventListener("click", () => {
    closeCameraModal(stream, modal);
  });

  // Ensamblar el modal
  videoContainer.appendChild(video);
  controls.appendChild(captureBtn);
  controls.appendChild(closeBtn);
  modal.appendChild(videoContainer);
  modal.appendChild(controls);
  document.body.appendChild(modal);
}

// Función para capturar la foto
function capturePhoto(video, stream, modal, isEditMode = false, isRestaurantImage = false, isRestaurantLogo = false) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  // Establecer las dimensiones del canvas
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Dibujar el frame actual del video en el canvas
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Convertir a blob
  canvas.toBlob(
    (blob) => {
      if (blob) {
        // Crear un archivo desde el blob
        const file = new File([blob], `camera-photo-${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });

        // Procesar la imagen capturada según el tipo
        if (isRestaurantImage) {
          processRestaurantImageCaptured(file);
        } else if (isRestaurantLogo) {
          processRestaurantLogoCaptured(file);
        } else if (isEditMode) {
          processEditCapturedImage(file);
        } else {
          processCapturedImage(file);
        }

        // Cerrar el modal
        closeCameraModal(stream, modal);
      }
    },
    "image/jpeg",
    0.9
  );
}

// Función para procesar la imagen capturada (nuevo plato)
async function processCapturedImage(file) {
  try {
    const { width, height } = await getImageDimensions(file);
    const minWidth = 160;
    const minHeight = 120;
    const maxWidth = 16384;
    const maxHeight = 16384;

    if (width < minWidth || height < minHeight) {
      showModalAlert(`La resolución de la imagen es muy baja`);
      return;
    }

    if (width > maxWidth || height > maxHeight) {
      showModalAlert(
        `La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`
      );
      return;
    }

    const preview = document.getElementById("dish-image-preview");
    const placeholder = document.getElementById("image-upload-placeholder");
    const cameraInput = document.getElementById("camera-input");

    // Simular la selección de archivo
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    cameraInput.files = dataTransfer.files;

    // Abrir el modal de recorte
    openCropperModal(file, cameraInput, preview, placeholder);
  } catch (error) {
    console.error("Error al procesar la imagen capturada:", error);
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
  }
}

// Función para procesar la imagen capturada (editar plato)
async function processEditCapturedImage(file) {
  try {
    const { width, height } = await getImageDimensions(file);
    const minWidth = 160;
    const minHeight = 120;
    const maxWidth = 16384;
    const maxHeight = 16384;

    if (width < minWidth || height < minHeight) {
      showModalAlert(`La resolución de la imagen es muy baja`);
      return;
    }

    if (width > maxWidth || height > maxHeight) {
      showModalAlert(
        `La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`
      );
      return;
    }

    const preview = document.getElementById("edit-dish-image-preview");
    const placeholder = document.getElementById(
      "edit-image-upload-placeholder"
    );
    const editCameraInput = document.getElementById("edit-camera-input");

    // Simular la selección de archivo
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    editCameraInput.files = dataTransfer.files;

    // Abrir el modal de recorte
    openCropperModal(file, editCameraInput, preview, placeholder);
  } catch (error) {
    console.error("Error al procesar la imagen capturada:", error);
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
  }
}

// Función para procesar la imagen del restaurante capturada
async function processRestaurantImageCaptured(file) {
  try {
    const { width, height } = await getImageDimensions(file);
    const minWidth = 160;
    const minHeight = 120;
    const maxWidth = 16384;
    const maxHeight = 16384;

    if (width < minWidth || height < minHeight) {
      showModalAlert(`La resolución de la imagen es muy baja`);
      return;
    }

    if (width > maxWidth || height > maxHeight) {
      showModalAlert(
        `La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`
      );
      return;
    }

    const preview = document.getElementById("edit-restaurant-image-preview");
    const placeholder = document.getElementById("edit-restaurant-image-placeholder");
    const cameraInput = document.getElementById("edit-restaurant-camera-input");

    // Simular la selección de archivo
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    cameraInput.files = dataTransfer.files;

    // Abrir el modal de recorte para imagen del restaurante
    openRestaurantCropperModal(file, cameraInput, preview);
  } catch (error) {
    console.error("Error al procesar la imagen del restaurante capturada:", error);
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
  }
}

// Función para procesar el logo del restaurante capturado
async function processRestaurantLogoCaptured(file) {
  try {
    const { width, height } = await getImageDimensions(file);
    const minWidth = 160;
    const minHeight = 120;
    const maxWidth = 16384;
    const maxHeight = 16384;

    if (width < minWidth || height < minHeight) {
      showModalAlert(`La resolución de la imagen es muy baja`);
      return;
    }

    if (width > maxWidth || height > maxHeight) {
      showModalAlert(
        `La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`
      );
      return;
    }

    const preview = document.getElementById("edit-restaurant-logo-preview");
    const placeholder = document.getElementById("edit-restaurant-logo-placeholder");
    const cameraInput = document.getElementById("edit-restaurant-logo-camera-input");

    // Simular la selección de archivo
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    cameraInput.files = dataTransfer.files;

    // Abrir el modal de recorte para logo del restaurante
    openLogoCropperModal(file, cameraInput, preview);
  } catch (error) {
    console.error("Error al procesar el logo del restaurante capturado:", error);
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
  }
}

// Función para cerrar el modal de cámara
function closeCameraModal(stream, modal) {
  // Detener el stream de video
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  // Remover el modal
  if (modal && modal.parentNode) {
    modal.parentNode.removeChild(modal);
  }
}

// Modificación en handleImageSelection
async function handleImageSelection(event) {
  const preview = document.getElementById("dish-image-preview");
  const placeholder = document.getElementById("image-upload-placeholder");
  const deleteBtn = document.getElementById("new-delete-photo-btn");
  const file = event.target.files[0];
  if (!file) return;

  // Validar tipo de archivo
  if (!validateFileType(file)) {
    event.target.value = "";
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    alert("La imagen es demasiado grande. Elige una de menos de 50MB.");
    event.target.value = "";
    return;
  }

  try {
    const { width, height } = await getImageDimensions(file);
    const minWidth = 160;
    const minHeight = 120;
    const maxWidth = 16384;
    const maxHeight = 16384;

    if (width < minWidth || height < minHeight) {
      showModalAlert(`La resolución de la imagen es muy baja`);
      event.target.value = "";
      return;
    }

    if (width > maxWidth || height > maxHeight) {
      showModalAlert(
        `La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`
      );
      event.target.value = "";
      return;
    }

    // Abrir el modal de recorte pasando el botón eliminar
    openCropperModal(file, event.target, preview, placeholder, deleteBtn);
  } catch (error) {
    console.error("Error al procesar la imagen:", error);
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
    event.target.value = "";
  }
}

// Función para manejar la selección de imagen en el modal de editar plato
async function handleEditImageSelection(event) {
  const preview = document.getElementById("edit-dish-image-preview");
  const placeholder = document.getElementById("edit-image-upload-placeholder");
  const deleteBtn = document.getElementById("edit-delete-photo-btn");
  const file = event.target.files[0];
  if (!file) return;

  // Validar tipo de archivo
  if (!validateFileType(file)) {
    event.target.value = "";
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    alert("La imagen es demasiado grande. Elige una de menos de 50MB.");
    event.target.value = "";
    return;
  }

  try {
    const { width, height } = await getImageDimensions(file);
    const minWidth = 160;
    const minHeight = 120;
    const maxWidth = 16384;
    const maxHeight = 16384;

    if (width < minWidth || height < minHeight) {
      showModalAlert(`La resolución de la imagen es muy baja`);
      event.target.value = "";
      return;
    }

    if (width > maxWidth || height > maxHeight) {
      showModalAlert(
        `La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`
      );
      event.target.value = "";
      return;
    }

    // Abrir el modal de recorte
    openCropperModal(file, event.target, preview, placeholder, deleteBtn);
  } catch (error) {
    console.error("Error al procesar la imagen:", error);
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
    event.target.value = "";
  }
}

function handleDeleteEditPhoto() {
  const imageContainer = document.getElementById("edit-image-container");
  const placeholder = document.getElementById("edit-image-upload-placeholder");
  const deleteBtn = document.getElementById("edit-delete-photo-btn");
  const cameraInput = document.getElementById("edit-camera-input");
  const galleryInput = document.getElementById("edit-gallery-input");
  const editImageInput = document.getElementById("edit-dish-image-input");

  // Ocultar imagen, botón eliminar y mostrar placeholder
  imageContainer.style.display = "none";
  deleteBtn.style.display = "none";
  placeholder.style.display = "flex";

  // Limpiar inputs de archivo
  cameraInput.value = "";
  galleryInput.value = "";
  editImageInput.value = "";

  // Limpiar archivo comprimido si existe
  compressedDishImageFile = null;

  // Marcar que la imagen fue eliminada
  window.imageWasDeleted = true;
}

function handleDeleteNewPhoto() {
  const preview = document.getElementById("dish-image-preview");
  const placeholder = document.getElementById("image-upload-placeholder");
  const deleteBtn = document.getElementById("new-delete-photo-btn");
  const imageInput = document.getElementById("dish-image-input");
  const cameraInput = document.getElementById("camera-input");
  const galleryInput = document.getElementById("gallery-input");

  // Ocultar imagen y botón eliminar, mostrar placeholder
  preview.style.display = "none";
  deleteBtn.style.display = "none";
  placeholder.style.display = "flex";

  // Limpiar inputs de archivo
  imageInput.value = "";
  cameraInput.value = "";
  galleryInput.value = "";

  // Limpiar archivo comprimido si existe
  compressedDishImageFile = null;
}

// Función para eliminar la foto del restaurante
async function handleDeleteRestaurantPhoto() {
  const preview = document.getElementById("edit-restaurant-image-preview");
  const placeholder = document.getElementById("edit-restaurant-image-placeholder");
  const deleteBtn = document.getElementById("edit-restaurant-delete-photo-btn");
  
  // Limpiar todos los inputs relacionados con la imagen del restaurante
  const imageInput = document.getElementById("edit-restaurant-image-input");
  const cameraInput = document.getElementById("edit-restaurant-camera-input");
  const galleryInput = document.getElementById("edit-restaurant-gallery-input");
  
  // Ocultar preview y mostrar placeholder
  if (preview) preview.style.display = "none";
  if (placeholder) placeholder.style.display = "flex";
  
  // Limpiar inputs de archivo
  if (imageInput) imageInput.value = "";
  if (cameraInput) cameraInput.value = "";
  if (galleryInput) galleryInput.value = "";

  // Ocultar botón eliminar
  if (deleteBtn) deleteBtn.style.display = "none";

  // Limpiar archivo comprimido si existe
  compressedRestaurantImageFile = null;

  // Marcar que la imagen fue eliminada
  window.restaurantImageWasDeleted = true;
  
  // Activar auto-guardado después de eliminar la imagen
  await handleAutoSaveRestaurant({ target: { id: 'delete-restaurant-photo' } });
}

// Función para eliminar el logo del restaurante
async function handleDeleteRestaurantLogo() {
  const preview = document.getElementById("edit-restaurant-logo-preview");
  const placeholder = document.getElementById("edit-restaurant-logo-placeholder");
  const deleteBtn = document.getElementById("edit-restaurant-delete-logo-btn");
  
  // Limpiar todos los inputs relacionados con el logo del restaurante
  const logoInput = document.getElementById("edit-restaurant-logo-input");
  const logoCameraInput = document.getElementById("edit-restaurant-logo-camera-input");
  const logoGalleryInput = document.getElementById("edit-restaurant-logo-gallery-input");
  
  // Ocultar preview y mostrar placeholder
  if (preview) preview.style.display = "none";
  if (placeholder) placeholder.style.display = "flex";
  
  // Limpiar inputs de archivo
  if (logoInput) logoInput.value = "";
  if (logoCameraInput) logoCameraInput.value = "";
  if (logoGalleryInput) logoGalleryInput.value = "";

  // Ocultar botón eliminar
  if (deleteBtn) deleteBtn.style.display = "none";

  // Limpiar archivo comprimido si existe
  compressedRestaurantLogoFile = null;

  // Marcar que el logo fue eliminado
  window.restaurantLogoWasDeleted = true;
  
  // Activar auto-guardado después de eliminar el logo
  await handleAutoSaveRestaurant({ target: { id: 'delete-restaurant-logo' } });
}

async function compressImage(file, quality = 0.7, maxWidth = 800) {
  try {
    // Configuración para browser-image-compression
    const options = {
      maxSizeMB: 3, // Garantizar que el archivo final sea menor a 3MB
      maxWidthOrHeight: maxWidth, // Mantener el ancho máximo
      useWebWorker: true, // Usar Web Workers para mejor rendimiento
      fileType: "image/jpeg", // Convertir a JPEG
      initialQuality: quality, // Calidad inicial
    };

    // Comprimir la imagen usando browser-image-compression
    const compressedFile = await imageCompression(file, options);

    // Verificar que el archivo comprimido sea menor a 3MB
    if (compressedFile.size > 3 * 1024 * 1024) {
      // Si aún es muy grande, intentar con configuración más agresiva
      const aggressiveOptions = {
        maxSizeMB: 2.5,
        maxWidthOrHeight: Math.min(maxWidth, 600),
        useWebWorker: true,
        fileType: "image/jpeg",
        initialQuality: 0.6,
      };
      return await imageCompression(file, aggressiveOptions);
    }

    return compressedFile;
  } catch (error) {
    console.error("Error al comprimir imagen:", error);
    throw new Error(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
  }
}
function openEditRestaurantModal() {
  if (!currentRestaurant) {
    console.error('No currentRestaurant data available');
    return;
  }

  // Campos básicos
  document.getElementById("edit-restaurant-name").value = currentRestaurant.name || "";
  document.getElementById("edit-restaurant-description").value = currentRestaurant.description || "";
  document.getElementById("edit-restaurant-district").value = currentRestaurant.district || "";
  document.getElementById("edit-restaurant-whatsapp").value = currentRestaurant.whatsapp || "";
  
  // Configurar imagen del local
  const imagePreview = document.getElementById("edit-restaurant-image-preview");
  const imagePlaceholder = document.getElementById("edit-restaurant-image-placeholder");
  const deletePhotoBtn = document.getElementById("edit-restaurant-delete-photo-btn");
  
  if (currentRestaurant.photoUrl && currentRestaurant.photoUrl !== "https://placehold.co/120x120/E2E8F0/4A5568?text=Local") {
    imagePreview.src = currentRestaurant.photoUrl;
    imagePreview.style.display = "block";
    imagePlaceholder.style.display = "none";
    if (deletePhotoBtn) deletePhotoBtn.style.display = "flex";
  } else {
    imagePreview.style.display = "none";
    imagePlaceholder.style.display = "flex";
    if (deletePhotoBtn) deletePhotoBtn.style.display = "none";
  }
  
  // Configurar logo del restaurante
  const logoPreview = document.getElementById("edit-restaurant-logo-preview");
  const logoPlaceholder = document.getElementById("edit-restaurant-logo-placeholder");
  const deleteLogoBtn = document.getElementById("edit-restaurant-delete-logo-btn");
  
  if (currentRestaurant.logoUrl && currentRestaurant.logoUrl !== "https://placehold.co/120x120/E2E8F0/4A5568?text=Logo") {
    logoPreview.src = currentRestaurant.logoUrl;
    logoPreview.style.display = "block";
    logoPlaceholder.style.display = "none";
    if (deleteLogoBtn) deleteLogoBtn.style.display = "flex";
  } else {
    logoPreview.style.display = "none";
    logoPlaceholder.style.display = "flex";
    if (deleteLogoBtn) deleteLogoBtn.style.display = "none";
  }

  // Resetear flags de eliminación
  window.restaurantImageWasDeleted = false;
  window.restaurantLogoWasDeleted = false;

  // Configurar event listeners para los botones de eliminar
  if (deletePhotoBtn) {
    deletePhotoBtn.onclick = handleDeleteRestaurantPhoto;
  }

  if (deleteLogoBtn) {
    deleteLogoBtn.onclick = handleDeleteRestaurantLogo;
  }

  // Campos adicionales
  document.getElementById("edit-restaurant-ruc").value = currentRestaurant.ruc || "";
  document.getElementById("edit-restaurant-yape").value = currentRestaurant.yape || "";
  document.getElementById("edit-restaurant-phone").value = currentRestaurant.phone || "";
  document.getElementById("edit-restaurant-location").value = currentRestaurant.location || "";
  document.getElementById("edit-restaurant-delivery").checked = currentRestaurant.hasDelivery || false;
  document.getElementById("edit-restaurant-localService").checked = currentRestaurant.hasLocalService || false;

  // Horarios
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  days.forEach((day) => {
    if (currentRestaurant.schedule && currentRestaurant.schedule[day]) {
      document.getElementById(`edit-${day}-from`).value = currentRestaurant.schedule[day].from || "";
      document.getElementById(`edit-${day}-to`).value = currentRestaurant.schedule[day].to || "";
    } else {
      document.getElementById(`edit-${day}-from`).value = "";
      document.getElementById(`edit-${day}-to`).value = "";
    }
  });

  // Limpiar archivos comprimidos y inputs
  compressedRestaurantImageFile = null;
  compressedRestaurantLogoFile = null;
  
  // Limpiar todos los inputs de archivo
  const imageInput = document.getElementById("edit-restaurant-image-input");
  const cameraInput = document.getElementById("edit-restaurant-camera-input");
  const galleryInput = document.getElementById("edit-restaurant-gallery-input");
  const logoInput = document.getElementById("edit-restaurant-logo-input");
  const logoCameraInput = document.getElementById("edit-restaurant-logo-camera-input");
  const logoGalleryInput = document.getElementById("edit-restaurant-logo-gallery-input");
  
  if (imageInput) imageInput.value = "";
  if (cameraInput) cameraInput.value = "";
  if (galleryInput) galleryInput.value = "";
  if (logoInput) logoInput.value = "";
  if (logoCameraInput) logoCameraInput.value = "";
  if (logoGalleryInput) logoGalleryInput.value = "";
  
  // Configurar event listeners cada vez que se abre el modal
  setupEditRestaurantImageUploader();
  
  // Configurar auto-guardado para todos los campos
  setupAutoSaveRestaurant();
  
  // Configurar botones de eliminar después de todo lo demás
  setTimeout(() => {
    setupDeleteButtons();
  }, 100);
  
  openModal("editRestaurantModal");
}
function syncScheduleWithMonday() {
  const mondayFromValue = document.getElementById("edit-monday-from").value;
  const mondayToValue = document.getElementById("edit-monday-to").value;

  if (!mondayFromValue || !mondayToValue) {
    alert("Por favor, completa primero el horario del Lunes");
    return;
  }

  const days = [
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  days.forEach((day) => {
    document.getElementById(`edit-${day}-from`).value = mondayFromValue;
    document.getElementById(`edit-${day}-to`).value = mondayToValue;
  });
}

// Función para configurar auto-guardado del restaurante
function setupDeleteButtons() {
  const deletePhotoBtn = document.getElementById('edit-restaurant-delete-photo-btn');
  const deleteLogoBtn = document.getElementById('edit-restaurant-delete-logo-btn');
  
  if (deletePhotoBtn) {
    // Remover cualquier event listener anterior
    deletePhotoBtn.onclick = null;
    deletePhotoBtn.removeEventListener('click', handleDeleteRestaurantPhoto);
    
    // Asignar el event listener
    deletePhotoBtn.addEventListener('click', handleDeleteRestaurantPhoto);
  }
  
  if (deleteLogoBtn) {
    // Remover cualquier event listener anterior  
    deleteLogoBtn.onclick = null;
    deleteLogoBtn.removeEventListener('click', handleDeleteRestaurantLogo);
    
    // Asignar el event listener
    deleteLogoBtn.addEventListener('click', handleDeleteRestaurantLogo);
  }
}

function setupAutoSaveRestaurant() {
  // Lista de todos los campos que deben activar el auto-guardado
  const autoSaveFields = [
    'edit-restaurant-name',
    'edit-restaurant-description', 
    'edit-restaurant-ruc',
    'edit-restaurant-district',
    'edit-restaurant-whatsapp',
    'edit-restaurant-yape',
    'edit-restaurant-phone',
    'edit-restaurant-location',
    'edit-restaurant-delivery',
    'edit-restaurant-localService',
    // Horarios
    'edit-monday-from', 'edit-monday-to',
    'edit-tuesday-from', 'edit-tuesday-to',
    'edit-wednesday-from', 'edit-wednesday-to',
    'edit-thursday-from', 'edit-thursday-to',
    'edit-friday-from', 'edit-friday-to',
    'edit-saturday-from', 'edit-saturday-to',
    'edit-sunday-from', 'edit-sunday-to'
  ];
  
  autoSaveFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      // Remover listeners anteriores para evitar duplicados
      field.removeEventListener('blur', handleAutoSaveRestaurant);
      field.removeEventListener('change', handleAutoSaveRestaurant);
      
      // Agregar nuevos listeners
      if (field.type === 'checkbox') {
        field.addEventListener('change', handleAutoSaveRestaurant);
      } else {
        field.addEventListener('blur', handleAutoSaveRestaurant);
        field.addEventListener('change', handleAutoSaveRestaurant);
      }
    }
  });
  
  // 🆕 Configurar auto-guardado para inputs de imagen
  const imageInputs = [
    'edit-restaurant-image-input',
    'edit-restaurant-logo-input',
    'edit-restaurant-camera-input',
    'edit-restaurant-gallery-input',
    'edit-restaurant-logo-camera-input', 
    'edit-restaurant-logo-gallery-input'
  ];
  
  imageInputs.forEach(inputId => {
    const input = document.getElementById(inputId);
    if (input) {
      // Remover listener anterior para evitar duplicados
      input.removeEventListener('change', handleAutoSaveRestaurant);
      
      // Agregar listener para cuando se seleccione una imagen
      input.addEventListener('change', handleAutoSaveRestaurant);
    }
  });
  
  // � Configurar auto-guardado para botones de eliminar imagen
  const deleteButtons = [
    'edit-restaurant-delete-photo-btn',
    'edit-restaurant-delete-logo-btn'
  ];
  
  deleteButtons.forEach(buttonId => {
    const button = document.getElementById(buttonId);
    if (button) {
      // Crear función wrapper para el botón de eliminar
      const deleteAndAutoSave = async (originalHandler) => {
        return async function(event) {
          // Ejecutar la función original de eliminar
          if (originalHandler) {
            await originalHandler.call(this, event);
          }
          
          // Activar auto-guardado después de eliminar
          await handleAutoSaveRestaurant({ target: { id: buttonId } });
        };
      };
      
      // Configurar el botón según su tipo
      if (buttonId === 'edit-restaurant-delete-photo-btn') {
        const originalHandler = button.onclick;
        button.onclick = deleteAndAutoSave(handleDeleteRestaurantPhoto);
      } else if (buttonId === 'edit-restaurant-delete-logo-btn') {
        const originalHandler = button.onclick;
        button.onclick = deleteAndAutoSave(handleDeleteRestaurantLogo);

      }
    } else {

    }
  });
  
  console.log('�🎉 Auto-guardado configurado para todos los campos e imágenes');
}

// Variable para controlar el debounce del auto-guardado
let autoSaveTimeout = null;

// Función que maneja el auto-guardado
async function handleAutoSaveRestaurant(event) {
  // Limpiar timeout anterior
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }
  
  // Esperar 1 segundo antes de guardar (debounce)
  autoSaveTimeout = setTimeout(async () => {
    try {
      await saveRestaurantData();
      
      // Mostrar indicador visual de guardado
      showAutoSaveIndicator();
    } catch (error) {
      console.error('Error en auto-guardado:', error);
      showToast('Error al guardar automáticamente', 'error');
    }
  }, 1000); // Esperar 1 segundo
}

// Función para guardar los datos del restaurante automáticamente
async function saveRestaurantData() {
  if (!currentRestaurant) {
    console.error('No currentRestaurant available para auto-guardado');
    return;
  }
  
  const form = document.getElementById('edit-restaurant-form');
  if (!form) {
    console.error('❌ Formulario no encontrado');
    return;
  }
  
  console.log('📋 Capturando datos del formulario para auto-guardado...');
  
  // 🆕 Manejar subida de imágenes si hay archivos comprimidos
  let photoUrl = currentRestaurant.photoUrl;
  let logoUrl = currentRestaurant.logoUrl;
  
  try {
    // Subir imagen del restaurante si hay una nueva
    if (compressedRestaurantImageFile) {
      console.log('🔄 Subiendo nueva imagen del restaurante...');
      const imageFileName = `local-${Date.now()}-${compressedRestaurantImageFile.name}`;
      const storageRef = storage.ref(`restaurants/${currentRestaurant.id}/${imageFileName}`);
      const uploadTask = await storageRef.put(compressedRestaurantImageFile);
      photoUrl = await uploadTask.ref.getDownloadURL();
      console.log('✅ Imagen del restaurante subida:', photoUrl);
      
      // Limpiar el archivo comprimido después de subirlo
      compressedRestaurantImageFile = null;
    } else if (window.restaurantImageWasDeleted) {
      // Si la imagen fue eliminada, usar imagen por defecto
      photoUrl = "https://placehold.co/120x120/E2E8F0/4A5568?text=Local";
      console.log('🗑️ Imagen del restaurante eliminada, usando por defecto');
    }

    // Subir logo del restaurante si hay uno nuevo
    if (compressedRestaurantLogoFile) {
      console.log('� Subiendo nuevo logo del restaurante...');
      const logoFileName = `logo-${Date.now()}-${compressedRestaurantLogoFile.name}`;
      const logoStorageRef = storage.ref(`restaurants/${currentRestaurant.id}/${logoFileName}`);
      const uploadLogoTask = await logoStorageRef.put(compressedRestaurantLogoFile);
      logoUrl = await uploadLogoTask.ref.getDownloadURL();
      console.log('✅ Logo del restaurante subido:', logoUrl);
      
      // Limpiar el archivo comprimido después de subirlo
      compressedRestaurantLogoFile = null;
    } else if (window.restaurantLogoWasDeleted) {
      // Si el logo fue eliminado, usar logo por defecto
      logoUrl = "https://placehold.co/120x120/E2E8F0/4A5568?text=Logo";
      console.log('🗑️ Logo del restaurante eliminado, usando por defecto');
    }
  } catch (error) {
    console.error('❌ Error al subir imágenes:', error);
    // Continuar con el guardado de datos sin las imágenes
  }
  
  // Construir el objeto de datos
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const schedule = {};
  days.forEach((day) => {
    const fromElement = document.getElementById(`edit-${day}-from`);
    const toElement = document.getElementById(`edit-${day}-to`);
    schedule[day] = {
      from: fromElement ? fromElement.value : "",
      to: toElement ? toElement.value : "",
    };
  });
  
  const updatedData = {
    name: document.getElementById('edit-restaurant-name')?.value || "",
    description: document.getElementById('edit-restaurant-description')?.value || "",
    district: document.getElementById('edit-restaurant-district')?.value || "",
    whatsapp: document.getElementById('edit-restaurant-whatsapp')?.value || "",
    photoUrl: photoUrl, // 🆕 Usar la URL actualizada
    logoUrl: logoUrl, // 🆕 Usar la URL actualizada
    ruc: document.getElementById('edit-restaurant-ruc')?.value || "",
    yape: document.getElementById('edit-restaurant-yape')?.value || "",
    phone: document.getElementById('edit-restaurant-phone')?.value || "",
    location: document.getElementById('edit-restaurant-location')?.value || "",
    hasDelivery: document.getElementById('edit-restaurant-delivery')?.checked || false,
    hasLocalService: document.getElementById('edit-restaurant-localService')?.checked || false,
    schedule: schedule,
  };
  
  console.log('📋 Datos preparados para auto-guardado:', updatedData);
  
  // Validar campos requeridos básicos
  if (!updatedData.name || !updatedData.district || !updatedData.whatsapp) {
    console.log('⚠️ Campos requeridos faltantes, omitiendo auto-guardado');
    return;
  }
  
  // Enviar al servidor
  const idToken = await currentUser.getIdToken();
  const response = await fetch(`/api/restaurants/${currentRestaurant.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(updatedData),
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Error del servidor (${response.status}): ${errorData}`);
  }
  
  console.log('✅ Auto-guardado exitoso');
  
  // Actualizar currentRestaurant con los nuevos datos
  currentRestaurant = { ...currentRestaurant, ...updatedData };
  
  // 🆕 Resetear flags de eliminación después del guardado exitoso
  window.restaurantImageWasDeleted = false;
  window.restaurantLogoWasDeleted = false;
}

// Función para mostrar indicador visual de auto-guardado
function showAutoSaveIndicator() {
  // Crear o encontrar el indicador
  let indicator = document.getElementById('auto-save-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'auto-save-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    indicator.innerHTML = '✅ Guardado automáticamente';
    document.body.appendChild(indicator);
  }
  
  // Mostrar el indicador
  indicator.style.opacity = '1';
  
  // Ocultarlo después de 2 segundos
  setTimeout(() => {
    indicator.style.opacity = '0';
  }, 2000);
}

function setupEditRestaurantImageUploader() {
  console.log('🔧 Configurando event listeners para imágenes del restaurante...');
  
  // ===== CONFIGURACIÓN PARA IMAGEN DEL LOCAL =====
  const imageInput = document.getElementById("edit-restaurant-image-input");
  const cameraInput = document.getElementById("edit-restaurant-camera-input");
  const galleryInput = document.getElementById("edit-restaurant-gallery-input");
  const cameraBtn = document.getElementById("edit-restaurant-camera-btn");
  const galleryBtn = document.getElementById("edit-restaurant-gallery-btn");

  console.log('📋 Elementos imagen del local encontrados:', {
    imageInput: !!imageInput,
    cameraInput: !!cameraInput,
    galleryInput: !!galleryInput,
    cameraBtn: !!cameraBtn,
    galleryBtn: !!galleryBtn
  });

  // Limpiar event listeners existentes para evitar duplicados
  if (cameraBtn) {
    cameraBtn.replaceWith(cameraBtn.cloneNode(true));
  }
  if (galleryBtn) {
    galleryBtn.replaceWith(galleryBtn.cloneNode(true));
  }
  
  // Referenciar los nuevos elementos después del clonado
  const newCameraBtn = document.getElementById("edit-restaurant-camera-btn");
  const newGalleryBtn = document.getElementById("edit-restaurant-gallery-btn");

  // Configurar input principal de imagen del restaurante
  if (imageInput) {
    imageInput.removeEventListener("change", handleRestaurantImageSelection);
    imageInput.addEventListener("change", handleRestaurantImageSelection);
  }

  // Configurar input de cámara para imagen del restaurante
  if (cameraInput) {
    cameraInput.removeEventListener("change", handleRestaurantImageGallerySelection);
    cameraInput.addEventListener("change", handleRestaurantImageGallerySelection);
  }

  // Configurar input de galería para imagen del restaurante
  if (galleryInput) {
    galleryInput.removeEventListener("change", handleRestaurantImageGallerySelection);
    galleryInput.addEventListener("change", handleRestaurantImageGallerySelection);
  }

  // Configurar botón de cámara para imagen del restaurante
  if (newCameraBtn) {
    // Evento CLICK
    newCameraBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🟢 CLICK: Botón cámara imagen restaurante presionado');
      
      try {
        await openCameraCapture(false, true, false);
      } catch (error) {
        console.error('❌ Error al abrir cámara imagen restaurante:', error);
        alert('Error al acceder a la cámara: ' + error.message);
      }
    });

    // Evento TOUCH para móviles
    newCameraBtn.addEventListener("touchstart", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 TOUCH: Botón cámara imagen restaurante tocado');
      
      try {
        await openCameraCapture(false, true, false);
      } catch (error) {
        console.error('❌ Error al abrir cámara imagen restaurante (touch):', error);
        alert('Error al acceder a la cámara: ' + error.message);
      }
    }, { passive: false });
    
    console.log('✅ Botón cámara imagen restaurante configurado correctamente');
  } else {
    console.error('❌ Botón cámara imagen restaurante NO encontrado!');
  }

  // Configurar botón de galería para imagen del restaurante
  if (newGalleryBtn && galleryInput) {
    // Evento CLICK
    newGalleryBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔵 CLICK: Botón galería imagen restaurante presionado');
      galleryInput.click();
    });

    // Evento TOUCH para móviles
    newGalleryBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 TOUCH: Botón galería imagen restaurante tocado');
      galleryInput.click();
    }, { passive: false });
    
    console.log('✅ Botón galería imagen restaurante configurado correctamente');
  } else {
    console.error('❌ Botón galería imagen restaurante o input NO encontrado!', {
      galleryBtn: !!galleryBtn,
      galleryInput: !!galleryInput
    });
  }

  // ===== CONFIGURACIÓN PARA LOGO DEL RESTAURANTE =====
  const logoInput = document.getElementById("edit-restaurant-logo-input");
  const logoCameraInput = document.getElementById("edit-restaurant-logo-camera-input");
  const logoGalleryInput = document.getElementById("edit-restaurant-logo-gallery-input");
  const logoCameraBtn = document.getElementById("edit-restaurant-logo-camera-btn");
  const logoGalleryBtn = document.getElementById("edit-restaurant-logo-gallery-btn");

  console.log('📋 Elementos logo del restaurante encontrados:', {
    logoInput: !!logoInput,
    logoCameraInput: !!logoCameraInput,
    logoGalleryInput: !!logoGalleryInput,
    logoCameraBtn: !!logoCameraBtn,
    logoGalleryBtn: !!logoGalleryBtn
  });

  // Limpiar event listeners existentes para evitar duplicados
  if (logoCameraBtn) {
    logoCameraBtn.replaceWith(logoCameraBtn.cloneNode(true));
  }
  if (logoGalleryBtn) {
    logoGalleryBtn.replaceWith(logoGalleryBtn.cloneNode(true));
  }
  
  // Referenciar los nuevos elementos después del clonado
  const newLogoCameraBtn = document.getElementById("edit-restaurant-logo-camera-btn");
  const newLogoGalleryBtn = document.getElementById("edit-restaurant-logo-gallery-btn");

  // Configurar input principal de logo del restaurante
  if (logoInput) {
    logoInput.removeEventListener("change", handleRestaurantLogoSelection);
    logoInput.addEventListener("change", handleRestaurantLogoSelection);
  }

  // Configurar input de cámara para logo del restaurante
  if (logoCameraInput) {
    logoCameraInput.removeEventListener("change", handleRestaurantLogoGallerySelection);
    logoCameraInput.addEventListener("change", handleRestaurantLogoGallerySelection);
  }

  // Configurar input de galería para logo del restaurante
  if (logoGalleryInput) {
    logoGalleryInput.removeEventListener("change", handleRestaurantLogoGallerySelection);
    logoGalleryInput.addEventListener("change", handleRestaurantLogoGallerySelection);
  }

  // Configurar botón de cámara para logo del restaurante
  if (newLogoCameraBtn) {
    // Evento CLICK
    newLogoCameraBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🟢 CLICK: Botón cámara logo restaurante presionado');
      
      try {
        await openCameraCapture(false, false, true);
      } catch (error) {
        console.error('❌ Error al abrir cámara logo restaurante:', error);
        alert('Error al acceder a la cámara: ' + error.message);
      }
    });

    // Evento TOUCH para móviles
    newLogoCameraBtn.addEventListener("touchstart", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 TOUCH: Botón cámara logo restaurante tocado');
      
      try {
        await openCameraCapture(false, false, true);
      } catch (error) {
        console.error('❌ Error al abrir cámara logo restaurante (touch):', error);
        alert('Error al acceder a la cámara: ' + error.message);
      }
    }, { passive: false });
    
    console.log('✅ Botón cámara logo restaurante configurado correctamente');
  } else {
    console.error('❌ Botón cámara logo restaurante NO encontrado!');
  }

  // Configurar botón de galería para logo del restaurante
  if (newLogoGalleryBtn && logoGalleryInput) {
    // Evento CLICK
    newLogoGalleryBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔵 CLICK: Botón galería logo restaurante presionado');
      logoGalleryInput.click();
    });

    // Evento TOUCH para móviles
    newLogoGalleryBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 TOUCH: Botón galería logo restaurante tocado');
      logoGalleryInput.click();
    }, { passive: false });
    
    console.log('✅ Botón galería logo restaurante configurado correctamente');
  } else {
    console.error('❌ Botón galería logo restaurante o input NO encontrado!', {
      logoGalleryBtn: !!logoGalleryBtn,
      logoGalleryInput: !!logoGalleryInput
    });
  }
  
  console.log('🎉 ¡Configuración de event listeners para restaurante completada!');
}
async function handleUpdateRestaurant(event) {
  event.preventDefault();
  if (!currentRestaurant) {
    console.error('❌ No currentRestaurant available');
    return;
  }
  
  const form = event.target;
  console.log('📋 Formulario capturado:', form);
  
  // Para el guardado manual (botón), hacer validación completa
  const requiredFields = form.querySelectorAll("input[required], select[required], textarea[required]");
  let valid = true;
  
  console.log('📋 Campos requeridos encontrados:', requiredFields.length);
  
  // Limpiar errores previos y validar campos generales
  requiredFields.forEach(field => {
    // Eliminar mensaje previo
    let errorSpan = field.parentNode.querySelector('.field-error-message');
    if (errorSpan) errorSpan.remove();
    
    if (!field.value.trim()) {
      field.classList.add("field-error");
      valid = false;
      // Crear mensaje de error debajo del campo
      errorSpan = document.createElement('span');
      errorSpan.className = 'field-error-message';
      errorSpan.textContent = 'Este campo es obligatorio.';
      errorSpan.style.color = '#e53935';
      errorSpan.style.fontSize = '0.95em';
      errorSpan.style.marginTop = '2px';
      errorSpan.style.display = 'block';
      field.parentNode.appendChild(errorSpan);
    } else {
      field.classList.remove("field-error");
    }
  });
  
  // Validación específica para horarios de atención
  const scheduleInputs = form.querySelectorAll('.schedule-row input[required]');
  scheduleInputs.forEach(field => {
    let errorSpan = field.parentNode.querySelector('.field-error-message');
    if (errorSpan) errorSpan.remove();
    
    if (!field.value) {
      field.classList.add("field-error");
      valid = false;
      errorSpan = document.createElement('span');
      errorSpan.className = 'field-error-message';
      errorSpan.textContent = 'Este campo es obligatorio.';
      errorSpan.style.color = '#e53935';
      errorSpan.style.fontSize = '0.95em';
      errorSpan.style.marginTop = '2px';
      errorSpan.style.display = 'block';
      field.parentNode.appendChild(errorSpan);
    } else {
      field.classList.remove("field-error");
    }
  });
  
  // Si hay errores, hacer scroll al primer campo con error y detener
  if (!valid) {
    const firstError = form.querySelector('.field-error');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  
  // Si la validación pasa, usar la función de guardado
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Guardando...";
  
  try {
    await saveRestaurantData();
    closeModal(null, "editRestaurantModal");
    showToast("Restaurante actualizado con éxito.");
    await loadDashboardData(); // Recargar para mostrar cambios
  } catch (error) {
    console.error("❌ Error al actualizar el restaurante:", error);
    let errorMessage = "No se pudieron guardar los cambios.";
    if (error.message.includes('500')) {
      errorMessage = "Error interno del servidor. Inténtalo de nuevo.";
    } else if (error.message.includes('400')) {
      errorMessage = "Datos inválidos. Verifica todos los campos.";
    } else if (error.message.includes('403')) {
      errorMessage = "No tienes permisos para realizar esta acción.";
    } else if (error.message.includes('Network')) {
      errorMessage = "Error de conexión. Verifica tu internet.";
    }
    alert(errorMessage + "\n\nDetalles técnicos: " + error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Guardar cambios";
  }
}

function openEditDishModal(dish) {
  editingDish = dish;
  const editImageInput = document.getElementById("edit-dish-image-input");
  document.getElementById("edit-dish-name").value = dish.name;
  document.getElementById("edit-dish-price").value = dish.price;
  const preview = document.getElementById("edit-dish-image-preview");
  const imageContainer = document.getElementById("edit-image-container");
  const placeholder = document.getElementById("edit-image-upload-placeholder");
  const deleteBtn = document.getElementById("edit-delete-photo-btn");

  // Resetear el estado de eliminación de imagen
  window.imageWasDeleted = false;

  // Mostrar la imagen actual del plato
  if (dish.photoUrl && dish.photoUrl !== "/images/default-dish.jpg.png") {
    preview.src = dish.photoUrl;
    imageContainer.style.display = "block";
    placeholder.style.display = "none";
    deleteBtn.style.display = "flex"; // Mostrar botón eliminar cuando hay imagen
  } else {
    imageContainer.style.display = "none";
    placeholder.style.display = "flex";
    deleteBtn.style.display = "none"; // Ocultar botón eliminar cuando no hay imagen
  }

  compressedDishImageFile = null;
  document.getElementById("edit-dish-image-input").value = "";
  document.getElementById("edit-camera-input").value = "";
  document.getElementById("edit-gallery-input").value = "";

  editImageInput.onchange = async (event) => {
    await handleEditImageSelection(event);
  };

  // Configurar event listener para el botón eliminar
  deleteBtn.onclick = handleDeleteEditPhoto;

  document.getElementById("open-delete-dish-alert-btn").onclick = () => {
    openModal("deleteDishAlert");
  };
  openModal("editDishModal");
}
async function handleDeleteDish() {
  if (!editingDish)
    return alert("Error: No se ha identificado el plato a eliminar.");
  const dishIdToDelete = editingDish.id;
  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/dishes/${dishIdToDelete}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${idToken}`, // Add token
      },
    });

    if (!response.ok) {
      throw new Error("El servidor no pudo eliminar el plato.");
    }
    const deleteAlertModal = document.getElementById("deleteDishAlert");
    if (deleteAlertModal) deleteAlertModal.style.display = "none";
    const editDishModal = document.getElementById("editDishModal");
    if (editDishModal) editDishModal.style.display = "none";
    showToast("Plato eliminado con éxito.");
    await loadDishes(currentCardId);
  } catch (error) {
    console.error("Error al eliminar el plato:", error);
    alert("No se pudo eliminar el plato. Por favor, inténtalo de nuevo.");
  } finally {
    editingDish = null;
  }
}

async function handleUpdateDish(event) {
  event.preventDefault();
  if (!editingDish)
    return alert("No se ha seleccionado ningún plato para editar.");

  const form = event.target;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Guardando...";

  let photoUrl = editingDish.photoUrl;

  try {
    if (compressedDishImageFile) {
      submitButton.textContent = "Subiendo imagen...";
      const imageFileName = `${Date.now()}-${compressedDishImageFile.name}`;
      const storageRef = storage.ref(`dishes/${currentRestaurant.id}/${imageFileName}`);
      const uploadTask = await storageRef.put(compressedDishImageFile);
      photoUrl = await uploadTask.ref.getDownloadURL();
    } else if (window.imageWasDeleted) {
      // Si la imagen fue eliminada, usar la imagen por defecto
      photoUrl = "/images/default-dish.jpg.png";
    }

    const updatedData = {
      name: form.elements.dishName.value,
      price: form.elements.dishPrice.value,
      photoUrl: photoUrl,
    };

    // --- INICIO DE LA CORRECCIÓN ---
    const idToken = await currentUser.getIdToken(); // Obtener el token de autorización

    const response = await fetch(`/api/dishes/${editingDish.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`, // Enviar el token al servidor
      },
      body: JSON.stringify(updatedData),
    });
    // --- FIN DE LA CORRECCIÓN ---

    if (!response.ok) {
      throw new Error("Error al actualizar el plato en el servidor.");
    }

    closeModal(null, "editDishModal");
    showToast("¡Plato actualizado!");
    await loadDishes(currentCardId);
    editingDish = null;
    compressedDishImageFile = null;
  } catch (error) {
    console.error("Error al actualizar plato:", error);
    // La línea de abajo es la que te muestra el error
    alert("No se pudieron guardar los cambios.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Guardar cambios";
  }
}
function showToast(message, type = "success") {
  const toast = document.getElementById("toast-notification");
  const toastMessage = document.getElementById("toast-message");
  if (!toast || !toastMessage) return;
  
  toastMessage.textContent = message;
  
  // Remover clases de tipo anteriores
  toast.classList.remove("toast-success", "toast-error");
  
  // Agregar clase según el tipo
  if (type === "error") {
    toast.classList.add("toast-error");
  } else {
    toast.classList.add("toast-success");
  }
  
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 1500);
}

// Función para mostrar alertas dentro del modal activo
function showModalAlert(message, type = "error") {
  // Buscar el modal activo
  const activeModal = document.querySelector(
    '.modal-backdrop[style*="flex"], .modal-backdrop[style*="block"]'
  );

  if (activeModal) {
    // Remover alerta anterior si existe
    const existingAlert = activeModal.querySelector(".modal-alert");
    if (existingAlert) {
      existingAlert.remove();
    }

    // Crear el contenedor de alerta
    const alertContainer = document.createElement("div");
    alertContainer.className = "modal-alert";
    alertContainer.style.cssText = `
      background-color: ${type === "error" ? "#ef4444" : "#10b981"};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: 600;
      margin: 1rem 0;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    alertContainer.textContent = message;

    // Buscar dónde insertar la alerta
    const modalContent = activeModal.querySelector('.modal-content');
    if (modalContent) {
      const form = modalContent.querySelector("form");
      if (form) {
        const formGroups = form.querySelectorAll('.modal-form-group');
        
        // Verificar si estamos en el modal de editar restaurante
        const isEditRestaurantModal = activeModal.id === 'editRestaurantModal';
        
        if (isEditRestaurantModal && formGroups.length >= 3) {
          // En el modal de editar restaurante: insertar después del logo (segundo grupo) y antes del nombre (tercer grupo)
          formGroups[2].parentNode.insertBefore(alertContainer, formGroups[2]);
        } else if (formGroups.length >= 2) {
          // En otros modales: insertar entre el primer grupo (imagen) y el segundo grupo (nombre)
          formGroups[1].parentNode.insertBefore(alertContainer, formGroups[1]);
        } else {
          // Si no hay suficientes grupos, insertar al inicio del formulario
          form.insertBefore(alertContainer, form.firstChild);
        }
      } else {
        // Fallback: insertar al inicio del modal content
        modalContent.insertBefore(alertContainer, modalContent.firstChild);
      }
    }

    // Mostrar la alerta con animación
    setTimeout(() => {
      alertContainer.style.opacity = "1";
    }, 10);

    // Ocultar la alerta después de 4 segundos
    setTimeout(() => {
      alertContainer.style.opacity = "0";
      setTimeout(() => {
        if (alertContainer.parentNode) {
          alertContainer.parentNode.removeChild(alertContainer);
        }
      }, 300);
    }, 4000);
  } else {
    // Fallback a alert normal si no hay modal activo
    alert(message);
  }
}

// Función para manejar la selección de imagen del restaurante
async function handleRestaurantImageSelection(event) {
  const preview = document.getElementById("edit-restaurant-image-preview");
  const file = event.target.files[0];
  if (!file) return;

  // Validar tipo de archivo
  if (!validateFileType(file)) {
    event.target.value = "";
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    alert("La imagen es demasiado grande. Elige una de menos de 50MB.");
    event.target.value = "";
    return;
  }

  try {
    const { width, height } = await getImageDimensions(file);
    const minWidth = 160;
    const minHeight = 120;
    const maxWidth = 16384;
    const maxHeight = 16384;

    if (width < minWidth || height < minHeight) {
      showModalAlert(`La resolución de la imagen es muy baja`);
      event.target.value = "";
      return;
    }

    if (width > maxWidth || height > maxHeight) {
      showModalAlert(
        `La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`
      );
      event.target.value = "";
      return;
    }

    // Abrir el modal de recorte rectangular para restaurante
    openRestaurantCropperModal(file, event.target, preview);
  } catch (error) {
    console.error("Error al procesar la imagen:", error);
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
    event.target.value = "";
  }
}

// Función para manejar la selección de logo del restaurante
async function handleRestaurantLogoSelection(event) {
  const preview = document.getElementById("edit-restaurant-logo-preview");
  const file = event.target.files[0];
  if (!file) return;

  // Validar tipo de archivo
  if (!validateFileType(file)) {
    event.target.value = "";
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    alert("El logo es demasiado grande. Elige uno de menos de 50MB.");
    event.target.value = "";
    return;
  }

  try {
    const { width, height } = await getImageDimensions(file);
    const minWidth = 160;
    const minHeight = 120;
    const maxWidth = 16384;
    const maxHeight = 16384;

    if (width < minWidth || height < minHeight) {
      showModalAlert(`La resolución de la imagen es muy baja`);
      event.target.value = "";
      return;
    }

    if (width > maxWidth || height > maxHeight) {
      showModalAlert(
        `La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`
      );
      event.target.value = "";
      return;
    }

    // Abrir el modal de recorte cuadrado para logo
    openLogoCropperModal(file, event.target, preview);
  } catch (error) {
    console.error("Error al procesar el logo:", error);
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
    event.target.value = "";
  }
}

// Función para manejar la selección de imagen de galería del restaurante
async function handleRestaurantImageGallerySelection(event) {
  await handleRestaurantImageSelection(event);
}

// Función para manejar la selección de logo de galería del restaurante
async function handleRestaurantLogoGallerySelection(event) {
  await handleRestaurantLogoSelection(event);
}

// Funciones para el modal de recorte de imagen de platos
function openCropperModal(
  file,
  imageInput,
  preview,
  placeholder,
  deleteBtn = null
) {
  currentImageInput = imageInput;
  currentPreview = preview;
  currentPlaceholder = placeholder;
  currentDeleteBtn = deleteBtn;

  const cropperModal = document.getElementById("cropperModal");
  const cropperImage = document.getElementById("cropper-image");

  // Crear URL para la imagen
  const imageUrl = URL.createObjectURL(file);
  cropperImage.src = imageUrl;

  // Mostrar el modal
  cropperModal.style.display = "flex";

  // Inicializar Cropper.js después de que la imagen se cargue
  cropperImage.onload = function () {
    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(cropperImage, {
      aspectRatio: 1, // Área cuadrada
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 0.8,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      responsive: true,
      checkOrientation: false,
    });
  };

  // Event listeners para los botones
  setupCropperButtons();
}

function setupCropperButtons() {
  const cancelBtn = document.getElementById("cancel-crop-btn");
  const saveBtn = document.getElementById("save-crop-btn");

  // Remover event listeners previos
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  saveBtn.replaceWith(saveBtn.cloneNode(true));

  // Obtener las nuevas referencias
  const newCancelBtn = document.getElementById("cancel-crop-btn");
  const newSaveBtn = document.getElementById("save-crop-btn");

  newCancelBtn.addEventListener("click", closeCropperModal);
  newSaveBtn.addEventListener("click", saveCroppedImage);
}

function closeCropperModal() {
  const cropperModal = document.getElementById("cropperModal");
  cropperModal.style.display = "none";

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  // Limpiar el input
  if (currentImageInput) {
    currentImageInput.value = "";
  }

  // Limpiar variables
  currentImageInput = null;
  currentPreview = null;
  currentPlaceholder = null;
  currentDeleteBtn = null;
}

async function saveCroppedImage() {
  if (!cropper) {
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
    return;
  }

  try {
    // Obtener el área recortada directamente del cropper
    const canvas = cropper.getCroppedCanvas({
      width: 400,
      height: 400,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    canvas.toBlob(
      async (blob) => {
        try {
          // Comprimir la imagen
          const compressedFile = await compressImage(
            new File([blob], "cropped-image.jpg", { type: "image/jpeg" })
          );
          compressedDishImageFile = compressedFile;

          // Actualizar la vista previa
          if (currentPreview) {
            const previewUrl = URL.createObjectURL(compressedFile);
            currentPreview.src = previewUrl;

            // Detectar si es el modal de editar plato por el ID del preview
            const isEditModal = currentPreview.id === "edit-dish-image-preview";

            if (isEditModal) {
              // Para el modal de editar plato, mostrar el contenedor de imagen
              const imageContainer = document.getElementById(
                "edit-image-container"
              );
              if (imageContainer) {
                imageContainer.style.display = "block";
              }
              if (currentPlaceholder) {
                currentPlaceholder.style.display = "none";
              }
              // Resetear el estado de eliminación ya que se seleccionó una nueva imagen
              window.imageWasDeleted = false;
            } else {
              // Para el modal de nuevo plato
              currentPreview.style.display = "block";
              if (currentPlaceholder) {
                currentPlaceholder.style.display = "none";
              }
            }

            // Mostrar botón eliminar en ambos modales
            if (currentDeleteBtn) {
              currentDeleteBtn.style.display = "flex";
            }
          }

          // Cerrar el modal
          closeCropperModal();

          showToast("Imagen recortada y guardada correctamente");
        } catch (error) {
          console.error("Error al procesar la imagen recortada:", error);
          alert(
            "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
          );
        }
      },
      "image/jpeg",
      0.8
    );
  } catch (error) {
    console.error("Error al obtener la imagen recortada:", error);
    alert(
      "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
    );
  }
}

// Funciones para el modal de recorte de imagen del restaurante (rectangular)
function openRestaurantCropperModal(file, imageInput, preview) {
  currentImageInput = imageInput;
  currentPreview = preview;
  currentPlaceholder = document.getElementById("edit-restaurant-image-placeholder");
  currentDeleteBtn = document.getElementById("edit-restaurant-delete-photo-btn");

  const cropperModal = document.getElementById("cropperModal");
  const cropperImage = document.getElementById("cropper-image");

  // Crear URL para la imagen
  const imageUrl = URL.createObjectURL(file);
  cropperImage.src = imageUrl;

  // Mostrar el modal
  cropperModal.style.display = "flex";

  // Inicializar Cropper.js después de que la imagen se cargue
  cropperImage.onload = function () {
    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(cropperImage, {
      aspectRatio: 16 / 9, // Área rectangular para banner
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 0.8,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      responsive: true,
      checkOrientation: false,
    });
  };

  // Event listeners para los botones
  setupRestaurantCropperButtons();
}

function setupRestaurantCropperButtons() {
  const cancelBtn = document.getElementById("cancel-crop-btn");
  const saveBtn = document.getElementById("save-crop-btn");

  // Remover event listeners previos
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  saveBtn.replaceWith(saveBtn.cloneNode(true));

  // Obtener las nuevas referencias
  const newCancelBtn = document.getElementById("cancel-crop-btn");
  const newSaveBtn = document.getElementById("save-crop-btn");

  newCancelBtn.addEventListener("click", closeCropperModal);
  newSaveBtn.addEventListener("click", saveRestaurantCroppedImage);
}

async function saveRestaurantCroppedImage() {
  if (!cropper) {
    alert('¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.');
    return;
  }

  try {
    // Obtener el área recortada directamente del cropper
    const canvas = cropper.getCroppedCanvas({
      width: 800,
      height: 450, // 16:9 ratio
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });

    canvas.toBlob(async (blob) => {
      try {
        // Comprimir la imagen
        const compressedFile = await compressImage(new File([blob], 'cropped-restaurant-image.jpg', { type: 'image/jpeg' }));
        compressedRestaurantImageFile = compressedFile;

        // Actualizar la vista previa
        if (currentPreview) {
          const previewUrl = URL.createObjectURL(compressedFile);
          currentPreview.src = previewUrl;
          currentPreview.style.display = 'block';
        }

        // Ocultar placeholder y mostrar botón eliminar
        if (currentPlaceholder) {
          currentPlaceholder.style.display = 'none';
        }
        
        // Mostrar botón eliminar
        const deleteBtn = document.getElementById("edit-restaurant-delete-photo-btn");
        if (deleteBtn) {
          deleteBtn.style.display = 'flex';
        }

        // Resetear flag de eliminación ya que se seleccionó una nueva imagen
        window.restaurantImageWasDeleted = false;

        // Cerrar el modal
        closeCropperModal();

        //showToast('Imagen del restaurante recortada y guardada correctamente');
        
        // 🆕 Activar auto-guardado después de confirmar el crop de la imagen
        console.log('🔄 Activando auto-guardado después de recortar imagen del restaurante');
        await handleAutoSaveRestaurant({ target: { id: 'restaurant-image-cropped' } });
      } catch (error) {
        console.error('Error al procesar la imagen recortada:', error);
        alert('¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.');
      }
    }, 'image/jpeg', 0.8);
  } catch (error) {
    console.error('Error al obtener la imagen recortada:', error);
    alert('¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.');
  }
}

// Funciones para el modal de recorte de logo del restaurante (cuadrado)
function openLogoCropperModal(file, imageInput, preview) {
  currentImageInput = imageInput;
  currentPreview = preview;
  currentPlaceholder = document.getElementById("edit-restaurant-logo-placeholder");
  currentDeleteBtn = document.getElementById("edit-restaurant-delete-logo-btn");

  const cropperModal = document.getElementById("cropperModal");
  const cropperImage = document.getElementById("cropper-image");

  // Crear URL para la imagen
  const imageUrl = URL.createObjectURL(file);
  cropperImage.src = imageUrl;

  // Mostrar el modal
  cropperModal.style.display = "flex";

  // Inicializar Cropper.js después de que la imagen se cargue
  cropperImage.onload = function () {
    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(cropperImage, {
      aspectRatio: 1, // Área cuadrada para logo
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 0.8,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      responsive: true,
      checkOrientation: false,
    });
  };

  // Event listeners para los botones
  setupLogoCropperButtons();
}

function setupLogoCropperButtons() {
  const cancelBtn = document.getElementById("cancel-crop-btn");
  const saveBtn = document.getElementById("save-crop-btn");

  // Remover event listeners previos
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  saveBtn.replaceWith(saveBtn.cloneNode(true));

  // Obtener las nuevas referencias
  const newCancelBtn = document.getElementById("cancel-crop-btn");
  const newSaveBtn = document.getElementById("save-crop-btn");

  newCancelBtn.addEventListener("click", closeCropperModal);
  newSaveBtn.addEventListener("click", saveLogoCroppedImage);
}

async function saveLogoCroppedImage() {
  if (!cropper) {
    alert('¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.');
    return;
  }

  try {
    // Obtener el área recortada directamente del cropper
    const canvas = cropper.getCroppedCanvas({
      width: 400,
      height: 400, // 1:1 ratio
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });

    canvas.toBlob(async (blob) => {
      try {
        // Comprimir la imagen
        const compressedFile = await compressImage(new File([blob], 'cropped-restaurant-logo.jpg', { type: 'image/jpeg' }));
        compressedRestaurantLogoFile = compressedFile;

        // Actualizar la vista previa
        if (currentPreview) {
          const previewUrl = URL.createObjectURL(compressedFile);
          currentPreview.src = previewUrl;
          currentPreview.style.display = 'block';
        }

        // Ocultar placeholder y mostrar botón eliminar
        if (currentPlaceholder) {
          currentPlaceholder.style.display = 'none';
        }
        
        // Mostrar botón eliminar
        const deleteBtn = document.getElementById("edit-restaurant-delete-logo-btn");
        if (deleteBtn) {
          deleteBtn.style.display = 'flex';
        }

        // Resetear flag de eliminación ya que se seleccionó una nueva imagen
        window.restaurantLogoWasDeleted = false;

        // Cerrar el modal
        closeCropperModal();

       // showToast('Logo del restaurante recortado y guardado correctamente');
        
        // 🆕 Activar auto-guardado después de confirmar el crop del logo
        console.log('🔄 Activando auto-guardado después de recortar logo del restaurante');
        await handleAutoSaveRestaurant({ target: { id: 'restaurant-logo-cropped' } });
        
        // 🆕 Activar auto-guardado después de confirmar el crop del logo
        console.log('🔄 Activando auto-guardado después de recortar logo del restaurante');
        await handleAutoSaveRestaurant({ target: { id: 'restaurant-logo-cropped' } });
      } catch (error) {
        console.error('Error al procesar el logo recortado:', error);
        alert('¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.');
      }
    }, 'image/jpeg', 0.8);
  } catch (error) {
    console.error('Error al obtener el logo recortado:', error);
    alert('¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.');
  }
}

async function tryShorten(url) {
  // Intenta TinyURL
  try {
    const r2 = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`
    );
    const t2 = await r2.text();
    if (r2.ok && t2.startsWith("http")) return t2.trim();
  } catch {}

  // Si falla CORS o el servicio, usamos el largo
  return url;
}

async function shareCardOnWhatsApp() {
  if (!currentRestaurant || !currentCardId) {
    showToast("Falta información para compartir la carta.", "warning");
    return;
  }
  try {
    const message = await buildShareMessageWithoutAllCards(
      currentRestaurant,
      currentCardId
    );
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
      message
    )}`;
    window.open(whatsappUrl, "_blank");
  } catch (e) {
    console.error("No se pudo generar el mensaje para compartir:", e);
    showToast("No se pudo generar el mensaje de WhatsApp.", "error");
  }
}

async function buildShareMessageWithoutAllCards(restaurant, cardId) {
  const name = restaurant?.name || "";

  const longUrl = `https://mvp-almuerzos-peru.vercel.app/menu.html?restaurantId=${restaurant.id}&cardId=${cardId}`;
  let link = longUrl;
  try {
    const shortUrl = await tryShorten(longUrl);
    if (shortUrl) link = shortUrl;
  } catch {}

  const yape = restaurant?.yape || "No disponible";
  const today = new Date()
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
  const todayHours = restaurant?.schedule?.[today] || {};
  const from = todayHours?.from || "—";
  const to = todayHours?.to || "—";

  let categoryName =
    typeof originalCardName === "string" && originalCardName.trim()
      ? originalCardName.trim()
      : "Almuerzos";

  if (categoryName === "Almuerzos") {
    try {
      const idToken = await currentUser.getIdToken();
      const cardsRes = await fetch(`/api/restaurants/${restaurant.id}/cards`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (cardsRes.ok) {
        const cards = await cardsRes.json();
        const currentCard = Array.isArray(cards)
          ? cards.find((c) => c.id === cardId)
          : null;
        if (currentCard?.name) categoryName = currentCard.name;
      }
    } catch (e) {
      console.warn("No se pudo obtener el nombre de la carta:", e);
    }
  }

  let dishes = [];
  try {
    const idToken = await currentUser.getIdToken();
    const dishesRes = await fetch(`/api/cards/${cardId}/dishes`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (dishesRes.ok) {
      const all = await dishesRes.json();
      dishes = Array.isArray(all) ? all.filter((d) => d?.isActive) : [];
    }
  } catch (e) {
    console.warn("No se pudieron cargar los platos de la carta:", e);
  }

  let message = `👋 ¡Hola! Hoy tenemos platos caseros recién hechos en *${name}* 🍽️\n\n`;

  if (link) {
    message += `📌 Puedes ver nuestra carta aquí: 👉 ${link}\n\n`;
  }

  message += `🍽️ *${categoryName}*\n`;

  if (!dishes || dishes.length === 0) {
    message += `❌ Actualmente no hay platos disponibles para esta categoría.\n`;
  } else {
    dishes.forEach((dish) => {
      const priceNum = Number(dish?.price);
      const priceStr = Number.isFinite(priceNum)
        ? priceNum.toFixed(2)
        : `${dish?.price ?? ""}`;
      message += `❤️ ${dish?.name ?? "Plato"} – S/ ${priceStr}\n`;
    });
  }

  message += `\n🕒 *Horario de atención (hoy):*\n${from} – ${to}\n`;
  message += `📱 *Yape:* ${yape}\n\n`;
  message += `📥 ¿Quieres separar tu plato? Escríbenos por aquí y te lo dejamos listo 🤗\n\n`;
  message += `✨ ¡Gracias por preferirnos! ¡Buen provecho! ✨`;

  return message;
}

let shareObserver = null;

function setupShareObserver() {
  const floatBtn = document.getElementById("floating-share-btn");
  const cta = document.querySelector(".whatsapp-share-button"); // botón verde

  if (!floatBtn) return;

  // Limpiar observador previo si existiera
  if (shareObserver) {
    shareObserver.disconnect();
    shareObserver = null;
  }

  // Si aún no existe el CTA (por ejemplo, estás en la vista de cartas),
  // asegúrate de ocultar el flotante.
  if (!cta) {
    floatBtn.classList.remove("is-visible");
    return;
  }

  shareObserver = new IntersectionObserver(
    ([entry]) => {
      // CTA visible -> ocultar flotante; CTA fuera -> mostrar flotante
      floatBtn.classList.toggle("is-visible", !entry.isIntersecting);
    },
    {
      root: null, // viewport de la ventana; si usas otro contenedor con scroll, cámbialo
      threshold: 0,
    }
  );

  shareObserver.observe(cta);
}

// Lanza el observador cuando el DOM está listo
document.addEventListener("DOMContentLoaded", setupShareObserver);

// Re-lánzalo cuando entras a la vista de platos
const _origShowDishes = showDishes;
showDishes = function (cardId, cardName) {
  _origShowDishes(cardId, cardName);
  // pequeño delay por si el layout aún no pintó
  requestAnimationFrame(setupShareObserver);
};

// Al volver a la lista de cartas, desconectar y ocultar
const _origShowCards = showCards;
showCards = function () {
  if (shareObserver) {
    shareObserver.disconnect();
    shareObserver = null;
  }
  const floatBtn = document.getElementById("floating-share-btn");
  if (floatBtn) floatBtn.classList.remove("is-visible");
  _origShowCards();
};




function showLogoutModal({ duration = 2400 } = {}) {
    return new Promise((resolve) => {

      const overlay = document.createElement("div");
      overlay.className = "logout-modal__overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Sesión cerrada correctamente");

      overlay.innerHTML = `
      <div class="logout-modal__card">
        <div class="logout-modal__icon" aria-hidden="true">
          <!-- Check en SVG para no depender de librerías -->
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="logout-modal__title">Sesión cerrada correctamente</div>
        <div class="logout-modal__text">Vuelve pronto 👋</div>
      </div>
    `;

      document.body.appendChild(overlay);

   
      const close = () => {
        overlay.classList.add("logout-modal--closing");
   
        const removeAfter = () => {
          overlay.remove();
          resolve();
        };
        overlay.addEventListener("animationend", removeAfter, { once: true });
      
        setTimeout(removeAfter, 350);
      };

      setTimeout(close, duration);
    });
  }


/* // Poner el nombre real del restaurante en el sidebar
window.addEventListener("DOMContentLoaded", () => {
  const mainName = document.getElementById("restaurant-name");
  const sideName = document.getElementById("sidebar-restaurant");
  if (mainName && sideName)
    sideName.textContent = mainName.textContent || "Restaurante";
});

// Función para mostrar/ocultar alerta de límite de caracteres
function showCharacterLimitAlert(show) {
  const alert = document.getElementById("character-limit-alert");
  if (alert) {
    if (show) {
      alert.style.display = "flex";
      // Agregar un pequeño delay para la animación
      setTimeout(() => {
        alert.style.opacity = "1";
      }, 10);
    } else {
      alert.style.display = "none";
      alert.style.opacity = "0";
    }
  }
}
 */
