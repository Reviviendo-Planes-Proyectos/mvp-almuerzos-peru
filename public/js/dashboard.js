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
let editingDish = null;
let originalCardName = "";
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
                
                const imageUrl = dish.photoUrl || `https://placehold.co/120x120/E2E8F0/4A5568?text=${encodeURIComponent(dish.name.substring(0,4))}`;

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
  if (!compressedDishImageFile) {
    alert("Por favor, selecciona una imagen para el plato.");
    return;
  }
  const form = event.target;
  const dishName = form.elements.dishName.value;
  const dishPrice = form.elements.dishPrice.value;
  const submitButton = form.querySelector('button[type="submit"]');
  if (!dishName.trim() || !dishPrice.trim()) return;
  submitButton.disabled = !0;
  submitButton.textContent = "Subiendo imagen...";
  try {
    const imageFileName = `${Date.now()}-${compressedDishImageFile.name}`;
    const idToken = await currentUser.getIdToken(); 
    const storageRef = firebase
      .storage()
      .ref(`dishes/${currentRestaurant.id}/${imageFileName}`);
    const uploadTask = await storageRef.put(compressedDishImageFile);
    const photoUrl = await uploadTask.ref.getDownloadURL();
    submitButton.textContent = "Guardando plato...";
    const dishData = {
      cardId: currentCardId,
      name: dishName,
      price: dishPrice,
      photoUrl: photoUrl,
    };


     const response = await fetch("/api/dishes", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                'Authorization': `Bearer ${idToken}` // Add token
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
    alert(`Ocurrió un error: ${error.message}`);
  } finally {
    submitButton.disabled = !1;
    submitButton.textContent = "Agregar plato";
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
  }
}
function setupImageUploader() {
  const imageInput = document.getElementById("dish-image-input");
  imageInput.addEventListener("change", handleImageSelection);
}
async function handleImageSelection(event) {
  const preview = document.getElementById("dish-image-preview");
  const placeholder = document.getElementById("image-upload-placeholder");
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    alert("La imagen es demasiado grande. Elige una de menos de 3MB.");
    event.target.value = "";
    return;
  }
  try {
    const compressedFile = await compressImage(file);
    compressedDishImageFile = compressedFile;
    const previewUrl = URL.createObjectURL(compressedFile);
    preview.src = previewUrl;
    preview.style.display = "block";
    placeholder.style.display = "none";
  } catch (error) {
    console.error("Error al comprimir la imagen:", error);
    alert("Hubo un error al procesar la imagen.");
    event.target.value = "";
  }
}
function compressImage(file, quality = 0.7, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(
                new File([blob], file.name, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                })
              );
            } else {
              reject(new Error("Error al crear el blob de la imagen."));
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}
function openEditRestaurantModal() {
  if (!currentRestaurant) return;
  document.getElementById("edit-restaurant-name").value =
    currentRestaurant.name;
  document.getElementById("edit-restaurant-description").value =
    currentRestaurant.description;
  document.getElementById("edit-restaurant-district").value =
    currentRestaurant.district;
  document.getElementById("edit-restaurant-whatsapp").value =
    currentRestaurant.whatsapp;
  document.getElementById("edit-restaurant-image-preview").src =
    currentRestaurant.photoUrl ||
    `https://placehold.co/120x120/E2E8F0/4A5568?text=Local`;
  compressedRestaurantImageFile = null;
  document.getElementById("edit-restaurant-image-input").value = "";
  openModal("editRestaurantModal");
}
function setupEditRestaurantImageUploader() {
  const imageInput = document.getElementById("edit-restaurant-image-input");
  const imageBox = document.getElementById("edit-restaurant-image-box");
  const preview = document.getElementById("edit-restaurant-image-preview");
  if (!imageInput || !imageBox || !preview) return;
  imageInput.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("La imagen es demasiado grande (máx 3MB).");
      return;
    }
    compressImage(file).then((compressedFile) => {
      compressedRestaurantImageFile = compressedFile;
      preview.src = URL.createObjectURL(compressedFile);
    });
  };
}
async function handleUpdateRestaurant(event) {
  event.preventDefault();
  if (!currentRestaurant) return;
  const form = event.target;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = !0;
  submitButton.textContent = "Guardando...";
  let photoUrl = currentRestaurant.photoUrl;
  try {
    if (compressedRestaurantImageFile) {
      submitButton.textContent = "Subiendo imagen...";
      const imageFileName = `logo-${Date.now()}-${
        compressedRestaurantImageFile.name
      }`;
      const storageRef = firebase
        .storage()
        .ref(`restaurants/${currentRestaurant.id}/${imageFileName}`);
      const uploadTask = await storageRef.put(compressedRestaurantImageFile);
      photoUrl = await uploadTask.ref.getDownloadURL();
    }
    const updatedData = {
      name: form.elements.restaurantName.value,
      description: form.elements.restaurantDescription.value,
      district: form.elements.restaurantDistrict.value,
      whatsapp: form.elements.restaurantWhatsapp.value,
      photoUrl: photoUrl,
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
  preview.src =
    dish.photoUrl || `https://placehold.co/120x120/E2E8F0/4A5568?text=Img`;
  compressedDishImageFile = null;
  document.getElementById("edit-dish-image-input").value = "";
  editImageInput.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("La imagen es demasiado grande (máx 3MB).");
      return;
    }
    compressImage(file).then((compressedFile) => {
      compressedDishImageFile = compressedFile;
      preview.src = URL.createObjectURL(compressedFile);
    });
  };
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
