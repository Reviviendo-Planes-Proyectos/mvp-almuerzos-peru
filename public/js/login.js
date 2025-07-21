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

// --- 3. FUNCIONES AUXILIARES DE UI (TOASTS, PANTALLAS, REDIRECCIÓN) ---

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
    const result = await auth.signInWithPopup(googleProvider);

    console.log(
      "signInWithPopup successful. onAuthStateChanged will handle redirection."
    );
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user") {
      console.error("Error in signInWithPopup:", error);
      showToast("Error during Google login. Please try again.", "error");
    }
  }
}

async function handleRestaurantRegistration(e) {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) {
    alert(
      "Your session has expired or there was an error. Please try logging in again."
    );
    return;
  }
  if (!compressedRegistrationImageFile) {
    alert("Por favor, sube una foto de tu local.");
    return;
  }
  const form = e.target;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Subiendo foto...";

  try {
    const imageFileName = `logo-${Date.now()}-${
      compressedRegistrationImageFile.name
    }`;
    const storageRef = storage.ref(`restaurants/${user.uid}/${imageFileName}`);
    const uploadTask = await storageRef.put(compressedRegistrationImageFile);
    const photoUrl = await uploadTask.ref.getDownloadURL();

    submitButton.textContent = "Registrando...";
    const formData = new FormData(form);
    const restaurantData = {
      userId: user.uid,
      name: formData.get("name"),
      description: formData.get("description"),
      district: formData.get("district"),
      whatsapp: formData.get("whatsapp"),
      photoUrl: photoUrl,
    };

    const response = await fetch("/api/restaurants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify(restaurantData),
    });

    if (response.ok) {
      console.log(
        "Restaurant registered successfully. Redirecting to dashboard..."
      );
      showToast(
        "Restaurante registrado con éxito. Redirigiendo a tu dashboard...",
        "success"
      );
      redirectToDashboard();
    } else {
      const error = await response.json();
      throw new Error(
        error.error || "Unknown error during restaurant registration."
      );
    }
  } catch (error) {
    console.error("Error in handleRestaurantRegistration:", error);
    document.getElementById("form-error").textContent = error.message;
    document.getElementById("form-error").style.display = "block";
    showToast("Error registering: " + error.message, "error");
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

function setupRegistrationImageUploader() {
  const imageInput = document.getElementById("register-image-input");
  const imageBox = document.getElementById("register-image-upload-box");
  const preview = document.getElementById("register-image-preview");
  const placeholder = document.getElementById("register-image-placeholder");
  if (!imageInput || !imageBox || !preview) return;

  imageInput.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("La imagen es demasiado grande (máx 3MB).");
      return;
    }
    compressImage(file).then((compressedFile) => {
      compressedRegistrationImageFile = compressedFile;
      preview.src = URL.createObjectURL(compressedFile);
      preview.style.display = "block";
      if (placeholder) placeholder.style.display = "none";
    });
  };
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("new-restaurant-form")
    .addEventListener("submit", handleRestaurantRegistration);

  setupRegistrationImageUploader();

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;

      await determineUserRoleAndRedirect(user);
    } else {
      showScreen("login-initial");
    }
  });
});
