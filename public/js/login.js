// --- 1. CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE ---
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
const googleProvider = new firebase.auth.GoogleAuthProvider();
const db = firebase.firestore();
const storage = firebase.storage();

// --- 2. VARIABLES GLOBALES DE ESTADO ---
let currentUser = null;
let compressedRegistrationImageFile = null;
let compressedLogoImageFile = null;

// --- 3. FUNCIONES AUXILIARES DE UI (TOASTS, PANTALLAS, REDIRECCIÓN) ---

// Función para validar tipos de archivo de imagen
function validateFileType(file) {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const blockedTypes = ['image/avif', 'image/heic', 'image/heif'];

  // Verificar si el tipo está explícitamente bloqueado
  if (blockedTypes.includes(file.type.toLowerCase())) {
    alert('Los archivos AVIF, HEIC y HEIF no están soportados. Solo se permiten archivos JPEG, PNG y WebP');
    return false;
  }

  // Verificar si el tipo está en la lista de permitidos
  if (!allowedTypes.includes(file.type.toLowerCase())) {
    alert('Solo se permiten archivos JPEG, PNG y WebP');
    return false;
  }

  return true;
}

// Función para sincronizar horarios con el lunes
function syncScheduleWithMonday() {
  const mondayFromInput = document.querySelector('input[name="mondayFrom"]');
  const mondayToInput = document.querySelector('input[name="mondayTo"]');

  if (!mondayFromInput.value || !mondayToInput.value) {
    alert('Por favor, primero establece el horario del día Lunes');
    return;
  }

  const days = ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const mondayFrom = mondayFromInput.value;
  const mondayTo = mondayToInput.value;

  days.forEach(day => {
    const fromInput = document.querySelector(`input[name="${day}From"]`);
    const toInput = document.querySelector(`input[name="${day}To"]`);

    fromInput.value = mondayFrom;
    toInput.value = mondayTo;
  });

  // Mostrar feedback visual
  const syncButton = document.querySelector('.sync-button');
  const originalText = syncButton.innerHTML;
  syncButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
    ¡Sincronizado!
  `;
  syncButton.style.backgroundColor = '#10b981';
  syncButton.style.borderColor = '#059669';
  syncButton.style.color = 'white';

  setTimeout(() => {
    syncButton.innerHTML = originalText;
    syncButton.style.backgroundColor = '';
    syncButton.style.borderColor = '';
    syncButton.style.color = '';
  }, 2000);
}

// Función para manejar la previsualización de imágenes
async function handleImagePreview(file, previewId, placeholderId, deleteBtnId = null) {
  if (file) {
    const reader = new FileReader();
    const preview = document.getElementById(previewId);
    const placeholder = document.getElementById(placeholderId);
    const deleteBtn = deleteBtnId ? document.getElementById(deleteBtnId) : null;

    reader.onload = function (e) {
      preview.src = e.target.result;
      preview.style.display = "block";
      placeholder.style.display = "none";
      
      // Mostrar botón eliminar si existe
      if (deleteBtn) {
        deleteBtn.style.display = 'flex';
      }
    };

    reader.readAsDataURL(file);
  }
}

// Función para comprimir imágenes
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = function (e) {
      const img = new Image();
      img.src = e.target.result;

      img.onload = function () {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Si la imagen es más grande que 800x800, redimensionarla
        const MAX_SIZE = 800;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round(height * MAX_SIZE / width);
            width = MAX_SIZE;
          } else {
            width = Math.round(width * MAX_SIZE / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a blob
        canvas.toBlob((blob) => {
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressedFile);
        }, 'image/jpeg', 0.7); // 0.7 es la calidad de compresión
      };
    };

    reader.onerror = reject;
  });
}

// Event listeners para las imágenes
document.getElementById("register-logo-input")?.addEventListener("change", async function (e) {
  const file = e.target.files[0];
  if (file) {
    try {
      // Validar tipo de archivo
      if (!validateFileType(file)) {
        e.target.value = "";
        compressedLogoImageFile = null;
        return;
      }

      // Validar tamaño (máximo 50MB)
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('La imagen es demasiado grande. Elige una de menos de 50MB.');
      }

      // Mostrar estado de carga
      const placeholder = document.getElementById("register-logo-placeholder");
      placeholder.innerHTML = 'Procesando imagen...';

      // Comprimir la imagen
      const compressedFile = await compressImage(file);

      // Abrir automáticamente el modal de recorte
      showCropperModal(compressedFile, 'logo');

      console.log('Logo procesado correctamente');
    } catch (error) {
      console.error('Error al procesar el logo:', error);
      alert(error.message || '¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor.');
      // Limpiar el input
      e.target.value = '';
      compressedLogoImageFile = null;
    }
  }
});

document.getElementById("register-image-input")?.addEventListener("change", async function (e) {
  const file = e.target.files[0];
  if (file) {
    // Validar tipo de archivo
    if (!validateFileType(file)) {
      e.target.value = "";
      return;
    }
    
    // Validar tamaño (máximo 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert("La imagen es demasiado grande. Elige una de menos de 50MB.");
      e.target.value = "";
      return;
    }
    
    try {
      const compressedFile = await compressImage(file);
      // Abrir automáticamente el modal de recorte
      showCropperModal(compressedFile, 'image');
    } catch (error) {
      console.error('Error al procesar la imagen:', error);
      showToast('Error al procesar la imagen', 'error');
    }
  }
});

function showToast(message, type = "info", duration = 3000) {
  const toast = document.getElementById("toast-notification");
  if (toast) {
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
      toast.className = `toast ${type}`;
    }, duration);
  } else {
    console.warn("Toast element not found in login.html. Message:", message);
    alert(message);
  }
}

function showScreen(screenId) {
  document
    .querySelectorAll(".auth-screen")
    .forEach((screen) => screen.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
}

function redirectToDashboard() {
  window.location.href = "/dashboard.html";
}

// --- 4. FUNCIONES DE LÓGICA DE AUTENTICACIÓN Y ROLES ---

async function upsertUserAsOwner(user) {
  try {
    const response = await fetch("/api/users/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        role: "owner",
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to upsert user as owner.");
    }
    console.log(`User ${user.uid} upserted as owner in 'users' collection.`);
  } catch (error) {
    console.error("Error upserting user as owner:", error);
    throw error;
  }
}

async function determineUserRoleAndRedirect(user) {
  try {
    await upsertUserAsOwner(user);

    const idToken = await user.getIdToken();
    const restaurantResponse = await fetch(
      `/api/restaurants/user/${user.uid}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      }
    );

    if (restaurantResponse.ok) {
      const restaurant = await restaurantResponse.json();
      document.getElementById("restaurant-name-toast").textContent =
        restaurant.name;
      showToast(
        "Welcome back, restaurant owner. Redirecting to dashboard...",
        "success"
      );
      redirectToDashboard();
    } else if (restaurantResponse.status === 404) {
      console.log(
        "User is owner but no restaurant found. Showing registration form."
      );
      showScreen("restaurant-form");
    } else if (restaurantResponse.status === 403) {
      console.warn(
        "Access denied to restaurant dashboard (Forbidden). Redirecting to home."
      );
      alert(
        "No tienes permisos para acceder a esta sección. Serás redirigido a la página principal."
      );
      window.location.href = "/index.html";
    } else if (restaurantResponse.status === 401) {
      console.error("Authentication failed with backend: Invalid token.");
      throw new Error(
        "Authentication required or invalid token to verify restaurant."
      );
    } else {
      const errorData = await restaurantResponse.json();
      console.error(
        "Server error verifying restaurant for owner:",
        errorData.error
      );
      alert(
        `Error: ${errorData.error || "Server error verifying owner's restaurant."
        }\n`
      );
      showScreen("login-initial");
    }
  } catch (error) {
    console.error("Error in determineUserRoleAndRedirect:", error);
    alert(`Connection error. Please try again later. ${error.message}`);
    showScreen("login-initial");
  }
}

async function signIn() {
  try {
    // Mostrar algún indicador de carga
    document.getElementById('loading-screen').classList.add('active');

    const result = await auth.signInWithPopup(googleProvider);
    console.log("signInWithPopup successful. onAuthStateChanged will handle redirection.");

    // Si el inicio de sesión es exitoso, verificamos el rol del usuario
    if (result.user) {
      await determineUserRoleAndRedirect(result.user);
    }
  } catch (error) {
    // Ocultar el indicador de carga
    document.getElementById('loading-screen').classList.remove('active');

    if (error.code === "auth/popup-closed-by-user") {
      console.log("User closed the popup");
    } else if (error.code === "auth/cancelled-popup-request") {
      console.log("Multiple popups were detected");
    } else {
      console.error("Error in signInWithPopup:", error);
      showToast("Error durante el inicio de sesión con Google. Por favor, intenta nuevamente.", "error");
    }
  }
}

async function handleRestaurantRegistration(e) {

  e.preventDefault();

  const form = e.target;
  const requiredFields = form.querySelectorAll("input[required], select[required], textarea[required]");
  let valid = true;
  requiredFields.forEach(field => {
    // Eliminar mensaje previo
    let errorSpan = field.parentNode.querySelector('.field-error-message');
    if (errorSpan) errorSpan.remove();
    if (!field.value) {
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
  // Horario de atención
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
  // Ocultar mensaje global
  const errorMsg = document.getElementById("form-error");
  if (errorMsg) errorMsg.style.display = "none";
  if (!valid) {
    // Scroll al primer campo con error
    const firstError = form.querySelector('.field-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    alert("Tu sesión ha expirado o hubo un error. Intenta iniciar sesión nuevamente.");
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Subiendo imágenes...";

  try {
    const timestamp = Date.now();

    // Subir imagen principal del restaurante si existe
    let photoUrl = null;
    if (compressedRegistrationImageFile && compressedRegistrationImageFile.name) {
      const photoPath = `restaurants/${user.uid}/photo-${timestamp}-${compressedRegistrationImageFile.name}`;
      photoUrl = await uploadImageToStorage(compressedRegistrationImageFile, photoPath);
    }

    // Subir logo si existe
    let logoUrl = null;
    if (compressedLogoImageFile && compressedLogoImageFile.name) {
      const logoPath = `restaurants/${user.uid}/logo-${timestamp}-${compressedLogoImageFile.name}`;
      logoUrl = await uploadImageToStorage(compressedLogoImageFile, logoPath);
    }

    submitButton.textContent = "Registrando...";

    const formData = new FormData(form);

    // Crear objeto con horario de atención
    const schedule = {
      monday: { from: formData.get("mondayFrom"), to: formData.get("mondayTo") },
      tuesday: { from: formData.get("tuesdayFrom"), to: formData.get("tuesdayTo") },
      wednesday: { from: formData.get("wednesdayFrom"), to: formData.get("wednesdayTo") },
      thursday: { from: formData.get("thursdayFrom"), to: formData.get("thursdayTo") },
      friday: { from: formData.get("fridayFrom"), to: formData.get("fridayTo") },
      saturday: { from: formData.get("saturdayFrom"), to: formData.get("saturdayTo") },
      sunday: { from: formData.get("sundayFrom"), to: formData.get("sundayTo") },
    };

    // Construir objeto con los datos del restaurante
    const restaurantData = {
      userId: user.uid,
      name: formData.get("name"),
      description: formData.get("description")?.trim() || null,
      district: formData.get("district"),
      whatsapp: formData.get("whatsapp"),
      photoUrl, // puede ser null
      logoUrl, // puede ser null
      ruc: formData.get("ruc") || null,
      yape: formData.get("yape") || null,
      phone: formData.get("phone") || null,
      hasDelivery: formData.get("delivery") === "on",
      hasLocalService: formData.get("localService") === "on",
      schedule,
      location: formData.get("location"),
    };

    // Enviar datos al backend
    const response = await fetch("/api/restaurants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify(restaurantData),
    });

    if (response.ok) {
      showToast("Restaurante registrado con éxito. Redirigiendo a tu dashboard...", "success");
      redirectToDashboard();
    } else {
      const error = await response.json();
      throw new Error(error.error || "Error desconocido durante el registro del restaurante.");
    }

  } catch (error) {
    console.error("Error en handleRestaurantRegistration:", error);
    document.getElementById("form-error").textContent = error.message;
    document.getElementById("form-error").style.display = "block";
    showToast("Error registrando: " + error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Registrar mi restaurante";
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
async function uploadImageToStorage(file, path) {
  const storageRef = storage.ref(path);
  const uploadTask = await storageRef.put(file);
  return await uploadTask.ref.getDownloadURL();
}

function setupRegistrationImageUploader() {
  const imageInput = document.getElementById("register-image-input");
  const imageBox = document.getElementById("register-image-upload-box");
  const preview = document.getElementById("register-image-preview");
  const placeholder = document.getElementById("register-image-placeholder");
  if (!imageInput || !imageBox || !preview) return;

  imageInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!validateFileType(file)) {
      event.target.value = "";
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast("La imagen es demasiado grande. Elige una de menos de 50MB.", "error");
      return;
    }
    
    try {
      const compressedFile = await compressImage(file);
      // Abrir automáticamente el modal de recorte
      showCropperModal(compressedFile, 'image');
    } catch (error) {
      console.error('Error al procesar la imagen:', error);
      showToast('Error al procesar la imagen', 'error');
    }
  };
}

// Variables globales para el cropper
let currentCropper = null;
let currentImageType = null; // 'image' o 'logo'
let originalImageFile = null;

// Función para eliminar la foto del restaurante en registro
function handleDeleteRegistrationPhoto() {
  const preview = document.getElementById("register-image-preview");
  const placeholder = document.getElementById("register-image-placeholder");
  const input = document.getElementById("register-image-input");
  const deleteBtn = document.getElementById("register-delete-photo-btn");
  
  // Ocultar preview y mostrar placeholder
  preview.style.display = "none";
  placeholder.style.display = "flex";
  
  // Restaurar contenido original del placeholder
  placeholder.innerHTML = `
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
    </div>
    <span>Foto del local</span>
  `;
  
  // Limpiar input de archivo
  input.value = "";
  
  // Ocultar botón eliminar
  if (deleteBtn) {
    deleteBtn.style.display = "none";
  }
  
  // Limpiar archivo comprimido si existe
  compressedRegistrationImageFile = null;
}

// Función para eliminar el logo del restaurante en registro
function handleDeleteRegistrationLogo() {
  const preview = document.getElementById("register-logo-preview");
  const placeholder = document.getElementById("register-logo-placeholder");
  const input = document.getElementById("register-logo-input");
  const deleteBtn = document.getElementById("register-delete-logo-btn");
  
  // Ocultar preview y mostrar placeholder
  preview.style.display = "none";
  placeholder.style.display = "flex";
  
  // Restaurar contenido original del placeholder
  placeholder.innerHTML = `
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path
          d="M20 7h-3V4c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM9 4h6v3H9V4zm11 14H4V9h5c0 1.1.9 2 2 2h2c1.1 0 2-.9 2-2h5v9z" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    </div>
    <span>Logo del restaurante</span>
  `;
  
  // Limpiar input de archivo
  input.value = "";
  
  // Ocultar botón eliminar
  if (deleteBtn) {
    deleteBtn.style.display = "none";
  }
  
  // Limpiar archivo comprimido si existe
  compressedLogoImageFile = null;
}

// Función para mostrar el modal de cropper
function showCropperModal(file, imageType) {
  currentImageType = imageType;
  originalImageFile = file;
  
  const modal = document.getElementById('cropperModal');
  const cropperImage = document.getElementById('cropper-image');
  
  const reader = new FileReader();
  reader.onload = function(e) {
    cropperImage.src = e.target.result;
    modal.classList.add('show');
    
    // Destruir cropper anterior si existe
    if (currentCropper) {
      currentCropper.destroy();
    }
    
    // Crear nuevo cropper
    currentCropper = new Cropper(cropperImage, {
      aspectRatio: imageType === 'logo' ? 1 : 16/9,
      viewMode: 1,
      autoCropArea: 0.8,
      responsive: true,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false
    });
  };
  
  reader.readAsDataURL(file);
}

// Función para cerrar el modal de cropper
function closeCropperModal() {
  const modal = document.getElementById('cropperModal');
  modal.classList.remove('show');
  
  if (currentCropper) {
    currentCropper.destroy();
    currentCropper = null;
  }
  
  currentImageType = null;
  originalImageFile = null;
}

// Función para guardar la imagen recortada
function saveCroppedImage() {
  if (!currentCropper || !currentImageType) return;
  
  const canvas = currentCropper.getCroppedCanvas({
    width: currentImageType === 'logo' ? 400 : 800,
    height: currentImageType === 'logo' ? 400 : 450,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  });
  
  canvas.toBlob(async (blob) => {
    const croppedFile = new File([blob], originalImageFile.name, {
      type: originalImageFile.type,
      lastModified: Date.now()
    });
    
    if (currentImageType === 'image') {
      compressedRegistrationImageFile = croppedFile;
      await handleImagePreview(croppedFile, 'register-image-preview', 'register-image-placeholder', 'register-delete-photo-btn');
    } else if (currentImageType === 'logo') {
      const compressedLogo = await compressImage(croppedFile);
      compressedLogoImageFile = compressedLogo;
      await handleImagePreview(compressedLogo, 'register-logo-preview', 'register-logo-placeholder', 'register-delete-logo-btn');
    }
    
    closeCropperModal();
  }, originalImageFile.type, 0.9);
}

// Función para configurar los event listeners del cropper
function setupCropperEventListeners() {
  // Botones del modal de cropper
  document.getElementById('cancel-crop-btn').addEventListener('click', closeCropperModal);
  document.getElementById('save-crop-btn').addEventListener('click', saveCroppedImage);
  
  // Cerrar modal al hacer clic fuera
  document.getElementById('cropperModal').addEventListener('click', (e) => {
    if (e.target.id === 'cropperModal') {
      closeCropperModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("new-restaurant-form")
    .addEventListener("submit", handleRestaurantRegistration);

  setupRegistrationImageUploader();
  setupCropperEventListeners();
  
  // Event listeners para botones de eliminar
  document.getElementById('register-delete-photo-btn')?.addEventListener('click', handleDeleteRegistrationPhoto);
  document.getElementById('register-delete-logo-btn')?.addEventListener('click', handleDeleteRegistrationLogo);

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;

      await determineUserRoleAndRedirect(user);
    } else {
      showScreen("login-initial");
    }
  });
});
