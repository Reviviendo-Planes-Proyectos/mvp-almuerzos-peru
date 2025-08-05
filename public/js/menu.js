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
const db = firebase.firestore(); // Necesario para gestionar los favoritos en Firestore
window.sentComments = window.sentComments || {};

document.addEventListener("DOMContentLoaded", () => {
  // --- Referencias DOM existentes para el menú ---
  const menuBanner = document.getElementById("menu-banner");
  const restaurantNameElement = document.getElementById("restaurant-name");
  const restaurantDescriptionElement = document.getElementById(
    "restaurant-description"
  );
  const shareButton = document.getElementById("share-btn");
  const cardsNav = document.getElementById("cards-nav");
  const dishesContainer = document.getElementById("dishes-container");
  const orderButton = document.querySelector(".order-button");
  const toastNotification = document.getElementById("toast-notification"); // Referencia al toast

  // --- Referencias DOM NUEVAS para Login y Favoritos ---
  const myRestaurantButton = document.getElementById("my-restaurant-btn");
  const myAccountBtn = document.getElementById("my-account-btn");
  const logoutText = document.getElementById("logout-text");
  const favoritesCountDisplay = document.getElementById(
    "favorites-count-display"
  );
  const favoritesCounter = document.getElementById("favorites-counter");
  const loginModalOverlay = document.getElementById("login-modal-overlay");
  const loginModalCloseBtn = document.getElementById("login-modal-close-btn");
  const googleLoginBtn = document.getElementById("google-login-btn");

  // --- Variables de estado ---
  let allCardsData = []; // Contiene todas las cartas y sus platos
  let currentRestaurant = null;
  let shoppingCart = {}; // Para el carrito de compras
  let currentUserFavorites = new Set(); // Para los likes del usuario, gestionado con Firestore
  let currentRestaurantId = null;

  let isDown = false;
  let startX;
  let scrollLeft;

  let currentCardId = null;

  // --- Función para actualizar contador de corazones dinámico ---
  function updateTotalLikesCounter() {
    const totalLikesElement = document.getElementById("restaurant-total-likes");
    if (!totalLikesElement || !allCardsData) {
      return;
    }

    let totalLikes = 0;

    // Sumar los likes de todos los platillos activos de todas las cartas
    allCardsData.forEach(card => {
      if (card.dishes && Array.isArray(card.dishes)) {
        card.dishes.forEach(dish => {
          // Solo contar platillos activos (habilitados)
          if (dish.isActive) {
            totalLikes += dish.likesCount || 0;
          }
        });
      }
    });

    totalLikesElement.textContent = totalLikes;
  }

  // --- Funciones para el estado del restaurante ---
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

  // --- Funciones auxiliares ---
  function showToast(message, type = "info", duration = 3000) {
    if (!toastNotification) return;
    toastNotification.textContent = message;
    toastNotification.className = `toast ${type} show`;
    setTimeout(() => {
      toastNotification.className = `toast ${type}`;
    }, duration);
  }

  function handlePageError(message) {
    restaurantNameElement.textContent = "Error";
    restaurantDescriptionElement.textContent = message;
    cardsNav.innerHTML = "";
    dishesContainer.innerHTML = "";
    showToast(message, "error");
  }

  // --- Lógica del arrastre del cardsNav ---
  if (cardsNav) {
    cardsNav.addEventListener("mousedown", (e) => {
      isDown = true;
      cardsNav.classList.add("active-drag");
      startX = e.pageX - cardsNav.offsetLeft;
      scrollLeft = cardsNav.scrollLeft;
      e.preventDefault();
    });

    cardsNav.addEventListener("mouseleave", () => {
      isDown = false;
      cardsNav.classList.remove("active-drag");
    });

    cardsNav.addEventListener("mouseup", () => {
      isDown = false;
      cardsNav.classList.remove("active-drag");
    });

    cardsNav.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - cardsNav.offsetLeft;
      const walk = (x - startX) * 1.5;
      cardsNav.scrollLeft = scrollLeft - walk;
    });
  }

  // --- Lógica del botón de ordenar (WhatsApp) ---
  if (orderButton) {
    orderButton.addEventListener("click", handleOrderClick);
  }

  function handleOrderClick() {
    const user = auth.currentUser;

    if (!user) {
      loginModalOverlay.style.display = "flex";
      showToast("Por favor, inicia sesión para realizar un pedido.", "info");
      return;
    }

    if (!currentRestaurant || !currentRestaurant.whatsapp) {
      return showToast(
        "No se encontró el número de WhatsApp del restaurante.",
        "warning"
      );
    }

    const message = generateWhatsAppMessage();

    if (message) {
      // Obtener platos previamente comentados del localStorage
      const previousDishes =
        JSON.parse(localStorage.getItem("commentedDishes")) || [];
      const commentedDishesSet = new Set(previousDishes);

      Object.keys(shoppingCart).forEach((dishId) => {
        const quantity = shoppingCart[dishId];
        if (quantity > 0) {
          const commentContainer = document.querySelector(
            `.comment-button-container[data-dish-id="${dishId}"]`
          );

          if (
            commentContainer &&
            !commentContainer.querySelector(".comment-icon")
          ) {
            const commentIcon = document.createElement("span");
            commentIcon.className = "comment-icon";
            commentIcon.innerHTML = "🗨️";
            commentIcon.setAttribute("data-dish-id", dishId);
            commentIcon.style.cursor = "pointer";

            commentIcon.addEventListener("click", () => {
              openCommentModal(dishId);
            });

            commentContainer.appendChild(commentIcon);
          }

          // Agregar a set (evita duplicados)
          commentedDishesSet.add(dishId);
        }
      });

      // Guardar platos comentados actualizados en localStorage
      localStorage.setItem(
        "commentedDishes",
        JSON.stringify(Array.from(commentedDishesSet))
      );

      // Abrir WhatsApp al final
      const encoded = encodeURIComponent(message);
      const link = `https://api.whatsapp.com/send?phone=${currentRestaurant.whatsapp}&text=${encoded}`;
      window.open(link, "_blank");
    }
  }
  function renderCommentIcons() {
    const commentedDishes =
      JSON.parse(localStorage.getItem("commentedDishes")) || [];

    const allDishIds = new Set([
      ...Object.keys(shoppingCart || {}),
      ...commentedDishes,
    ]);

    allDishIds.forEach((dishId) => {
      const quantity = shoppingCart?.[dishId] || 0;
      const hasComment = commentedDishes.includes(dishId);

      // Mostrar ícono si hay cantidad o si está guardado en localStorage
      if ((quantity > 0 || hasComment) && !window.sentComments?.[dishId]) {
        const commentContainer = document.querySelector(
          `.comment-button-container[data-dish-id="${dishId}"]`
        );

        if (
          commentContainer &&
          !commentContainer.querySelector(".comment-icon")
        ) {
          const commentIcon = document.createElement("span");
          commentIcon.className = "comment-icon";
          commentIcon.innerHTML = "🗨️";
          commentIcon.setAttribute("data-dish-id", dishId);
          commentIcon.style.cursor = "pointer";

          commentIcon.addEventListener("click", () => {
            openCommentModal(dishId);
          });

          commentContainer.appendChild(commentIcon);
        }
      }
    });
  }

  function generateWhatsAppMessage() {
    if (Object.keys(shoppingCart).length === 0) {
      showToast("Por favor, agrega algunos platos a tu pedido.", "warning");
      return "";
    }

    let message = `¡Hola, *${currentRestaurant.name}*! 👋\n`;
    let total = 0;

    message += `\nSoy *${auth.currentUser.displayName}*, los estoy contactando desde *Almuerzos Perú* y me gustaria hacer el siguiente pedido:`;

    message += `\n\n🛒 *Pedido:* \n\n`;

    for (const dishId in shoppingCart) {
      const quantity = shoppingCart[dishId];
      let dishFound = null;
      // Buscar el plato en todas las cartas (ya que allCardsData ya contiene los platos)
      for (const card of allCardsData) {
        dishFound = card.dishes.find((d) => d.id === dishId);
        if (dishFound) break;
      }
      if (dishFound) {
        message += `  • ${quantity} ${
          dishFound.name
        } - S/.${dishFound.price.toFixed(2)}\n`;
        total += quantity * dishFound.price;
      }
    }
    message += `\n💵 *Total a pagar*: S/.${total.toFixed(2)}`;
    message += `\n\nQuedo atento(a) a su confirmación.`;
    message += `\n\n¡Muchas gracias!`;
    return message;
  }

  // --- Lógica del carrito de compras (cantidad de platos) ---
  function setupQuantityControls() {
    document.querySelectorAll(".quantity-control").forEach((control) => {
      // Solo inicializar listeners una vez
      if (control.dataset.listenersInitialized) return;

      const addBtn = control.querySelector(".add-btn");
      const selector = control.querySelector(".quantity-selector");
      const minusBtn = control.querySelector(".minus-btn");
      const plusBtn = control.querySelector(".plus-btn");
      const display = control.querySelector(".quantity-display");
      const dishId = control.dataset.dishId;

      // Establecer estado inicial del selector de cantidad
      const currentQuantity = shoppingCart[dishId] || 0;
      if (currentQuantity > 0) {
        addBtn.style.display = "none";
        selector.style.display = "flex";
        display.textContent = currentQuantity;
      } else {
        addBtn.style.display = "flex";
        selector.style.display = "none";
        display.textContent = "0";
      }

      addBtn.onclick = () => {
        updateCart(dishId, 1, control);
      };

      minusBtn.onclick = () => {
        const newQuantity = (shoppingCart[dishId] || 0) - 1;
        updateCart(dishId, newQuantity, control);
        //toggleCommentIcon(dishId, newQuantity);
      };

      plusBtn.onclick = () => {
        const newQuantity = (shoppingCart[dishId] || 0) + 1;
        updateCart(dishId, newQuantity, control);
      };
      control.dataset.listenersInitialized = true; // Marcar como inicializado
    });
  }
  function toggleCommentIcon(dishId, quantity) {
    if (quantity !== 0) return; // Solo actuamos si la cantidad es exactamente 0

    const commentContainer = document.querySelector(
      `.comment-button-container[data-dish-id="${dishId}"]`
    );

    if (!commentContainer) return;

    const existingIcon = commentContainer.querySelector(".comment-icon");

    if (existingIcon) {
      existingIcon.remove();

      // 🔒 Marcar que ya se envió comentario para evitar volver a mostrarlo
      window.sentComments = window.sentComments || {};
      window.sentComments[dishId] = true;
    }
  }

  function updateCart(dishId, quantity, control) {
    if (quantity > 0) {
      shoppingCart[dishId] = quantity;
    } else {
      delete shoppingCart[dishId];
    }
    updateQuantityUI(control, quantity);
  }

  function updateQuantityUI(control, quantity) {
    const addBtn = control.querySelector(".add-btn");
    const selector = control.querySelector(".quantity-selector");
    const display = control.querySelector(".quantity-display");
    if (quantity > 0) {
      addBtn.style.display = "none";
      selector.style.display = "flex";
      display.textContent = quantity;
    } else {
      addBtn.style.display = "flex";
      selector.style.display = "none";
    }
  }

  // --- LÓGICA DE LOGIN Y AUTENTICACIÓN (PARA COMENSALES Y DUEÑOS) ---
  if (myAccountBtn) {
    myAccountBtn.addEventListener("click", () => {
      if (!auth.currentUser) {
        loginModalOverlay.style.display = "flex"; // Muestra el modal de login
      } else {
        window.location.href = "favorites.html"; // Redirige a favoritos si ya está logueado
      }
    });
  }

  if (loginModalCloseBtn) {
    loginModalCloseBtn.addEventListener("click", () => {
      loginModalOverlay.style.display = "none"; // Cierra el modal
    });
  }

  if (loginModalOverlay) {
    loginModalOverlay.addEventListener("click", (event) => {
      if (event.target === loginModalOverlay) {
        loginModalOverlay.style.display = "none";
      }
    });
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await auth.signInWithPopup(provider);
      } catch (error) {
        console.error("Error during Google login:", error);
        showToast("Error during login. Please try again.", "error");
      }
    });
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      // User is logged in
      myAccountBtn.textContent = user.displayName || user.email;
      logoutText.style.display = "inline";

      // *** Lógica INTELIGENTE para upsert de comensales (QUEDA IGUAL) ***
      const userRoleResponse = await fetch(`/api/users/${user.uid}/role`);
      let userRole = null;
      if (userRoleResponse.ok) {
        const roleData = await userRoleResponse.json();
        userRole = roleData.role;
      }

      const restaurantBtn = document.getElementById("my-restaurant");
      if (userRole === "customer") {
        restaurantBtn.style.display = "none";
      } else {
        restaurantBtn.style.display = "flex";
      }

      if (userRole !== "owner") {
        await upsertUser(user, "customer"); // Esto lo guardará en 'invited'
      } else {
        console.log(
          `User ${user.uid} is an owner. Skipping customer upsert in menu.js.`
        );
      }

      await loadUserFavorites(user.uid);
      favoritesCountDisplay.style.display = "flex";
      if (favoritesCounter) {
        favoritesCounter.textContent = currentUserFavorites.size;
      }
      loginModalOverlay.style.display = "none";

      if (currentRestaurantId) {
        updateDishLikeButtons();
      }
      updateDishLikeButtons();
    } else {
      myAccountBtn.textContent = "Soy Comensal";
      logoutText.style.display = "none";
      favoritesCountDisplay.style.display = "none";
      currentUserFavorites.clear();

      const restaurantBtn = document.getElementById("my-restaurant");
      restaurantBtn.style.display = "flex";

      updateDishLikeButtons();
    }
  });

  async function upsertUser(user, role) {
    try {
      const response = await fetch("/api/users/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          role: role,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to upsert user:", errorData.error);
      } else {
        console.log(
          `User ${user.uid} profile upserted successfully as '${role}'.`
        );
      }
    } catch (error) {
      console.error("Error calling upsert user API:", error);
    }
  }

  // Lógica para cerrar sesión
  if (logoutText) {
    logoutText.addEventListener("click", async () => {
      try {
        await auth.signOut();
        await showLogoutModal({ duration: 2500 }); // 2.5 s
      } catch (error) {
        console.error("Error during logout:", error);
        showToast("Error during logout. Please try again.", "error");
      }
    });
  }

  async function loadUserFavorites(uid) {
    try {
      const favoritesSnapshot = await db
        .collection("invited")
        .doc(uid)
        .collection("favorites")
        .get();
      currentUserFavorites.clear();
      favoritesSnapshot.forEach((doc) => {
        currentUserFavorites.add(doc.id);
      });
      console.log(
        "User favorites loaded in menu.js:",
        currentUserFavorites.size
      );
      if (favoritesCounter) {
        favoritesCounter.textContent = currentUserFavorites.size;
      }
    } catch (error) {
      console.error("Error loading user favorites in menu.js:", error);
    }
  }

  function updateDishLikeButtons() {
    document.querySelectorAll(".dish-like-btn").forEach((button) => {
      const dishId = button.dataset.dishId;
      const svgPath = button.querySelector("svg path");
      if (currentUserFavorites.has(dishId)) {
        button.classList.add("liked");
        if (svgPath) svgPath.setAttribute("fill", "currentColor");
      } else {
        button.classList.remove("liked");
        if (svgPath) svgPath.setAttribute("fill", "none");
      }
    });
  }

  async function handleDishLikeClick(event) {
    const button = event.currentTarget;
    const dishId = button.dataset.dishId;
    const user = auth.currentUser;

    if (!user) {
      showToast("Debes iniciar sesión para dar like.", "warning");
      return;
    }

    // Permitir que el usuario intente dar like para mostrar mensaje de restricción

    const likeDocRef = db
      .collection("invited")
      .doc(user.uid)
      .collection("dailyLikes")
      .doc(dishId);

    try {
      // Verificar si ya existe un like en las últimas 24 horas
      const likeDoc = await likeDocRef.get();

      if (likeDoc.exists) {
        const likeData = likeDoc.data();
        const likeTimestamp = likeData.timestamp;

        if (likeTimestamp) {
          const now = new Date();
          const likeTime = likeTimestamp.toDate();
          const timeDifference = now - likeTime;
          const hoursElapsed = timeDifference / (1000 * 60 * 60);
          //const secondsElapsed = timeDifference / 1000;

          if (hoursElapsed < 24) {
            //if (secondsElapsed < 30) {
            showToast(
              "Solo puedes dar un like por día. Inténtalo nuevamente mañana.",
              "warning"
            );
            return;
          }
        }
      }

      const idToken = await user.getIdToken();

      const response = await fetch(`/api/dishes/${dishId}/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "like" }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al dar like al plato.");
      }

      const result = await response.json();

      // ✅ Guardar el nuevo like en dailyLikes para control de tiempo
      await likeDocRef.set({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // ✅ Cambiar icono en el botón pero mantenerlo habilitado para futuras validaciones
      button.innerHTML = "❤️";
      button.disabled = false;
      button.classList.add("liked");

      showToast("¡Gracias por tu like!", "success");

      // ✅ Actualizar contador de likes en pantalla
      const likesCountEl = document.getElementById(`likes-count-${dishId}`);
      if (likesCountEl) {
        likesCountEl.innerText = `${result.likesCount} me gusta`;
      }

      // ✅ Actualizar el likesCount en allCardsData para mantener sincronización
      allCardsData.forEach(card => {
        if (card.dishes && Array.isArray(card.dishes)) {
          card.dishes.forEach(dish => {
            if (dish.id === dishId) {
              dish.likesCount = result.likesCount;
            }
          });
        }
      });

      // Actualizar el contador de favoritos del usuario
      if (favoritesCounter) {
        const currentCount = parseInt(favoritesCounter.textContent) || 0;
        favoritesCounter.textContent = currentCount + 1;
      }

      // Actualizar el contador de corazones dinámico del restaurante
      updateTotalLikesCounter();
    } catch (error) {
      console.error("Error al dar like:", error);
      showToast("Hubo un error al registrar tu like.", "error");
    }
  }

  function setupMyRestaurantButton() {
    if (!myRestaurantButton) return;
    myRestaurantButton.textContent = "Mi Restaurante";
    myRestaurantButton.disabled = false;

    myRestaurantButton.onclick = async () => {
      myRestaurantButton.textContent = "Verificando...";
      myRestaurantButton.disabled = true;

      const user = auth.currentUser;
      if (user) {
        const userRoleResponse = await fetch(`/api/users/${user.uid}/role`);
        if (!userRoleResponse.ok) {
          showToast("Error verifying user role. Please try again.", "error");
          myRestaurantButton.textContent = "Mi Restaurante";
          myRestaurantButton.disabled = false;
          return;
        }
        const userRoleData = await userRoleResponse.json();
        const userRole = userRoleData.role;

        if (userRole === "owner") {
          window.location.href = "/dashboard.html";
        } else {
          showToast(
            "You do not have permission to access the restaurant dashboard.",
            "warning"
          );
          myRestaurantButton.textContent = "Mi Restaurante";
          myRestaurantButton.disabled = false;
        }
      } else {
        window.location.href = "/login.html";
      }
    };
  }

  async function checkUserRole(uid) {
    try {
      const response = await fetch(`/api/users/${uid}/role`);
      if (!response.ok) {
        console.error("Failed to fetch user role.");
        return null;
      }
      const data = await response.json();
      return data.role;
    } catch (error) {
      console.error("Error fetching user role from API:", error);
      return null;
    }
  }

  window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
      if (myRestaurantButton) {
        myRestaurantButton.textContent = "Mi Restaurante";
        myRestaurantButton.disabled = false;
      }
      if (auth.currentUser) {
        loadUserFavorites(auth.currentUser.uid);
      }
    }
  });

  async function initializeMenuPage() {
    const urlParams = new URLSearchParams(window.location.search);
    currentRestaurantId = urlParams.get("restaurantId");
    const cardIdFromUrl = urlParams.get("cardId"); // Obtener cardId de la URL

    if (!currentRestaurantId) {
      return handlePageError("ID de restaurante no encontrado en la URL.");
    }

    try {
      const restaurantResponse = await fetch(
        `/api/restaurants/${currentRestaurantId}`
      );
      if (!restaurantResponse.ok)
        throw new Error("Error fetching restaurant details.");
      currentRestaurant = await restaurantResponse.json();
      if (currentRestaurant.error) throw new Error(currentRestaurant.error);

      const menuResponse = await fetch(
        `/api/restaurants/${currentRestaurantId}/menu`
      );
      if (!menuResponse.ok) throw new Error("Error fetching menu data.");
      allCardsData = await menuResponse.json();
      if (allCardsData.error) throw new Error(allCardsData.error);

      // Establecer currentCardId ANTES de llamar updateUI
      if (
        cardIdFromUrl &&
        allCardsData.find((card) => card.id === cardIdFromUrl)
      ) {
        currentCardId = cardIdFromUrl;
      } else {
        currentCardId = allCardsData.length > 0 ? allCardsData[0].id : null;
      }

      updateUI();
    } catch (error) {
      console.error("Error initializing menu page:", error);
      handlePageError(`Could not load restaurant menu: ${error.message}`);
    }
  }

  function updateUI() {
    if (!currentRestaurant) return;

    // No necesitamos más el background image ya que tenemos el nuevo diseño
    restaurantNameElement.textContent = currentRestaurant.name || "Restaurante";
    restaurantDescriptionElement.textContent = currentRestaurant.description;

    // Actualizar logo del restaurante
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
      locationElement.textContent = currentRestaurant.district || "Ubicación no disponible";
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
    
    // Actualizar contador de corazones dinámico
    const totalLikesElement = document.getElementById("restaurant-total-likes");
    if (totalLikesElement) {
      updateTotalLikesCounter();
    }

    // Actualizar tipo de atención (delivery/local)
    const deliveryIconElement = document.getElementById("restaurant-delivery-icon");
    const deliveryTextElement = document.getElementById("restaurant-delivery-text");
    if (deliveryIconElement && deliveryTextElement) {
      let deliveryText = "";
      let deliveryIcon = "";
      
      if (currentRestaurant.hasDelivery && currentRestaurant.hasLocalService) {
        deliveryText = "Delivery y atención local";
        deliveryIcon = "🚚🏪";
      } else if (currentRestaurant.hasDelivery) {
        deliveryText = "Solo delivery";
        deliveryIcon = "🚚";
      } else if (currentRestaurant.hasLocalService) {
        deliveryText = "Solo atención en local";
        deliveryIcon = "🏪";
      } else {
        deliveryText = "Sin atención disponible";
        deliveryIcon = "❌";
      }
      
      deliveryIconElement.textContent = deliveryIcon;
      deliveryTextElement.textContent = deliveryText;
    }

    // Actualizar estado del restaurante
    updateRestaurantStatus();

    if (shareButton) {
      shareButton.style.display = "flex";
      shareButton.removeEventListener("click", handleShareRestaurant);
      shareButton.addEventListener("click", handleShareRestaurant);
    }

    const pageUrl = window.location.href;
    const imageUrl =
      currentRestaurant.photoUrl ||
      "https://placehold.co/600x200/555/FFF?text=Restaurant";
    const pageTitle = `Menu of ${currentRestaurant.name} | Almuerzos Perú`;
    const pageDescription =
      currentRestaurant.description ||
      `Explore the delicious menu of ${currentRestaurant.name} on Almuerzos Perú.`;

    const updateMetaTag = (id, content) => {
      const tag = document.getElementById(id);
      if (tag) tag.setAttribute("content", content);
    };

    updateMetaTag("og-url", pageUrl);
    updateMetaTag("og-title", pageTitle);
    updateMetaTag("og-description", pageDescription);
    updateMetaTag("og-image", imageUrl);
    updateMetaTag("twitter-url", pageUrl);
    updateMetaTag("twitter-title", pageTitle);
    updateMetaTag("twitter-description", pageDescription);
    updateMetaTag("twitter-image", imageUrl);

    if (allCardsData.length > 0) {
      renderCardTabs();

      // Mostrar la carta correspondiente (ya sea de URL o primera carta)
      if (currentCardId) {
        displayDishesForCard(currentCardId);
      }

      // Actualizar el contador de corazones dinámico
      updateTotalLikesCounter();
    } else {
      cardsNav.innerHTML = '<p style="color: white;">No cards available.</p>';
      dishesContainer.innerHTML =
        "<p>No dishes to display for this restaurant.</p>";
    }
  }

  function updateURLWithCardId(cardId) {
    const url = new URL(window.location);
    url.searchParams.set("cardId", cardId);

    // Actualizar la URL sin recargar la página
    window.history.replaceState({}, "", url);

    console.log("URL actualizada con cardId:", cardId);
  }

  function renderCardTabs() {
    cardsNav.innerHTML = "";

    allCardsData.forEach((card, index) => {
      const button = document.createElement("button");
      button.className = "card-tab";
      // Activar solo la carta que corresponde al currentCardId
      if (card.id === currentCardId) {
        button.classList.add("active");
      }
      button.textContent = card.name;
      button.dataset.cardId = card.id;
      button.onclick = () => {
        // Actualizar el currentCardId
        currentCardId = card.id;

        // Remover clase active de todos los botones
        document.querySelectorAll(".card-tab").forEach((tab) => {
          tab.classList.remove("active");
        });

        // Activar el botón clickeado
        button.classList.add("active");

        // Actualizar la URL con el nuevo cardId
        updateURLWithCardId(card.id);

        // Mostrar los platos de la carta seleccionada
        displayDishesForCard(card.id);

        console.log("Carta seleccionada:", card.name, "ID:", currentCardId);
      };
      cardsNav.appendChild(button);
    });
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
      navigator.userAgent
    );
  }

  async function handleShareRestaurant() {
    if (!currentRestaurant || !currentRestaurant.whatsapp) {
      showToast(
        "No se encontró número de WhatsApp del restaurante.",
        "warning"
      );
      return;
    }

    const message = generateWhatsAppMessageSharing(currentRestaurant);
    const encodedMessage = encodeURIComponent(message);

    const whatsappWebURL = `https://api.whatsapp.com/send?text=${encodedMessage}`;

    const shareData = {
      title: `Descubre ${currentRestaurant.name} en Almuerzos Perú`,
      text: message,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        showToast("Restaurant shared successfully!", "success");
      } else {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareData.url);
          showToast("Link copied to clipboard. Share it!", "success");
        } else {
          showToast(
            "Your browser does not support direct sharing. Copy and paste the link: " +
              window.location.href,
            "info"
          );
        }
      }
    } catch (error) {
      console.error("Error al compartir:", error);
      showToast("Hubo un error al intentar compartir.", "error");
    }
  }

  function generateWhatsAppMessageSharing(currentRestaurant) {
    if (!currentRestaurant) {
      showToast(
        "No se puede generar el mensaje: restaurante no disponible",
        "warning"
      );
      return "";
    }

    const name = currentRestaurant.name || "";
    const link = `https://mvp-almuerzos-peru.vercel.app/menu.html?restaurantId=${
      currentRestaurant.id
    }${currentCardId ? `&cardId=${currentCardId}` : ""}`;
    const yape = currentRestaurant.yape || "No disponible";

    const today = new Date()
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    const todayHours = currentRestaurant.schedule?.[today] || {};
    const from = todayHours.from || "—";
    const to = todayHours.to || "—";

    const fallbackCard =
      allCardsData?.find((card) => card.id === currentCardId) ||
      allCardsData[0];
    const categoryName = fallbackCard?.name || "Almuerzos";
    const dishes = fallbackCard?.dishes || [];

    let message = `👋 ¡Hola! Hoy tenemos platos caseros recién hechos en *${name}* 🍽️\n\n`;

    if (link) {
      message += `📌 Puedes ver nuestra carta aquí: 👉 ${link}\n\n`;
    }

    message += `🍽️ *${categoryName}*\n`;

    if (dishes.length === 0) {
      message += `❌ Actualmente no hay platos disponibles para esta categoría.\n`;
    } else {
      dishes.forEach((dish) => {
        message += `❤️ ${dish.name} – S/ ${dish.price.toFixed(2)}\n`;
      });
    }

    message += `\n🕒 *Horario de atención (hoy):*\n${from} – ${to}\n`;
    message += `📱 *Yape:* ${yape}\n\n`;
    message += `📥 ¿Quieres separar tu plato? Escríbenos por aquí y te lo dejamos listo 🤗\n\n`;
    message += `✨ ¡Gracias por preferirnos! ¡Buen provecho! ✨`;

    return message;
  }

  async function displayDishesForCard(cardId) {
    const selectedCard = allCardsData.find((card) => card.id === cardId);
    dishesContainer.innerHTML = ""; // Clear existing dishes

    if (
      !selectedCard ||
      !selectedCard.dishes ||
      selectedCard.dishes.length === 0
    ) {
      dishesContainer.innerHTML =
        '<p style="text-align: center;">No dishes in this menu category.</p>';
      return;
    }

    const activeDishes = selectedCard.dishes.filter((dish) => dish.isActive);

    if (activeDishes.length === 0) {
      dishesContainer.innerHTML =
        '<p style="text-align: center;">No active dishes in this menu category.</p>';
      return;
    }

    window.activeDishesMap = {};
    activeDishes.forEach((dish) => {
      window.activeDishesMap[dish.id] = dish;
    });

    activeDishes.forEach((dish) => {
      const dishItem = document.createElement("div");
      dishItem.className = "dish-item";
      const imageUrl =
        dish.photoUrl ||
        `https://placehold.co/160x160/E2E8F0/4A5568?text=${dish.name.substring(
          0,
          3
        )}`;

      const heartIcon = currentUserFavorites.has(dish.id) ? "❤️" : "🤍";

      dishItem.innerHTML = `
      <div class="dish-image-wrapper">
          <img src="${imageUrl}" alt="${dish.name}">
          <div class="dish-like-control">
              <button class="like-button dish-like-btn" data-dish-id="${
                dish.id
              }">${heartIcon}</button>
          </div>
      </div>
      <div class="dish-details">
          <h3 title="${dish.name}">${dish.name}</h3>
          <p title="S/. ${dish.price.toFixed(2)}">S/. ${dish.price.toFixed(2)}</p>
          <p class="likes-count" id="likes-count-${dish.id}">${dish.likesCount || 0} me gusta</p>
      </div>
      <div class="quantity-container">
        <div class="quantity-control" data-dish-id="${
          dish.id
        }" data-dish-name="${dish.name}" data-dish-price="${dish.price}">
            <button class="quantity-btn add-btn">+</button>
            <div class="quantity-selector">
                <button class="quantity-btn minus-btn">-</button>
                <span class="quantity-display">${
                  shoppingCart[dish.id] || 0
                }</span>
                <button class="quantity-btn plus-btn">+</button>
            </div>
        </div>
        <div class="comment-button-container" data-dish-id="${dish.id}"></div>
      </div>
    `;
      dishesContainer.appendChild(dishItem);
    });

    setupQuantityControls();
    setupLikeControls();
    renderCommentIcons(); // <-- ✅ AÑADIR ESTA LÍNEA
  }
  function setupLikeControls() {
    document
      .querySelectorAll(".dish-like-control .like-button")
      .forEach(async (button) => {
        if (button.dataset.listenersInitialized) return;

        const dishId = button.dataset.dishId;
        const user = auth.currentUser;

        if (!user) {
          button.innerHTML = "🤍";
          return;
        }

        // Verificar si el usuario ya dio like a este plato (en favorites)
        const favoriteDoc = await db
          .collection("invited")
          .doc(user.uid)
          .collection("favorites")
          .doc(dishId)
          .get();

        if (favoriteDoc.exists) {
          button.innerHTML = "❤️";
          button.disabled = false;
          button.classList.add("liked");
        } else {
          button.innerHTML = "🤍";
          button.disabled = false;
        }

        // Asignar listener
        button.addEventListener("click", handleDishLikeClick);
        button.dataset.listenersInitialized = true;
      });
  }
  function openCommentModal(dishId) {
    const dish = window.activeDishesMap?.[dishId];
    if (!dish) return;

    document.getElementById("commentDishImage").src =
      dish.photoUrl || "https://placehold.co/160x160";
    document.getElementById("commentDishName").textContent = dish.name;
    document.getElementById("commentText").value = "";
    resetCommentUI();

    document.getElementById("commentModalOverlay").style.display = "flex";

    document.getElementById("omitCommentBtn").onclick = () => {
      document.getElementById("commentModalOverlay").style.display = "none";
    };

    document.getElementById("submitCommentBtn").onclick = () => {
      const comment = document.getElementById("commentText").value.trim();
      const user = firebase.auth().currentUser;
      const submitBtn = document.getElementById("submitCommentBtn");

      // Cambiar estado visual del botón
      submitBtn.textContent = "Enviando...";
      submitBtn.classList.add("sending");

      const commentContent = {
        invitedId: user.uid,
        dishId: dishId,
        content: comment,
        restaurantId: currentRestaurantId,
      };

      submitDishComment(commentContent);

      // Marcar como enviado
      window.sentComments[dishId] = true;

      // Eliminar el dishId del localStorage
      const stored = JSON.parse(localStorage.getItem("commentedDishes")) || [];
      const updated = stored.filter((id) => id !== dishId);
      localStorage.setItem("commentedDishes", JSON.stringify(updated));

      setTimeout(() => {
        submitBtn.textContent = "Enviar comentario";
        submitBtn.classList.remove("sending");
        document.getElementById("commentModalOverlay").style.display = "none";
        showCustomToast("Comentario enviado con éxito");
        toggleCommentIcon(dishId, 0);
      }, 1000);
    };
  }

  function showCustomToast(message) {
    const toast = document.getElementById("custom-toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
      toast.classList.add("hidden");
    }, 3000);
  }
  async function submitDishComment({ invitedId, dishId, content }) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error("Usuario no autenticado.");
      }

      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dishId,
          content,
          invitedId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al guardar el comentario.");
      }
      return data;
    } catch (err) {
      console.error("❌ Error al enviar comentario:", err.message);
      throw err;
    }
  }
  const commentText = document.getElementById("commentText");
  const progressBar = document.getElementById("progressBar");
  const charCounter = document.getElementById("charCounter"); // Asegúrate de tener este elemento en el HTML
  const maxLength = commentText.maxLength;

  commentText.addEventListener("input", () => {
    const length = commentText.value.length;
    const progress = (length / maxLength) * 100;

    // Actualizar barra
    progressBar.style.width = `${progress}%`;

    // Actualizar contador de caracteres
    charCounter.textContent = `${length} / ${maxLength}`;

    // Resetear clases de color
    commentText.classList.remove("border-green", "border-yellow", "border-red");
    charCounter.classList.remove("text-green", "text-yellow", "text-red"); // si usas colores dinámicos en texto
    progressBar.classList.remove("bg-green", "bg-yellow", "bg-red"); // opcional si usas clases para color

    // Aplicar color según el progreso
    if (progress < 50) {
      progressBar.style.backgroundColor = "#4caf50"; // verde
      commentText.classList.add("border-green");
      charCounter.classList.add("text-green");
    } else if (progress < 90) {
      progressBar.style.backgroundColor = "#ffc107"; // amarillo
      commentText.classList.add("border-yellow");
      charCounter.classList.add("text-yellow");
    } else {
      progressBar.style.backgroundColor = "#f44336"; // rojo
      commentText.classList.add("border-red");
      charCounter.classList.add("text-red");
    }
  });
  function resetCommentUI() {
    const textarea = document.getElementById("commentText");
    const progressBar = document.getElementById("progressBar");

    textarea.value = "";
    progressBar.style.width = "0%";
    progressBar.style.backgroundColor = "#f7bd00"; // color inicial

    // Reset de clases de borde
    textarea.classList.remove("border-green", "border-yellow", "border-red");
    textarea.classList.add("border-yellow"); // color por defecto
    charCounter.textContent = `0 / ${maxLength}`;
  }

  function showLogoutModal({ duration = 2400 } = {}) {
    return new Promise((resolve) => {
      // Overlay
      const overlay = document.createElement("div");
      overlay.className = "logout-modal__overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Sesión cerrada correctamente");

      // Tarjeta del modal
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

      // Programar autocierre
      const close = () => {
        overlay.classList.add("logout-modal--closing");
        // Espera a que termine la animación y limpia
        const removeAfter = () => {
          overlay.remove();
          resolve();
        };
        overlay.addEventListener("animationend", removeAfter, { once: true });
        // Fallback por si no dispara animationend
        setTimeout(removeAfter, 350);
      };

      setTimeout(close, duration);
    });
  }

  initializeMenuPage();
  setupMyRestaurantButton();
  
  // Actualizar el estado del restaurante cada minuto
  setInterval(updateRestaurantStatus, 60000);
});
