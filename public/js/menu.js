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
    // 1. VERIFICAR LA SESIÓN PRIMERO
    const user = auth.currentUser; // Usamos el método de Firebase, que es más seguro

    if (!user) {
      // 2. SI NO HAY USUARIO, ABRIR EL MODAL DE LOGIN
      loginModalOverlay.style.display = "flex";
      showToast("Por favor, inicia sesión para realizar un pedido.", "info");
      return; // Detenemos la función aquí
    }

    // 3. SI HAY USUARIO, CONTINUAMOS CON TU LÓGICA ORIGINAL
    if (!currentRestaurant || !currentRestaurant.whatsapp) {
      return showToast(
        "No se encontró el número de WhatsApp del restaurante.",
        "warning"
      );
    }

    // Tu función original para crear el mensaje detallado
    const message = generateWhatsAppMessage();

    if (message) {
      const encoded = encodeURIComponent(message);
      const link = `https://api.whatsapp.com/send?phone=${currentRestaurant.whatsapp}&text=${encoded}`;
      window.open(link, "_blank");
    }
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

      addBtn.onclick = () => updateCart(dishId, 1, control);
      minusBtn.onclick = () =>
        updateCart(dishId, (shoppingCart[dishId] || 0) - 1, control);
      plusBtn.onclick = () =>
        updateCart(dishId, (shoppingCart[dishId] || 0) + 1, control);
      control.dataset.listenersInitialized = true; // Marcar como inicializado
    });
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
        showToast("You have been logged out.", "info");
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

    const likeDocRef = db
      .collection("invited")
      .doc(user.uid)
      .collection("dailyLikes")
      .doc(dishId);

    try {
      const likeDoc = await likeDocRef.get();

      if (likeDoc.exists) {
        const { timestamp } = likeDoc.data();
        const now = Date.now();

        // 🕒 Bloquear por 24 horas (1 día)
        if (now - timestamp.toMillis() < 24 * 60 * 60 * 1000) {
          showToast("Ya diste like hoy. Intenta nuevamente mañana.", "info");
          return;
        }
      }

      // ✅ 1. Guardar el nuevo like
      await likeDocRef.set({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // ✅ 2. Incrementar likesCount del plato
      await db
        .collection("dishes")
        .doc(dishId)
        .update({
          likesCount: firebase.firestore.FieldValue.increment(1),
        });

      // ✅ 3. Cambiar icono en el botón
      button.innerHTML = "❤️";
      button.disabled = true;

      // ✅ 4. Actualizar contador de likes en pantalla
      const likesCountEl = document.getElementById(`likes-count-${dishId}`);
      if (likesCountEl) {
        const currentLikes = parseInt(likesCountEl.innerText) || 0;
        likesCountEl.innerText = `${currentLikes + 1} me gustas`;
      }

      showToast("¡Gracias por tu like!", "success");
    } catch (error) {
      console.error("Error al dar like diario:", error);
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

      updateUI();
    } catch (error) {
      console.error("Error initializing menu page:", error);
      handlePageError(`Could not load restaurant menu: ${error.message}`);
    }
  }

  function updateUI() {
    if (!currentRestaurant) return;

    menuBanner.style.backgroundImage = `url('${
      currentRestaurant.photoUrl ||
      "https://placehold.co/600x200/555/FFF?text=Restaurant"
    }')`;
    restaurantNameElement.textContent = currentRestaurant.name;

    restaurantDescriptionElement.textContent = currentRestaurant.description;

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

      displayDishesForCard(allCardsData[0].id);
    } else {
      cardsNav.innerHTML = '<p style="color: white;">No cards available.</p>';
      dishesContainer.innerHTML =
        "<p>No dishes to display for this restaurant.</p>";
    }
  }

  function renderCardTabs() {
    cardsNav.innerHTML = "";

    allCardsData.forEach((card, index) => {
      const button = document.createElement("button");
      button.className = "card-tab";
      if (index === 0) button.classList.add("active");
      button.textContent = card.name;
      button.dataset.cardId = card.id;
      button.onclick = () => displayDishesForCard(card.id);
      cardsNav.appendChild(button);
    });
  }

  async function handleShareRestaurant() {
    if (!currentRestaurant) {
      showToast(
        "Cannot share: restaurant information not available.",
        "warning"
      );
      return;
    }

    const shareData = {
      title: `Discover ${currentRestaurant.name} on Almuerzos Perú!`,
      text: `Check out the delicious menu of ${currentRestaurant.name} on Almuerzos Perú.`,
      url: window.location.href,
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
      console.error("Error sharing:", error);
      if (error.name === "AbortError") {
        showToast("Sharing cancelled.", "info");
      } else {
        showToast("Error attempting to share.", "error");
      }
    }
  }

  async function displayDishesForCard(cardId) {
    document
      .querySelectorAll(".card-tab")
      .forEach((tab) =>
        tab.classList.toggle("active", tab.dataset.cardId === cardId)
      );

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
                                    <h3>${dish.name}</h3>
                                    <p>S/. ${dish.price.toFixed(2)}</p>
                                    <p class="likes-count" id="likes-count-${
                                      dish.id
                                    }">${dish.likesCount || 0} me gustas</p> 
                                </div>
                                <div class="quantity-control" data-dish-id="${
                                  dish.id
                                }" data-dish-name="${
        dish.name
      }" data-dish-price="${dish.price}">
                                    <button class="quantity-btn add-btn">+</button>
                                    <div class="quantity-selector">
                                        <button class="quantity-btn minus-btn">-</button>
                                        <span class="quantity-display">${
                                          shoppingCart[dish.id] || 0
                                        }</span>
                                        <button class="quantity-btn plus-btn">+</button>
                                    </div>
                                </div>
                            `;
      dishesContainer.appendChild(dishItem);
    });
    setupQuantityControls();
    setupLikeControls();
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

        const likeDoc = await db
          .collection("invited")
          .doc(user.uid)
          .collection("dailyLikes")
          .doc(dishId)
          .get();

        if (likeDoc.exists) {
          const { timestamp } = likeDoc.data();
          const now = Date.now();

          if (now - timestamp.toMillis() < 3 * 60 * 1000) {
            button.innerHTML = "❤️";
            button.disabled = true;
          } else {
            button.innerHTML = "🤍";
            button.disabled = false;
          }
        } else {
          button.innerHTML = "🤍";
          button.disabled = false;
        }

        // Asignar listener
        button.addEventListener("click", handleDishLikeClick);
        button.dataset.listenersInitialized = true;
      });
  }

  initializeMenuPage();
  setupMyRestaurantButton();
});
