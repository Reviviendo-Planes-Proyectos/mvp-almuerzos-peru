// --- 1. CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDNbgT9yeSBMhsftW4FOe_SB7bfSg44CPI",
  authDomain: "cashma-8adfb.firebaseapp.com",
  projectId: "cashma-8adfb",
  storageBucket: "cashma-8adfb.appspot.com",
  messagingSenderId: "92623435008",
  appId: "1:92623435008:web:8d4b4d58c0ccb9edb5afe5",
};

// Cache para optimizar rendimiento
let authCache = new Map();

// Variables globales de Firebase
let auth, googleProvider, db, storage;

// Inicializar Firebase cuando esté disponible
function waitForFirebaseAndInitialize() {
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.auth && firebase.firestore && firebase.storage) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    googleProvider = new firebase.auth.GoogleAuthProvider();
    db = firebase.firestore();
    storage = firebase.storage();
    console.log('Firebase initialized successfully in login');
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
        console.error('Firebase failed to load after maximum attempts in login');
      }
    }
  }, 100);
}

// Inicializar Firebase de forma lazy
document.addEventListener("DOMContentLoaded", () => {
  // Firebase ya está inicializado arriba
});

// --- 2. VARIABLES GLOBALES DE ESTADO ---
let currentUser = null;
let compressedRegistrationImageFile = null;
let compressedLogoImageFile = null;

// --- 3. FUNCIONES AUXILIARES DE UI (TOASTS, PANTALLAS, REDIRECCIÓN) ---

// Función para mostrar modal de éxito con diseño del logout
function showSuccessModal(message) {
  // Crear overlay
  const overlay = document.createElement('div');
  overlay.className = 'success-modal__overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    animation: success-fade-in 0.3s ease;
  `;

  // Crear tarjeta del modal
  const card = document.createElement('div');
  card.className = 'success-modal__card';
  card.style.cssText = `
    background: white;
    border-radius: 16px;
    padding: 2rem;
    text-align: center;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    max-width: 400px;
    width: 90%;
    animation: success-pop-in 0.3s ease;
  `;

  // Crear icono de éxito (checkmark)
  const icon = document.createElement('div');
  icon.className = 'success-modal__icon';
  icon.style.cssText = `
    width: 64px;
    height: 64px;
    background-color: #22c55e;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem;
  `;
  
  icon.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20,6 9,17 4,12"></polyline>
    </svg>
  `;

  // Crear título
  const title = document.createElement('h3');
  title.className = 'success-modal__title';
  title.style.cssText = `
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.5rem 0;
  `;
  title.textContent = '¡Éxito!';

  // Crear texto del mensaje
  const text = document.createElement('p');
  text.className = 'success-modal__text';
  text.style.cssText = `
    color: #6b7280;
    margin: 0;
    line-height: 1.5;
  `;
  text.textContent = message;

  // Ensamblar el modal
  card.appendChild(icon);
  card.appendChild(title);
  card.appendChild(text);
  overlay.appendChild(card);

  // Agregar estilos de animación
  const style = document.createElement('style');
  style.textContent = `
    @keyframes success-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes success-pop-in {
      from {
        opacity: 0;
        transform: scale(0.8) translateY(-20px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    @keyframes success-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes success-pop-out {
      from {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      to {
        opacity: 0;
        transform: scale(0.8) translateY(-20px);
      }
    }
  `;
  document.head.appendChild(style);

  // Agregar al DOM
  document.body.appendChild(overlay);

  // Auto-cerrar después de 3 segundos
  setTimeout(() => {
    overlay.style.animation = 'success-fade-out 0.3s ease';
    card.style.animation = 'success-pop-out 0.3s ease';
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 300);
  }, 3000);
}

// Función para mostrar alerta visual en el formulario (mantener para compatibilidad)
function showModalAlert(message, type = "error") {
  if (type === "success") {
    showSuccessModal(message);
    return;
  }
  
  // Buscar el contenedor del formulario activo
  const activeFormContainer = document.querySelector("#restaurant-form");
  const activeForm = document.querySelector("#new-restaurant-form");

  if (activeFormContainer && activeForm) {
    // Remover alerta anterior si existe
    const existingAlert = activeFormContainer.querySelector(".modal-alert");
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

    // Insertar la alerta al inicio del formulario
    activeForm.insertBefore(alertContainer, activeForm.firstChild);

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
    // Fallback a alert normal si no hay formulario activo
    alert(message);
  }
}

// Función para validar tipos de archivo de imagen
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

// Función para sincronizar horarios con el lunes
function syncScheduleWithMonday() {
  const mondayFromInput = document.querySelector('input[name="mondayFrom"]');
  const mondayToInput = document.querySelector('input[name="mondayTo"]');

  if (!mondayFromInput.value || !mondayToInput.value) {
    showModalAlert("Por favor, primero establece el horario del día Lunes");
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
  const mondayFrom = mondayFromInput.value;
  const mondayTo = mondayToInput.value;

  days.forEach((day) => {
    const fromInput = document.querySelector(`input[name="${day}From"]`);
    const toInput = document.querySelector(`input[name="${day}To"]`);

    fromInput.value = mondayFrom;
    toInput.value = mondayTo;
  });

  // Mostrar feedback visual
  const syncButton = document.querySelector(".sync-button");
  const originalText = syncButton.innerHTML;
  syncButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
    ¡Sincronizado!
  `;
  syncButton.style.backgroundColor = "#10b981";
  syncButton.style.borderColor = "#059669";
  syncButton.style.color = "white";

  setTimeout(() => {
    syncButton.innerHTML = originalText;
    syncButton.style.backgroundColor = "";
    syncButton.style.borderColor = "";
    syncButton.style.color = "";
  }, 2000);
}

// Función para manejar la previsualización de imágenes
async function handleImagePreview(
  file,
  previewId,
  placeholderId,
  deleteBtnId = null
) {
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
        deleteBtn.style.display = "flex";
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
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Si la imagen es más grande que 800x800, redimensionarla
        const MAX_SIZE = 800;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          } else {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a blob
        canvas.toBlob(
          (blob) => {
            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/jpeg",
          0.7
        ); // 0.7 es la calidad de compresión
      };
    };

    reader.onerror = reject;
  });
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

// Event listeners para las imágenes
document
  .getElementById("register-logo-input")
  ?.addEventListener("change", async function (e) {
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
          throw new Error(
            "La imagen es demasiado grande. Elige una de menos de 50MB."
          );
        }

        // Validar resolución
        const { width, height } = await getImageDimensions(file);
        const minWidth = 160;
        const minHeight = 120;
        const maxWidth = 16384;
        const maxHeight = 16384;

        if (width < minWidth || height < minHeight) {
          showModalAlert("La resolución de la imagen es muy baja");
          e.target.value = "";
          return;
        }

        if (width > maxWidth || height > maxHeight) {
          showModalAlert(
            `La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`
          );
          e.target.value = "";
          return;
        }

        // Mostrar estado de carga
        const placeholder = document.getElementById(
          "register-logo-placeholder"
        );
        placeholder.innerHTML = "Procesando imagen...";

        // Comprimir la imagen
        const compressedFile = await compressImage(file);

        // Abrir automáticamente el modal de recorte
        showCropperModal(compressedFile, "logo");

        console.log("Logo procesado correctamente");
      } catch (error) {
        console.error("Error al procesar el logo:", error);
        showModalAlert(
          error.message ||
            "¡Ups! Parece que la imagen no se pudo cargar correctamente. Intenta con otra foto, por favor."
        );
        // Limpiar el input
        e.target.value = "";
        compressedLogoImageFile = null;
      }
    }
  });

document
  .getElementById("register-image-input")
  ?.addEventListener("change", async function (e) {
    const file = e.target.files[0];
    if (file) {
      // Validar tipo de archivo
      if (!validateFileType(file)) {
        e.target.value = "";
        return;
      }

      // Validar tamaño (máximo 50MB)
      if (file.size > 50 * 1024 * 1024) {
        showModalAlert(
          "La imagen es demasiado grande. Elige una de menos de 50MB."
        );
        e.target.value = "";
        return;
      }

      try {
        const compressedFile = await compressImage(file);
        // Abrir automáticamente el modal de recorte
        showCropperModal(compressedFile, "image");
      } catch (error) {
        console.error("Error al procesar la imagen:", error);
        showToast("Error al procesar la imagen", "error");
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
      showModalAlert("La imagen es demasiado grande. Elige una de menos de 50MB.");
      e.target.value = "";
      return;
    }
    
    try {
      // Validar resolución
      const { width, height } = await getImageDimensions(file);
      const minWidth = 160;
      const minHeight = 120;
      const maxWidth = 16384;
      const maxHeight = 16384;

      if (width < minWidth || height < minHeight) {
        showModalAlert('La resolución de la imagen es muy baja');
        e.target.value = "";
        return;
      }

      if (width > maxWidth || height > maxHeight) {
        showModalAlert(`La resolución de la imagen es demasiado alta (máx. ${maxWidth}x${maxHeight})`);
        e.target.value = "";
        return;
      }

      // Mostrar estado de carga
      const placeholder = document.getElementById("register-image-placeholder");
      placeholder.innerHTML = 'Procesando imagen...';

      const compressedFile = await compressImage(file);
      // Abrir automáticamente el modal de recorte
      showCropperModal(compressedFile, 'image');
    } catch (error) {
      console.error('Error al procesar la imagen:', error);
      showToast('Error al procesar la imagen', 'error');
      // Restaurar placeholder en caso de error
      const placeholder = document.getElementById("register-image-placeholder");
      if (placeholder) {
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
      }
      e.target.value = '';
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
        `Error: ${
          errorData.error || "Server error verifying owner's restaurant."
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
    document.getElementById("loading-screen").classList.add("active");

    const result = await auth.signInWithPopup(googleProvider);
    console.log(
      "signInWithPopup successful. onAuthStateChanged will handle redirection."
    );

    // Si el inicio de sesión es exitoso, verificamos el rol del usuario
    if (result.user) {
      await determineUserRoleAndRedirect(result.user);
    }
  } catch (error) {
    // Ocultar el indicador de carga
    document.getElementById("loading-screen").classList.remove("active");

    if (error.code === "auth/popup-closed-by-user") {
      console.log("User closed the popup");
    } else if (error.code === "auth/cancelled-popup-request") {
      console.log("Multiple popups were detected");
    } else {
      console.error("Error in signInWithPopup:", error);
      showToast(
        "Error durante el inicio de sesión con Google. Por favor, intenta nuevamente.",
        "error"
      );
    }
  }
}

async function handleRestaurantRegistration(e) {
  e.preventDefault();

  const form = e.target;
  const requiredFields = form.querySelectorAll(
    "input[required], select[required], textarea[required]"
  );
  let valid = true;
  requiredFields.forEach((field) => {
    // Eliminar mensaje previo
    let errorSpan = field.parentNode.querySelector(".field-error-message");
    if (errorSpan) errorSpan.remove();
    if (!field.value) {
      field.classList.add("field-error");
      valid = false;
      // Crear mensaje de error debajo del campo
      errorSpan = document.createElement("span");
      errorSpan.className = "field-error-message";
      errorSpan.textContent = "Este campo es obligatorio.";
      errorSpan.style.color = "#e53935";
      errorSpan.style.fontSize = "0.95em";
      errorSpan.style.marginTop = "2px";
      errorSpan.style.display = "block";
      field.parentNode.appendChild(errorSpan);
    } else {
      field.classList.remove("field-error");
    }
  });
  // Horario de atención
  const scheduleInputs = form.querySelectorAll(".schedule-row input[required]");
  scheduleInputs.forEach((field) => {
    let errorSpan = field.parentNode.querySelector(".field-error-message");
    if (errorSpan) errorSpan.remove();
    if (!field.value) {
      field.classList.add("field-error");
      valid = false;
      errorSpan = document.createElement("span");
      errorSpan.className = "field-error-message";
      errorSpan.textContent = "Este campo es obligatorio.";
      errorSpan.style.color = "#e53935";
      errorSpan.style.fontSize = "0.95em";
      errorSpan.style.marginTop = "2px";
      errorSpan.style.display = "block";
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
    const firstError = form.querySelector(".field-error");
    if (firstError)
      firstError.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    showModalAlert(
      "Tu sesión ha expirado o hubo un error. Intenta iniciar sesión nuevamente."
    );
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Subiendo imágenes...";

  try {
    const timestamp = Date.now();

    // Subir imagen principal del restaurante si existe
    let photoUrl = null;
    if (
      compressedRegistrationImageFile &&
      compressedRegistrationImageFile.name
    ) {
      const photoPath = `restaurants/${user.uid}/photo-${timestamp}-${compressedRegistrationImageFile.name}`;
      photoUrl = await uploadImageToStorage(
        compressedRegistrationImageFile,
        photoPath
      );
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
      monday: {
        from: formData.get("mondayFrom"),
        to: formData.get("mondayTo"),
      },
      tuesday: {
        from: formData.get("tuesdayFrom"),
        to: formData.get("tuesdayTo"),
      },
      wednesday: {
        from: formData.get("wednesdayFrom"),
        to: formData.get("wednesdayTo"),
      },
      thursday: {
        from: formData.get("thursdayFrom"),
        to: formData.get("thursdayTo"),
      },
      friday: {
        from: formData.get("fridayFrom"),
        to: formData.get("fridayTo"),
      },
      saturday: {
        from: formData.get("saturdayFrom"),
        to: formData.get("saturdayTo"),
      },
      sunday: {
        from: formData.get("sundayFrom"),
        to: formData.get("sundayTo"),
      },
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

    console.log("Datos del restaurante a enviar:", restaurantData);

    // Enviar datos al backend
    const response = await fetch("/api/restaurants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify(restaurantData),
    });

    const data = await response.json();
    console.log("response", data);

    if (response.ok) {
      const qrLink = `https://mvp-almuerzos-peru.vercel.app/menu.html?restaurantId=${encodeURIComponent(
        data.restaurantId
      )}`;

      // 🔁 REEMPLAZA el bloque antiguo de generación de QR por este:

      // (Opcional) si tu endpoint /api/qr requiere auth, agrega el idToken
      const headers = {};
      try {
        const idToken = await user.getIdToken();
        headers["Authorization"] = `Bearer ${idToken}`;
      } catch (_) {
        // si tu endpoint no exige auth, puedes omitir esto
      }
      console.log("hola llego");
      // 1) Pide el PNG al servidor
      const resp = await fetch(
        `/api/qr?text=${encodeURIComponent(qrLink)}&width=512&ecc=M&margin=2`,
        { headers }
      );
      if (!resp.ok) {
        throw new Error("No se pudo generar el QR en el servidor");
      }
      // 2) Convierte a File para subir a Firebase Storage
      const qrBlob = await resp.blob();
      const qrFileName = `qr-${Date.now()}.png`;
      const qrFile = new File([qrBlob], qrFileName, { type: "image/png" });

      // 3) Sube el PNG a Storage con tu función existente
      const qrPath = `restaurants/${user.uid}/${qrFileName}`;
      const qrUrl = await uploadImageToStorage(qrFile, qrPath);

      console.log(`QR Code uploaded to Storage: ${qrUrl}`);
      console.log("qrLink ", qrLink);

      const updatePayload = {
        ...restaurantData, // el PUT exige name, district, whatsapp, etc.
        qr: qrUrl,
      };

      const updateResp = await fetch(`/api/restaurants/${data.restaurantId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(updatePayload),
      });
      if (!updateResp.ok) {
        const errData = await updateResp.json();
        throw new Error(
          errData.error || "No se pudo guardar el QR en el restaurante."
        );
      }

      showModalAlert(
        "Restaurante registrado con éxito. Redirigiendo a tu dashboard...",
        "success"
      ); 
      
      // Esperar 3.5 segundos para que el usuario vea el modal antes de redirigir
      setTimeout(() => {
        redirectToDashboard();
      }, 3500);
    } else {
      const error = await response.json();
      throw new Error(
        error.error || "Error desconocido durante el registro del restaurante."
      );
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
      showToast(
        "La imagen es demasiado grande. Elige una de menos de 50MB.",
        "error"
      );
      return;
    }

    try {
      const compressedFile = await compressImage(file);
      // Abrir automáticamente el modal de recorte
      showCropperModal(compressedFile, "image");
    } catch (error) {
      console.error("Error al procesar la imagen:", error);
      showToast("Error al procesar la imagen", "error");
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

  const modal = document.getElementById("cropperModal");
  const cropperImage = document.getElementById("cropper-image");

  const reader = new FileReader();
  reader.onload = function (e) {
    cropperImage.src = e.target.result;
    modal.classList.add("show");

    // Destruir cropper anterior si existe
    if (currentCropper) {
      currentCropper.destroy();
    }

    // Crear nuevo cropper
    currentCropper = new Cropper(cropperImage, {
      aspectRatio: imageType === "logo" ? 1 : 16 / 9,
      viewMode: 1,
      autoCropArea: 0.8,
      responsive: true,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
    });
  };

  reader.readAsDataURL(file);
}

// Función para cerrar el modal de cropper
function closeCropperModal() {
  const modal = document.getElementById("cropperModal");
  modal.classList.remove("show");

  if (currentCropper) {
    currentCropper.destroy();
    currentCropper = null;
  }
  
  // Restaurar el estado original del placeholder cuando se cancela
  if (currentImageType === 'image') {
    const placeholder = document.getElementById('register-image-placeholder');
    const input = document.getElementById('register-image-input');
    if (placeholder) {
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
    }
    if (input) {
      input.value = '';
    }
    // Limpiar archivo comprimido
    compressedRegistrationImageFile = null;
  } else if (currentImageType === 'logo') {
    const placeholder = document.getElementById('register-logo-placeholder');
    const input = document.getElementById('register-logo-input');
    if (placeholder) {
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
    }
    if (input) {
      input.value = '';
    }
    // Limpiar archivo comprimido
    compressedLogoImageFile = null;
  }
  
  currentImageType = null;
  originalImageFile = null;
}

// Función para guardar la imagen recortada
function saveCroppedImage() {
  if (!currentCropper || !currentImageType) return;

  const canvas = currentCropper.getCroppedCanvas({
    width: currentImageType === "logo" ? 400 : 800,
    height: currentImageType === "logo" ? 400 : 450,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  });

  canvas.toBlob(
    async (blob) => {
      const croppedFile = new File([blob], originalImageFile.name, {
        type: originalImageFile.type,
        lastModified: Date.now(),
      });

      if (currentImageType === "image") {
        compressedRegistrationImageFile = croppedFile;
        await handleImagePreview(
          croppedFile,
          "register-image-preview",
          "register-image-placeholder",
          "register-delete-photo-btn"
        );
      } else if (currentImageType === "logo") {
        const compressedLogo = await compressImage(croppedFile);
        compressedLogoImageFile = compressedLogo;
        await handleImagePreview(
          compressedLogo,
          "register-logo-preview",
          "register-logo-placeholder",
          "register-delete-logo-btn"
        );
      }

      closeCropperModal();
    },
    originalImageFile.type,
    0.9
  );
}

// Función para configurar los event listeners del cropper
function setupCropperEventListeners() {
  // Botones del modal de cropper
  document
    .getElementById("cancel-crop-btn")
    .addEventListener("click", closeCropperModal);
  document
    .getElementById("save-crop-btn")
    .addEventListener("click", saveCroppedImage);

  // Cerrar modal al hacer clic fuera
  document.getElementById("cropperModal").addEventListener("click", (e) => {
    if (e.target.id === "cropperModal") {
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
  document
    .getElementById("register-delete-photo-btn")
    ?.addEventListener("click", handleDeleteRegistrationPhoto);
  document
    .getElementById("register-delete-logo-btn")
    ?.addEventListener("click", handleDeleteRegistrationLogo);

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;

      await determineUserRoleAndRedirect(user);
    } else {
      showScreen("login-initial");
    }
  });
});
