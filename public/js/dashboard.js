const firebaseConfig = {
  apiKey: "AIzaSyDNbgT9yeSBMhsftW4FOe_SB7bfSg44CPI",
  authDomain: "cashma-8adfb.firebaseapp.com",
  projectId: "cashma-8adfb",
  storageBucket: "cashma-8adfb.appspot.com",
  messagingSenderId: "92623435008",
  appId: "1:92623435008:web:8d4b4d58c0ccb9edb5afe5",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
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
let currentPlaceholder = null;
let currentDeleteBtn = null;
function checkAuthStatus() {
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
  auth.onAuthStateChanged((user) => {
    if (user) {
      currentUser = user;
      document.getElementById("cards-section").style.display = "block";
      loadDashboardData();
    } else {
      window.location.href = "/login.html";
    }
  });
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
      `/api/restaurants/user/${currentUser.uid}`, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    }
    );
    if (!restaurantResponse.ok) {
      // Manejar errores 403 (Forbidden) específicamente
      if (restaurantResponse.status === 403) {
        console.error("Acceso denegado: El usuario no es un dueño o su token no coincide.");
        alert("No tienes los permisos necesarios para acceder al dashboard. Serás redirigido.");
        window.location.replace("/index.html"); // Redirige a la página principal
        return; // Importante para detener la ejecución
      }
      if (restaurantResponse.status === 404) {
        // Si es 404, significa que es dueño pero no tiene restaurante, redirige a registrar
        window.location.href = "/login.html?action=register";
        return;
      }
      throw new Error(`Error ${restaurantResponse.status}: ${restaurantResponse.statusText}`);
    }
    currentRestaurant = await restaurantResponse.json();
    const banner = document.getElementById("restaurant-banner");
    document.getElementById("restaurant-name").textContent =
      currentRestaurant.name;
    if (currentRestaurant.photoUrl && banner) {
      banner.style.backgroundImage = `url('${currentRestaurant.photoUrl}')`;
    } else if (banner) {
      banner.style.backgroundImage = `url('https://placehold.co/600x150/333/FFF?text=${encodeURIComponent(
        currentRestaurant.name
      )}')`;
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



async function loadRestaurantCards() {
  if (!currentRestaurant) return;
  const cardsListDiv = document.getElementById("cards-list");
  const loadingMessage = document.getElementById("loading-cards-message");
  try {
    // *** CAMBIO CRÍTICO: Enviar el ID Token ***
    const idToken = await currentUser.getIdToken();
    const cardsResponse = await fetch(
      `/api/restaurants/${currentRestaurant.id}/cards`, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    }
    );
    if (!cardsResponse.ok) {
      if (cardsResponse.status === 403) {
        showToast("Permisos insuficientes para cargar cartas.", "error");
      }
      throw new Error(`Error ${cardsResponse.status}: ${cardsResponse.statusText}`);
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
                        <div class="item-details" onclick="showDishes('${card.id}', '${card.name}')">
                            <h3  style="margin-right: 20px;">${card.name}</h3>
                            <p>Ver platos</p>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" data-id="${card.id}" class="card-toggle" ${card.isActive ? "checked" : ""}>
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
  const dishesListDiv = document.getElementById('dishes-list');
  dishesListDiv.innerHTML = '<p>Cargando platos...</p>';

  try {
    // *** CAMBIO CRÍTICO: Enviar el ID Token ***
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/cards/${cardId}/dishes`, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });
    if (!response.ok) {
      if (response.status === 403) {
        showToast("Permisos insuficientes para cargar platos.", "error");
      }
      throw new Error('Error en la respuesta del servidor al cargar platos.');
    }

    const dishes = await response.json();
    dishesListDiv.innerHTML = '';

    if (dishes.length === 0) {
      dishesListDiv.innerHTML = '<p style="text-align: center;">No hay platos en esta carta. ¡Añade uno!</p>';
    } else {
      dishes.forEach(dish => {
        const dishElement = document.createElement('div');
        dishElement.className = 'list-item dish-list-item';

        const imageUrl = dish.photoUrl || `https://placehold.co/120x120/E2E8F0/4A5568?text=${encodeURIComponent(dish.name.substring(0, 4))}`;

        dishElement.innerHTML = `
    <div class="item-details">
        <img src="${imageUrl}" alt="Foto de ${dish.name}" style="width: 60px; height: 60px; border-radius: 0.5rem; object-fit: cover; margin-right: 1rem;">
        <div>
            <h3>${dish.name}</h3>
            <p>S/. ${dish.price.toFixed(2)}</p>
            <p style="font-size: 0.85rem; color: #666;">Likes: ${dish.likesCount || 0}</p> 
        </div>
    </div>
    <button class="edit-dish-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
    </button>
    <label class="toggle-switch">
        <input type="checkbox" data-id="${dish.id}" class="dish-toggle" ${dish.isActive ? 'checked' : ''}>
        <span class="slider"></span>
    </label>
`;
        dishElement.querySelector('.edit-dish-btn').addEventListener('click', () => openEditDishModal(dish));
        dishesListDiv.appendChild(dishElement);
      });

      document.querySelectorAll('.dish-toggle').forEach(toggle => {
        toggle.addEventListener('change', handleToggleDish);
      });
    }
  } catch (error) {
    console.error("Error cargando los platos:", error);
    dishesListDiv.innerHTML = '<p style="text-align: center; color: red;">Error al cargar los platos.</p>';
  }
}


async function handleUpdateCardName() {
  if (!currentCardId) return;
  const saveButton = document.getElementById("save-card-changes-btn");
  const cardNameInput = document.getElementById("card-name-input");
  const newName = cardNameInput.value.trim();
  if (newName === originalCardName || newName === "") return;
  saveButton.disabled = !0;
  saveButton.textContent = "Guardando...";
  try {


    const idToken = await currentUser.getIdToken(); // Get token
    const response = await fetch(`/api/cards/${currentCardId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        'Authorization': `Bearer ${idToken}` // Add token
      },
      body: JSON.stringify({ name: newName }),
    });
    if (!response.ok) throw new Error("Error del servidor al actualizar.");
    originalCardName = newName;
    showToast("Nombre de la carta actualizado con éxito.");
  } catch (error) {
    console.error("Error al actualizar el nombre:", error);
    alert("No se pudieron guardar los cambios.");
    cardNameInput.value = originalCardName;
  } finally {
    saveButton.textContent = "Guardar cambios";
    saveButton.disabled = !0;
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
        'Authorization': `Bearer ${idToken}` // Add token
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
  submitButton.textContent = compressedDishImageFile ? "Subiendo imagen..." : "Guardando plato...";

  try {
    let photoUrl = "/images/default-dish.jpg.png"; // Default image path from images folder

    // Solo subir imagen si se ha seleccionado una
    if (compressedDishImageFile) {
      const imageFileName = `${Date.now()}-${compressedDishImageFile.name}`;
      const idToken = await currentUser.getIdToken();
      const storageRef = firebase
        .storage()
        .ref(`dishes/${currentRestaurant.id}/${imageFileName}`);
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
        'Authorization': `Bearer ${idToken}`
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
  try {
    await fetch(`/api/cards/${cardId}/toggle`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
  } catch (error) {
    console.error("Error al actualizar la carta:", error);
    alert("No se pudo actualizar el estado de la carta.");
    event.target.checked = !isActive;
  }
}
async function handleToggleDish(event) {
  const dishId = event.target.dataset.id;
  const isActive = event.target.checked;
  try {
    const idToken = await currentUser.getIdToken();
    await fetch(`/api/dishes/${dishId}/toggle`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        'Authorization': `Bearer ${idToken}` // Add token
      },
      body: JSON.stringify({ isActive }),
    });
  } catch (error) {
    console.error("Error al actualizar el plato:", error);
    alert("No se pudo actualizar el estado del plato.");
    event.target.checked = !isActive;
  }
}
async function handleDeleteCard() {
  if (!currentCardId) return;
  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/cards/${currentCardId}`, {
      method: "DELETE",
      headers: {
        'Authorization': `Bearer ${idToken}` // Add token
      }
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
function logout() {
  auth
    .signOut()
    .then(() => {
      console.log("Sesión cerrada correctamente.");
      window.location.replace("/");
    })
    .catch((error) => {
      console.error("Error al cerrar sesión:", error);
    });
}
window.addEventListener("pageshow", function (event) {
  if (event.persisted) {
    checkAuthStatus();
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
    cardNameInput.oninput = () => {
      if (saveButton) {
        const hasChanged = cardNameInput.value.trim() !== originalCardName;
        const isNotEmpty = cardNameInput.value.trim() !== "";
        saveButton.disabled = !hasChanged || !isNotEmpty;
      }
    };
  }
  if (saveButton) {
    saveButton.disabled = !0;
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
  if (cardNameInput) cardNameInput.oninput = null;
  if (saveButton) saveButton.onclick = null;
  loadRestaurantCards();
}
let currentlyOpenModal = null;
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "flex";
    currentlyOpenModal = modal;

    // Limpiar estado de imagen del plato cuando se abra el modal "Nuevo plato"
    if (modalId === "newDishModal") {
      clearDishImageState();
    }
  }
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
  const imageInput = document.getElementById("dish-image-input");
  const cameraInput = document.getElementById("camera-input");
  const galleryInput = document.getElementById("gallery-input");
  const cameraBtn = document.getElementById("camera-btn");
  const galleryBtn = document.getElementById("gallery-btn");
  const newDeleteBtn = document.getElementById("new-delete-photo-btn");
  
  // Configuración para modal de nuevo plato
  imageInput.addEventListener("change", handleImageSelection);
  cameraInput.addEventListener("change", handleImageSelection);
  galleryInput.addEventListener("change", handleImageSelection);
  
  // Configurar botón eliminar para modal de nuevo plato
  if (newDeleteBtn) {
    newDeleteBtn.addEventListener("click", handleDeleteNewPhoto);
  }
  
  if (cameraBtn) {
    cameraBtn.addEventListener("click", () => {
      openCameraCapture();
    });
  }
  
  if (galleryBtn) {
    galleryBtn.addEventListener("click", () => {
      galleryInput.click();
    });
  }
  
  // Configuración para modal de editar plato
  const editCameraInput = document.getElementById("edit-camera-input");
  const editGalleryInput = document.getElementById("edit-gallery-input");
  const editCameraBtn = document.getElementById("edit-camera-btn");
  const editGalleryBtn = document.getElementById("edit-gallery-btn");
  
  if (editCameraInput) {
    editCameraInput.addEventListener("change", handleEditImageSelection);
  }
  
  if (editGalleryInput) {
    editGalleryInput.addEventListener("change", handleEditImageSelection);
  }
  
  if (editCameraBtn) {
    editCameraBtn.addEventListener("click", () => {
      openCameraCapture(true);
    });
  }
  
  if (editGalleryBtn) {
    editGalleryBtn.addEventListener("click", () => {
      editGalleryInput.click();
    });
  }
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
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const blockedTypes = ['image/avif', 'image/heic', 'image/heif'];

  // Verificar si el tipo está explícitamente bloqueado
  if (blockedTypes.includes(file.type.toLowerCase())) {
    showModalAlert('Solo se permite subir fotos');
    return false;
  }

  // Verificar si el tipo está en la lista de permitidos
  if (!allowedTypes.includes(file.type.toLowerCase())) {
    showModalAlert('Solo se permite subir fotos');
    return false;
  }

  return true;
}

// Función para abrir la captura de cámara
async function openCameraCapture(isEditMode = false) {
  try {
    // Verificar si el navegador soporta getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Parece que no pudimos acceder a tu cámara. Revisa los permisos del navegador.');
      return;
    }

    // Solicitar acceso a la cámara
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Preferir cámara trasera en móviles
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    // Crear el modal de cámara
    createCameraModal(stream, isEditMode);

  } catch (error) {
    console.error('Error al acceder a la cámara:', error);
    
    if (error.name === 'NotAllowedError') {
      alert('Parece que no pudimos acceder a tu cámara. Revisa los permisos del navegador.');
    } else if (error.name === 'NotFoundError') {
      alert('Parece que no pudimos acceder a tu cámara. Revisa los permisos del navegador.');
    } else if (error.name === 'NotReadableError') {
      alert('Parece que no pudimos acceder a tu cámara. Revisa los permisos del navegador.');
    } else {
      alert('Parece que no pudimos acceder a tu cámara. Revisa los permisos del navegador.');
    }
  }
}

// Función para crear el modal de cámara
function createCameraModal(stream, isEditMode = false) {
  // Crear el modal
  const modal = document.createElement('div');
  modal.id = 'camera-modal';
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
  const videoContainer = document.createElement('div');
  videoContainer.style.cssText = `
    position: relative;
    max-width: 90vw;
    max-height: 70vh;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
  `;

  // Crear el elemento video
  const video = document.createElement('video');
  video.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
  `;
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;

  // Crear los controles
  const controls = document.createElement('div');
  controls.style.cssText = `
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 20px;
  `;

  // Botón de captura
  const captureBtn = document.createElement('button');
  captureBtn.innerHTML = '📸 Tomar Foto';
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
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '❌ Cerrar';
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
  captureBtn.addEventListener('click', () => {
    capturePhoto(video, stream, modal, isEditMode);
  });

  closeBtn.addEventListener('click', () => {
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
function capturePhoto(video, stream, modal, isEditMode = false) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  // Establecer las dimensiones del canvas
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Dibujar el frame actual del video en el canvas
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Convertir a blob
  canvas.toBlob((blob) => {
    if (blob) {
      // Crear un archivo desde el blob
      const file = new File([blob], `camera-photo-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });
      
      // Procesar la imagen capturada
      if (isEditMode) {
        processEditCapturedImage(file);
      } else {
        processCapturedImage(file);
      }
      
      // Cerrar el modal
      closeCameraModal(stream, modal);
    }
  }, 'image/jpeg', 0.9);
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
      showModalAlert(`La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`);
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
    alert("¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.");
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
      showModalAlert(`La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`);
      return;
    }

    const preview = document.getElementById("edit-dish-image-preview");
    const placeholder = document.getElementById("edit-image-upload-placeholder");
    const editCameraInput = document.getElementById("edit-camera-input");
    
    // Simular la selección de archivo
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    editCameraInput.files = dataTransfer.files;
    
    // Abrir el modal de recorte
    openCropperModal(file, editCameraInput, preview, placeholder);

  } catch (error) {
    console.error("Error al procesar la imagen capturada:", error);
    alert("¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.");
  }
}

// Función para cerrar el modal de cámara
function closeCameraModal(stream, modal) {
  // Detener el stream de video
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
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
      showModalAlert(`La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`);
      event.target.value = "";
      return;
    }

    // Abrir el modal de recorte pasando el botón eliminar
    openCropperModal(file, event.target, preview, placeholder, deleteBtn);

  } catch (error) {
    console.error("Error al procesar la imagen:", error);
    alert("¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.");
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
      showModalAlert(`La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`);
      event.target.value = "";
      return;
    }

    // Abrir el modal de recorte
    openCropperModal(file, event.target, preview, placeholder, deleteBtn);

  } catch (error) {
    console.error("Error al procesar la imagen:", error);
    alert("¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.");
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
function handleDeleteRestaurantPhoto() {
  const preview = document.getElementById("edit-restaurant-image-preview");
  const input = document.getElementById("edit-restaurant-image-input");
  const deleteBtn = document.getElementById("edit-restaurant-delete-photo-btn");
  
  // Establecer imagen por defecto
  preview.src = "https://placehold.co/120x120/E2E8F0/4A5568?text=Local";
  
  // Limpiar input de archivo
  input.value = "";
  
  // Ocultar botón eliminar
  if (deleteBtn) {
    deleteBtn.style.display = "none";
  }
  
  // Limpiar archivo comprimido si existe
  compressedRestaurantImageFile = null;
  
  // Marcar que la imagen fue eliminada
  window.restaurantImageWasDeleted = true;
}

// Función para eliminar el logo del restaurante
function handleDeleteRestaurantLogo() {
  const preview = document.getElementById("edit-restaurant-logo-preview");
  const input = document.getElementById("edit-restaurant-logo-input");
  const deleteBtn = document.getElementById("edit-restaurant-delete-logo-btn");
  
  // Establecer logo por defecto
  preview.src = "https://placehold.co/120x120/E2E8F0/4A5568?text=Logo";
  
  // Limpiar input de archivo
  input.value = "";
  
  // Ocultar botón eliminar
  if (deleteBtn) {
    deleteBtn.style.display = "none";
  }
  
  // Limpiar archivo comprimido si existe
  compressedRestaurantLogoFile = null;
  
  // Marcar que el logo fue eliminado
  window.restaurantLogoWasDeleted = true;
}

async function compressImage(file, quality = 0.7, maxWidth = 800) {
  try {
    // Configuración para browser-image-compression
    const options = {
      maxSizeMB: 3, // Garantizar que el archivo final sea menor a 3MB
      maxWidthOrHeight: maxWidth, // Mantener el ancho máximo
      useWebWorker: true, // Usar Web Workers para mejor rendimiento
      fileType: 'image/jpeg', // Convertir a JPEG
      initialQuality: quality // Calidad inicial
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
        fileType: 'image/jpeg',
        initialQuality: 0.6
      };
      return await imageCompression(file, aggressiveOptions);
    }
    
    return compressedFile;
  } catch (error) {
    console.error('Error al comprimir imagen:', error);
    throw new Error('¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.');
  }
}
function openEditRestaurantModal() {
  if (!currentRestaurant) return;

  // Campos básicos
  document.getElementById("edit-restaurant-name").value = currentRestaurant.name;
  document.getElementById("edit-restaurant-description").value = currentRestaurant.description;
  document.getElementById("edit-restaurant-district").value = currentRestaurant.district;
  document.getElementById("edit-restaurant-whatsapp").value = currentRestaurant.whatsapp;
  document.getElementById("edit-restaurant-image-preview").src = currentRestaurant.photoUrl || `https://placehold.co/120x120/E2E8F0/4A5568?text=Local`;
  document.getElementById("edit-restaurant-logo-preview").src = currentRestaurant.logoUrl || `https://placehold.co/120x120/E2E8F0/4A5568?text=Logo`;

  // Resetear flags de eliminación
  window.restaurantImageWasDeleted = false;
  window.restaurantLogoWasDeleted = false;

  // Configurar event listeners para los botones de eliminar
  const deletePhotoBtn = document.getElementById("edit-restaurant-delete-photo-btn");
  const deleteLogoBtn = document.getElementById("edit-restaurant-delete-logo-btn");
  
  if (deletePhotoBtn) {
    deletePhotoBtn.onclick = handleDeleteRestaurantPhoto;
    // Mostrar botón eliminar solo si hay imagen
    deletePhotoBtn.style.display = currentRestaurant.photoUrl ? "flex" : "none";
  }
  
  if (deleteLogoBtn) {
    deleteLogoBtn.onclick = handleDeleteRestaurantLogo;
    // Mostrar botón eliminar solo si hay logo
    deleteLogoBtn.style.display = currentRestaurant.logoUrl ? "flex" : "none";
  }

  // Nuevos campos
  document.getElementById("edit-restaurant-ruc").value = currentRestaurant.ruc || "";
  document.getElementById("edit-restaurant-yape").value = currentRestaurant.yape || "";
  document.getElementById("edit-restaurant-phone").value = currentRestaurant.phone || "";
  document.getElementById("edit-restaurant-location").value = currentRestaurant.location || "";
  document.getElementById("edit-restaurant-delivery").checked = currentRestaurant.hasDelivery || false;
  document.getElementById("edit-restaurant-localService").checked = currentRestaurant.hasLocalService || false;

  // Horarios
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  days.forEach(day => {
    if (currentRestaurant.schedule && currentRestaurant.schedule[day]) {
      document.getElementById(`edit-${day}-from`).value = currentRestaurant.schedule[day].from || "";
      document.getElementById(`edit-${day}-to`).value = currentRestaurant.schedule[day].to || "";
    }
  });

  compressedRestaurantImageFile = null;
  document.getElementById("edit-restaurant-image-input").value = "";
  openModal("editRestaurantModal");
}
function syncScheduleWithMonday() {
  const mondayFromValue = document.getElementById('edit-monday-from').value;
  const mondayToValue = document.getElementById('edit-monday-to').value;

  if (!mondayFromValue || !mondayToValue) {
    alert('Por favor, completa primero el horario del Lunes');
    return;
  }

  const days = ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  days.forEach(day => {
    document.getElementById(`edit-${day}-from`).value = mondayFromValue;
    document.getElementById(`edit-${day}-to`).value = mondayToValue;
  });
}

function setupEditRestaurantImageUploader() {
  // Configurar el uploader de la imagen del local
  const imageInput = document.getElementById("edit-restaurant-image-input");
  const imageBox = document.getElementById("edit-restaurant-image-box");
  const preview = document.getElementById("edit-restaurant-image-preview");
  if (imageInput && imageBox && preview) {
    imageInput.addEventListener("change", handleRestaurantImageSelection);
  }

  // Configurar el uploader del logo
  const logoInput = document.getElementById("edit-restaurant-logo-input");
  const logoBox = document.getElementById("edit-restaurant-logo-box");
  const logoPreview = document.getElementById("edit-restaurant-logo-preview");
  if (logoInput && logoBox && logoPreview) {
    logoInput.addEventListener("change", handleRestaurantLogoSelection);
  }
}
async function handleUpdateRestaurant(event) {
  event.preventDefault();
  if (!currentRestaurant) return;
  const form = event.target;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = !0;
  submitButton.textContent = "Guardando...";
  let photoUrl = currentRestaurant.photoUrl;
  let logoUrl = currentRestaurant.logoUrl;

  try {
    // Manejar imagen del restaurante
    if (compressedRestaurantImageFile) {
      submitButton.textContent = "Subiendo imagen del local...";
      const imageFileName = `local-${Date.now()}-${compressedRestaurantImageFile.name}`;
      const storageRef = firebase
        .storage()
        .ref(`restaurants/${currentRestaurant.id}/${imageFileName}`);
      const uploadTask = await storageRef.put(compressedRestaurantImageFile);
      photoUrl = await uploadTask.ref.getDownloadURL();
    } else if (window.restaurantImageWasDeleted) {
      // Si la imagen fue eliminada, usar imagen por defecto
      photoUrl = "https://placehold.co/120x120/E2E8F0/4A5568?text=Local";
    }

    // Manejar logo del restaurante
    if (compressedRestaurantLogoFile) {
      submitButton.textContent = "Subiendo logo...";
      const logoFileName = `logo-${Date.now()}-${compressedRestaurantLogoFile.name}`;
      const logoStorageRef = firebase
        .storage()
        .ref(`restaurants/${currentRestaurant.id}/${logoFileName}`);
      const uploadLogoTask = await logoStorageRef.put(compressedRestaurantLogoFile);
      logoUrl = await uploadLogoTask.ref.getDownloadURL();
    } else if (window.restaurantLogoWasDeleted) {
      // Si el logo fue eliminado, usar logo por defecto
      logoUrl = "https://placehold.co/120x120/E2E8F0/4A5568?text=Logo";
    }
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const schedule = {};
    days.forEach(day => {
      schedule[day] = {
        from: form.elements[`${day}From`].value,
        to: form.elements[`${day}To`].value
      };
    });

    const updatedData = {
      name: form.elements.restaurantName.value,
      description: form.elements.restaurantDescription.value,
      district: form.elements.restaurantDistrict.value,
      whatsapp: form.elements.restaurantWhatsapp.value,
      photoUrl: photoUrl,
      logoUrl: logoUrl,
      ruc: form.elements.restaurantRuc.value,
      yape: form.elements.restaurantYape.value,
      phone: form.elements.restaurantPhone.value,
      location: form.elements.restaurantLocation.value,
      hasDelivery: form.elements.restaurantDelivery.checked,
      hasLocalService: form.elements.restaurantLocalService.checked,
      schedule: schedule
    }; 
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/restaurants/${currentRestaurant.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        'Authorization': `Bearer ${idToken}` // Add token
      },
      body: JSON.stringify(updatedData),
    });
    if (!response.ok) throw new Error("Error al actualizar el restaurante.");
    closeModal(null, "editRestaurantModal");
    showToast("Restaurante actualizado con éxito.");
    await loadDashboardData();
  } catch (error) {
    console.error("Error al actualizar el restaurante:", error);
    alert("No se pudieron guardar los cambios.");
  } finally {
    submitButton.disabled = !1;
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
        'Authorization': `Bearer ${idToken}` // Add token
      }
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
      const storageRef = firebase
        .storage()
        .ref(`dishes/${currentRestaurant.id}/${imageFileName}`);
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
        'Authorization': `Bearer ${idToken}` // Enviar el token al servidor
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
function showToast(message) {
  const toast = document.getElementById("toast-notification");
  const toastMessage = document.getElementById("toast-message");
  if (!toast || !toastMessage) return;
  toastMessage.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Función para mostrar alertas dentro del modal activo
function showModalAlert(message, type = 'error') {
  // Buscar el modal activo
  const activeModal = document.querySelector('.modal-backdrop[style*="flex"], .modal-backdrop[style*="block"]');

  if (activeModal) {
    // Remover alerta anterior si existe
    const existingAlert = activeModal.querySelector('.modal-alert');
    if (existingAlert) {
      existingAlert.remove();
    }

    // Crear el contenedor de alerta
    const alertContainer = document.createElement('div');
    alertContainer.className = 'modal-alert';
    alertContainer.style.cssText = `
      background-color: ${type === 'error' ? '#ef4444' : '#10b981'};
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

    // Buscar dónde insertar la alerta (entre imagen y nombre)
    const modalContent = activeModal.querySelector('.modal-content');
    if (modalContent) {
      const form = modalContent.querySelector('form');
      if (form) {
        const formGroups = form.querySelectorAll('.modal-form-group');
        if (formGroups.length >= 2) {
          // Insertar entre el primer grupo (imagen) y el segundo grupo (nombre)
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
      alertContainer.style.opacity = '1';
    }, 10);

    // Ocultar la alerta después de 4 segundos
    setTimeout(() => {
      alertContainer.style.opacity = '0';
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
      showModalAlert(`La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`);
      event.target.value = "";
      return;
    }

    // Abrir el modal de recorte rectangular para restaurante
    openRestaurantCropperModal(file, event.target, preview);

  } catch (error) {
    console.error("Error al procesar la imagen:", error);
    alert("¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.");
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
      showModalAlert(`La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`);
      event.target.value = "";
      return;
    }

    // Abrir el modal de recorte cuadrado para logo
    openLogoCropperModal(file, event.target, preview);

  } catch (error) {
    console.error("Error al procesar el logo:", error);
    alert("¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.");
    event.target.value = "";
  }
}

// Funciones para el modal de recorte de imagen de platos
function openCropperModal(file, imageInput, preview, placeholder, deleteBtn = null) {
  currentImageInput = imageInput;
  currentPreview = preview;
  currentPlaceholder = placeholder;
  currentDeleteBtn = deleteBtn;

  const cropperModal = document.getElementById('cropperModal');
  const cropperImage = document.getElementById('cropper-image');

  // Crear URL para la imagen
  const imageUrl = URL.createObjectURL(file);
  cropperImage.src = imageUrl;

  // Mostrar el modal
  cropperModal.style.display = 'flex';

  // Inicializar Cropper.js después de que la imagen se cargue
  cropperImage.onload = function () {
    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(cropperImage, {
      aspectRatio: 1, // Área cuadrada
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.8,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      responsive: true,
      checkOrientation: false
    });
  };

  // Event listeners para los botones
  setupCropperButtons();
}

function setupCropperButtons() {
  const cancelBtn = document.getElementById('cancel-crop-btn');
  const saveBtn = document.getElementById('save-crop-btn');

  // Remover event listeners previos
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  saveBtn.replaceWith(saveBtn.cloneNode(true));

  // Obtener las nuevas referencias
  const newCancelBtn = document.getElementById('cancel-crop-btn');
  const newSaveBtn = document.getElementById('save-crop-btn');

  newCancelBtn.addEventListener('click', closeCropperModal);
  newSaveBtn.addEventListener('click', saveCroppedImage);
}

function closeCropperModal() {
  const cropperModal = document.getElementById('cropperModal');
  cropperModal.style.display = 'none';

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  // Limpiar el input
  if (currentImageInput) {
    currentImageInput.value = '';
  }

  // Limpiar variables
  currentImageInput = null;
  currentPreview = null;
  currentPlaceholder = null;
  currentDeleteBtn = null;
}



async function saveCroppedImage() {
  if (!cropper) {
    alert('¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.');
    return;
  }

  try {
    // Obtener el área recortada directamente del cropper
    const canvas = cropper.getCroppedCanvas({
      width: 400,
      height: 400,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });

    canvas.toBlob(async (blob) => {
      try {
        // Comprimir la imagen
        const compressedFile = await compressImage(new File([blob], 'cropped-image.jpg', { type: 'image/jpeg' }));
        compressedDishImageFile = compressedFile;

        // Actualizar la vista previa
        if (currentPreview) {
          const previewUrl = URL.createObjectURL(compressedFile);
          currentPreview.src = previewUrl;
          
          // Detectar si es el modal de editar plato por el ID del preview
          const isEditModal = currentPreview.id === 'edit-dish-image-preview';
          
          if (isEditModal) {
            // Para el modal de editar plato, mostrar el contenedor de imagen
            const imageContainer = document.getElementById('edit-image-container');
            if (imageContainer) {
              imageContainer.style.display = 'block';
            }
            if (currentPlaceholder) {
              currentPlaceholder.style.display = 'none';
            }
            // Resetear el estado de eliminación ya que se seleccionó una nueva imagen
            window.imageWasDeleted = false;
          } else {
            // Para el modal de nuevo plato
            currentPreview.style.display = 'block';
            if (currentPlaceholder) {
              currentPlaceholder.style.display = 'none';
            }
          }
          
          // Mostrar botón eliminar en ambos modales
          if (currentDeleteBtn) {
            currentDeleteBtn.style.display = 'flex';
          }
        }

        // Cerrar el modal
        closeCropperModal();

        showToast('Imagen recortada y guardada correctamente');
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

// Funciones para el modal de recorte de imagen del restaurante (rectangular)
function openRestaurantCropperModal(file, imageInput, preview) {
  currentImageInput = imageInput;
  currentPreview = preview;
  currentPlaceholder = null; // No hay placeholder para imagen de restaurante

  const cropperModal = document.getElementById('cropperModal');
  const cropperImage = document.getElementById('cropper-image');

  // Crear URL para la imagen
  const imageUrl = URL.createObjectURL(file);
  cropperImage.src = imageUrl;

  // Mostrar el modal
  cropperModal.style.display = 'flex';

  // Inicializar Cropper.js después de que la imagen se cargue
  cropperImage.onload = function () {
    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(cropperImage, {
      aspectRatio: 16 / 9, // Área rectangular para banner
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.8,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      responsive: true,
      checkOrientation: false
    });
  };

  // Event listeners para los botones
  setupRestaurantCropperButtons();
}

function setupRestaurantCropperButtons() {
  const cancelBtn = document.getElementById('cancel-crop-btn');
  const saveBtn = document.getElementById('save-crop-btn');

  // Remover event listeners previos
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  saveBtn.replaceWith(saveBtn.cloneNode(true));

  // Obtener las nuevas referencias
  const newCancelBtn = document.getElementById('cancel-crop-btn');
  const newSaveBtn = document.getElementById('save-crop-btn');

  newCancelBtn.addEventListener('click', closeCropperModal);
  newSaveBtn.addEventListener('click', saveRestaurantCroppedImage);
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

        // Mostrar botón eliminar para imagen del restaurante
        const deletePhotoBtn = document.getElementById('edit-restaurant-delete-photo-btn');
        if (deletePhotoBtn) {
          deletePhotoBtn.style.display = 'flex';
        }

        // Cerrar el modal
        closeCropperModal();

        showToast('Imagen del restaurante recortada y guardada correctamente');
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
  currentPlaceholder = null; // No hay placeholder para logo de restaurante

  const cropperModal = document.getElementById('cropperModal');
  const cropperImage = document.getElementById('cropper-image');

  // Crear URL para la imagen
  const imageUrl = URL.createObjectURL(file);
  cropperImage.src = imageUrl;

  // Mostrar el modal
  cropperModal.style.display = 'flex';

  // Inicializar Cropper.js después de que la imagen se cargue
  cropperImage.onload = function () {
    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(cropperImage, {
      aspectRatio: 1, // Área cuadrada para logo
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.8,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      responsive: true,
      checkOrientation: false
    });
  };

  // Event listeners para los botones
  setupLogoCropperButtons();
}

function setupLogoCropperButtons() {
  const cancelBtn = document.getElementById('cancel-crop-btn');
  const saveBtn = document.getElementById('save-crop-btn');

  // Remover event listeners previos
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  saveBtn.replaceWith(saveBtn.cloneNode(true));

  // Obtener las nuevas referencias
  const newCancelBtn = document.getElementById('cancel-crop-btn');
  const newSaveBtn = document.getElementById('save-crop-btn');

  newCancelBtn.addEventListener('click', closeCropperModal);
  newSaveBtn.addEventListener('click', saveLogoCroppedImage);
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

        // Mostrar botón eliminar para logo del restaurante
        const deleteLogoBtn = document.getElementById('edit-restaurant-delete-logo-btn');
        if (deleteLogoBtn) {
          deleteLogoBtn.style.display = 'flex';
        }

        // Cerrar el modal
        closeCropperModal();

        showToast('Logo del restaurante recortado y guardado correctamente');
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
    const r2 = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
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
    const message = await buildShareMessageWithoutAllCards(currentRestaurant, currentCardId);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  } catch (e) {
    console.error("No se pudo generar el mensaje para compartir:", e);
    showToast("No se pudo generar el mensaje de WhatsApp.", "error");
  }
}


async function buildShareMessageWithoutAllCards(restaurant, cardId) {
  const name = restaurant?.name || "";


  const longUrl =
    `https://mvp-almuerzos-peru.vercel.app/menu.html?restaurantId=${restaurant.id}&cardId=${cardId}`;
  let link = longUrl;
  try {
    const shortUrl = await tryShorten(longUrl);
    if (shortUrl) link = shortUrl;
  } catch { }

  
  const yape = restaurant?.yape || "No disponible";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const todayHours = restaurant?.schedule?.[today] || {};
  const from = todayHours?.from || "—";
  const to   = todayHours?.to   || "—";


  let categoryName = (typeof originalCardName === "string" && originalCardName.trim())
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
        const currentCard = Array.isArray(cards) ? cards.find(c => c.id === cardId) : null;
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
      dishes = Array.isArray(all) ? all.filter(d => d?.isActive) : [];
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
      const priceStr = Number.isFinite(priceNum) ? priceNum.toFixed(2) : `${dish?.price ?? ""}`;
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
  const floatBtn = document.getElementById('floating-share-btn');
  const cta = document.querySelector('.whatsapp-share-button'); // botón verde

  if (!floatBtn) return;

  // Limpiar observador previo si existiera
  if (shareObserver) {
    shareObserver.disconnect();
    shareObserver = null;
  }

  // Si aún no existe el CTA (por ejemplo, estás en la vista de cartas),
  // asegúrate de ocultar el flotante.
  if (!cta) {
    floatBtn.classList.remove('is-visible');
    return;
  }

  shareObserver = new IntersectionObserver(([entry]) => {
    // CTA visible -> ocultar flotante; CTA fuera -> mostrar flotante
    floatBtn.classList.toggle('is-visible', !entry.isIntersecting);
  }, {
    root: null,     // viewport de la ventana; si usas otro contenedor con scroll, cámbialo
    threshold: 0
  });

  shareObserver.observe(cta);
}

// Lanza el observador cuando el DOM está listo
document.addEventListener('DOMContentLoaded', setupShareObserver);

// Re-lánzalo cuando entras a la vista de platos
const _origShowDishes = showDishes;
showDishes = function(cardId, cardName) {
  _origShowDishes(cardId, cardName);
  // pequeño delay por si el layout aún no pintó
  requestAnimationFrame(setupShareObserver);
};

// Al volver a la lista de cartas, desconectar y ocultar
const _origShowCards = showCards;
showCards = function() {
  if (shareObserver) {
    shareObserver.disconnect();
    shareObserver = null;
  }
  const floatBtn = document.getElementById('floating-share-btn');
  if (floatBtn) floatBtn.classList.remove('is-visible');
  _origShowCards();
};
