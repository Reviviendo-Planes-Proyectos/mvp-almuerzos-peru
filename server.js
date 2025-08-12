const express = require("express");
const path = require("path");
const admin = require("firebase-admin");
const sharp = require("sharp");
const fs = require("fs").promises;

const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  // Producción: usar variable de entorno (Vercel)
  try {
    const jsonString = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      "base64"
    ).toString("utf-8");
    serviceAccount = JSON.parse(jsonString);
    console.log("✅ Using Firebase credentials from environment variable");
  } catch (error) {
    console.error(
      "❌ Error decoding FIREBASE_SERVICE_ACCOUNT_BASE64:",
      error.message
    );
    process.exit(1);
  }
} else {
  // Desarrollo local: usar archivo serviceAccountKey.json

  try {
    serviceAccount = require("./serviceAccountKey.json");
    console.log("✅ Using Firebase credentials from serviceAccountKey.json");
  } catch (error) {
    console.error("❌ Error loading serviceAccountKey.json:", error.message);
    console.error(
      "💡 Para desarrollo local, crea el archivo serviceAccountKey.json en la raíz del proyecto"
    );
    console.error(
      "💡 Para producción, configura la variable de entorno FIREBASE_SERVICE_ACCOUNT_BASE64"
    );
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "cashma-8adfb.appspot.com",
});

const db = admin.firestore();
const authAdmin = admin.auth();

async function authenticateAndAuthorize(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("Authentication failed: No Bearer token provided.");
    return res.status(401).json({ error: "Unauthorized: No token provided." });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await authAdmin.verifyIdToken(idToken);
    req.user = decodedToken;

    const userDoc = await db.collection("users").doc(req.user.uid).get();

    if (!userDoc.exists) {
      console.warn(
        `Authorization failed: User ${req.user.uid} not found in 'users' collection.`
      );
      return res
        .status(403)
        .json({
          error: "Forbidden: User profile not found in owners database.",
        });
    }

    const userData = userDoc.data();
    req.user.role = userData.role;

    if (userData.role !== "owner") {
      console.warn(
        `Authorization failed: User ${req.user.uid} has role '${userData.role}', not 'owner'.`
      );
      return res
        .status(403)
        .json({
          error: "Forbidden: Only restaurant owners can perform this action.",
        });
    }

    next();
  } catch (error) {
    console.error(
      "Error verifying Firebase ID token or getting owner role:",
      error.message
    );
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid token or authentication error." });
  }
}

// Función para optimizar imágenes con Sharp
async function optimizeImage(inputPath, outputPath, options = {}) {
  const { width = 800, quality = 80, format = "jpeg" } = options;

  try {
    // Verificar si el archivo existe
    const stats = await fs.stat(inputPath);
    const fileSizeInMB = stats.size / (1024 * 1024);

    // Verificar si el archivo original excede 50MB
    if (fileSizeInMB > 50) {
      console.error(
        "\x1b[31m%s\x1b[0m",
        `❌ ERROR: La imagen es demasiado grande (${fileSizeInMB.toFixed(
          2
        )}MB). El tamaño máximo permitido es 50MB.`
      );
      return {
        success: false,
        error: "Imagen demasiado grande para procesar",
        originalSize: fileSizeInMB,
      };
    }

    // Validar formato
    const allowedFormats = ["jpeg", "png", "webp"];
    const blockedFormats = ["avif", "heic", "heif"];
    const formatLower = format.toLowerCase();

    // Verificar formatos explícitamente bloqueados
    if (blockedFormats.includes(formatLower)) {
      console.error(
        "\x1b[31m%s\x1b[0m",
        `❌ ERROR: El formato ${format.toUpperCase()} no está soportado. Los formatos AVIF, HEIC y HEIF no son compatibles.`
      );
      return {
        success: false,
        error: `Formato ${format.toUpperCase()} no soportado. Solo se permiten JPEG, PNG o WebP.`,
      };
    }

    // Verificar formatos permitidos
    if (!allowedFormats.includes(formatLower)) {
      console.error(
        "\x1b[31m%s\x1b[0m",
        "❌ ERROR: Solo se permiten formatos JPEG, PNG o WebP."
      );
      return {
        success: false,
        error: "Formato no permitido. Solo JPEG, PNG o WebP.",
      };
    }

    // Procesar la imagen con Sharp
    let sharpInstance = sharp(inputPath).resize(width, null, {
      withoutEnlargement: true,
      fit: "inside",
    });

    // Aplicar formato y compresión
    if (format.toLowerCase() === "jpeg") {
      sharpInstance = sharpInstance.jpeg({ quality });
    } else if (format.toLowerCase() === "png") {
      sharpInstance = sharpInstance.png({ quality });
    } else if (format.toLowerCase() === "webp") {
      sharpInstance = sharpInstance.webp({ quality });
    }

    // Guardar la imagen optimizada
    await sharpInstance.toFile(outputPath);

    // Verificar el tamaño del archivo optimizado
    const optimizedStats = await fs.stat(outputPath);
    const optimizedSizeInMB = optimizedStats.size / (1024 * 1024);

    // Verificar si el archivo optimizado aún excede 50MB
    if (optimizedSizeInMB > 50) {
      await fs.unlink(outputPath); // Eliminar archivo si es muy grande
      console.error(
        "\x1b[31m%s\x1b[0m",
        `❌ ERROR: La imagen optimizada sigue siendo demasiado grande (${optimizedSizeInMB.toFixed(
          2
        )}MB).`
      );
      return {
        success: false,
        error: "Imagen optimizada aún excede el límite de 50MB",
        optimizedSize: optimizedSizeInMB,
      };
    }

    console.log(
      "\x1b[32m%s\x1b[0m",
      `✅ ÉXITO: Imagen optimizada correctamente.`
    );
    console.log(`📊 Tamaño original: ${fileSizeInMB.toFixed(2)}MB`);
    console.log(`📊 Tamaño optimizado: ${optimizedSizeInMB.toFixed(2)}MB`);
    console.log(
      `📊 Reducción: ${(
        ((fileSizeInMB - optimizedSizeInMB) / fileSizeInMB) *
        100
      ).toFixed(1)}%`
    );

    return {
      success: true,
      originalSize: fileSizeInMB,
      optimizedSize: optimizedSizeInMB,
      reduction: (
        ((fileSizeInMB - optimizedSizeInMB) / fileSizeInMB) *
        100
      ).toFixed(1),
      outputPath,
    };
  } catch (error) {
    console.error(
      "\x1b[31m%s\x1b[0m",
      `❌ ERROR al procesar la imagen: ${error.message}`
    );
    return {
      success: false,
      error: error.message,
    };
  }
}

// Endpoint para optimizar imágenes
app.post("/api/optimize-image", async (req, res) => {
  try {
    const { inputPath, outputPath, width, quality, format } = req.body;

    if (!inputPath || !outputPath) {
      return res.status(400).json({
        error: "Se requieren las rutas de entrada y salida",
      });
    }

    const result = await optimizeImage(inputPath, outputPath, {
      width: width || 800,
      quality: quality || 80,
      format: format || "jpeg",
    });

    if (result.success) {
      res.status(200).json({
        message: "Imagen optimizada exitosamente",
        ...result,
      });
    } else {
      res.status(400).json({
        error: result.error,
        ...result,
      });
    }
  } catch (error) {
    console.error("Error en endpoint de optimización:", error);
    res.status(500).json({
      error: "Error interno del servidor",
    });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/users/upsert", async (req, res) => {
  try {
    const { uid, displayName, email, role } = req.body;
    if (!uid || !email) {
      return res.status(400).json({ error: "UID and email are required." });
    }

    const userDocRefInUsers = db.collection("users").doc(uid);
    const userDocRefInInvited = db.collection("invited").doc(uid);

    const existingUserInUsers = await userDocRefInUsers.get();
    const existingUserInInvited = await userDocRefInInvited.get();

    let finalCollection = null;
    let finalRole = null;
    let message = "";

    if (role === "owner") {
      finalCollection = "users";
      finalRole = "owner";

      // CAMBIO CRÍTICO: NO eliminar de invited cuando se convierte en owner
      // Un usuario puede ser TANTO comensal como dueño de restaurante
      if (existingUserInInvited.exists) {
        // Mantener el documento en invited para que pueda seguir comentando
        console.log(`User ${uid} ya existe en 'invited' - manteniendo ambos roles.`);
        message += "User maintains both customer and owner roles. ";
      }

      await userDocRefInUsers.set(
        {
          uid: uid,
          displayName:
            displayName || existingUserInUsers.data()?.displayName || null,
          email: email,
          role: finalRole,
          lastLogin: admin.firestore.FieldValue.serverTimestamp(),

          createdAt: existingUserInUsers.exists
            ? existingUserInUsers.data().createdAt
            : admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      message += `User upserted successfully in 'users' with role 'owner'.`;
      console.log(`User ${uid} upserted as owner.`);
    } else {
      finalCollection = "invited";
      finalRole = "customer";

      // CAMBIO CRÍTICO: Permitir que un owner también sea customer
      // Un usuario puede ser TANTO dueño como comensal
      if (
        existingUserInUsers.exists &&
        existingUserInUsers.data().role === "owner"
      ) {
        console.log(
          `User ${uid} is already an owner but also wants customer role - allowing both roles.`
        );
        message += "User maintains both owner and customer roles. ";
      }

      await userDocRefInInvited.set(
        {
          uid: uid,
          displayName:
            displayName || existingUserInInvited.data()?.displayName || null,
          email: email,
          role: finalRole,
          lastLogin: admin.firestore.FieldValue.serverTimestamp(),
          // createdAt solo si el doc es nuevo en invited
          createdAt: existingUserInInvited.exists
            ? existingUserInInvited.data().createdAt
            : admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      message += `User upserted successfully in 'invited' with role 'customer'.`;
      console.log(`User ${uid} upserted as customer.`);
    }

    return res
      .status(200)
      .json({
        message: message,
        user: { uid, displayName, email, role: finalRole },
      });
  } catch (error) {
    console.error("Error upserting user (owner or invited):", error);
    res
      .status(500)
      .json({ error: "An error occurred on the server while upserting user." });
  }
});

app.get("/api/users/:uid/role", async (req, res) => {
  try {
    const { uid } = req.params;

    const ownerDoc = await db.collection("users").doc(uid).get();
    if (ownerDoc.exists && ownerDoc.data().role === "owner") {
      return res.status(200).json({ role: "owner" });
    }

    const invitedDoc = await db.collection("invited").doc(uid).get();
    if (invitedDoc.exists && invitedDoc.data().role === "customer") {
      return res.status(200).json({ role: "customer" });
    }

    // Si no se encuentra en ninguna colección con un rol reconocido
    return res
      .status(404)
      .json({ error: "User not found or role not recognized." });
  } catch (error) {
    console.error("Error fetching user role from either collection:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

/* async function generateQrPngBlob(text) {
  const dataUrl = await QRCode.toDataURL(text, {
    width: 512,
    errorCorrectionLevel: "M",
    margin: 2,
  });
  const res = await fetch(dataUrl);
  return await res.blob();
}

// Convierte Blob -> File (para usar uploadImageToStorage)
function blobToFile(blob, filename) {
  return new File([blob], filename, { type: "image/png" });
}
 */

app.get('/api/qr', async (req, res) => {
    console.log("este es el request", req);
    
  try {
    const {
      text = '',
      width = '512',
      ecc = 'M',
      margin = '2'
    } = req.query;

    if (!text) {
      return res.status(400).json({ error: 'Missing "text" query param' });
    }


    // Genera un Buffer PNG con qrcode en Node
    const buffer = await QRCode.toBuffer(text, {
      width: Number(width),
      errorCorrectionLevel: ecc,
      margin: Number(margin),
      type: 'png'
    });

    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error('QR error:', err);
    res.status(500).json({ error: 'Failed to generate QR' });
  }
});




app.post("/api/restaurants", authenticateAndAuthorize, async (req, res) => {
  try {
    const {
      userId,
      name,
      description = null,
      district,
      whatsapp,
      photoUrl = null,
      logoUrl = null,
      ruc = null,
      yape = null,
      phone = null,
      hasDelivery = false,
      hasLocalService = false,
      schedule = {},
      location,
      qr = null,
    } = req.body;

    // Verifica que el userId del body coincida con el UID del token
    if (req.user.uid !== userId) {
      return res
        .status(403)
        .json({ error: "Forbidden: Token UID does not match request userId." });
    }
    if (!name) {
      return res.status(400).json({ error: "Restaurant Name is required." });
    }

    // Primero, verifica si ya tiene un restaurante para evitar duplicados
    const existingRestaurantSnapshot = await db
      .collection("restaurants")
      .where("ownerId", "==", userId)
      .limit(1)
      .get();
    if (!existingRestaurantSnapshot.empty) {
      return res
        .status(409)
        .json({ error: "This user already owns a restaurant." });
    }

  
    

    

    const restaurantData = {
      ownerId: userId,
      name,
      description,
      district,
      whatsapp,
      photoUrl,
      logoUrl,
      ruc,
      yape,
      phone,
      hasDelivery,
      hasLocalService,
      location,
      qr,
      schedule: {
        monday: schedule.monday || { from: null, to: null },
        tuesday: schedule.tuesday || { from: null, to: null },
        wednesday: schedule.wednesday || { from: null, to: null },
        thursday: schedule.thursday || { from: null, to: null },
        friday: schedule.friday || { from: null, to: null },
        saturday: schedule.saturday || { from: null, to: null },
        sunday: schedule.sunday || { from: null, to: null },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const restaurantRef = await db
      .collection("restaurants")
      .add(restaurantData);

    res.status(201).json({
      message: "Restaurant successfully registered.",
      restaurantId: restaurantRef.id,
      data: restaurantData,
    });
  } catch (error) {
    console.error("Error registering restaurant:", error);
    if (error.message === "This user already owns a restaurant.") {
      res.status(409).json({ error: error.message });
    } else {
      res.status(500).json({ error: "An error occurred on the server." });
    }
  }
});

app.get(
  "/api/restaurants/user/:userId",
  authenticateAndAuthorize,
  async (req, res) => {
    try {
      const { userId } = req.params;

      if (req.user.uid !== userId) {
        return res
          .status(403)
          .json({
            error: "Forbidden: You can only query your own restaurant.",
          });
      }

      const snapshot = await db
        .collection("restaurants")
        .where("ownerId", "==", userId)
        .limit(1)
        .get();
      if (snapshot.empty) {
        return res
          .status(404)
          .json({ message: "No restaurant found for this user." });
      }
      let restaurantData = {};
      snapshot.forEach((doc) => {
        restaurantData = { id: doc.id, ...doc.data() };
      });
      res.status(200).json(restaurantData);
    } catch (error) {
      console.error("Error fetching restaurant by user:", error);
      res.status(500).json({ error: "An error occurred on the server." });
    }
  }
);

// Endpoint para obtener el total de restaurantes con 5 o más platos
app.get("/api/restaurants-count", async (req, res) => {
  console.log("Count endpoint called with query:", req.query);
  try {
    const { district, search, dish } = req.query;
    let query = db.collection("restaurants");

    if (district && district !== "Todos") {
      query = query.where("district", "==", district);
    }

    const snapshot = await query.get();
    console.log(`Found ${snapshot.size} restaurants total`);
    let validRestaurantsCount = 0;

    const countPromises = snapshot.docs.map(async (doc) => {
      const restaurantData = { id: doc.id, ...doc.data() };
      let totalDishes = 0;

      const cardsSnapshot = await db
        .collection("cards")
        .where("restaurantId", "==", restaurantData.id)
        .get();

      for (const cardDoc of cardsSnapshot.docs) {
        const dishesSnapshot = await db
          .collection("dishes")
          .where("cardId", "==", cardDoc.id)
          .get();

        totalDishes += dishesSnapshot.size;
      }

      console.log(`Restaurant ${restaurantData.name}: ${totalDishes} dishes`);

      // Solo contar restaurantes con 5 o más platos
      if (totalDishes >= 5) {
        // Aplicar filtros de búsqueda si existen
        if (search && search.trim() !== '') {
          const searchTerm = search.toLowerCase().trim();
          if (restaurantData.name && restaurantData.name.toLowerCase().includes(searchTerm)) {
            return 1;
          }
          return 0;
        } else if (dish && dish.trim() !== '') {
          // Verificar si el restaurante tiene el platillo buscado
          const dishTerm = dish.toLowerCase().trim();
          for (const cardDoc of cardsSnapshot.docs) {
            const dishesSnapshot = await db
              .collection("dishes")
              .where("cardId", "==", cardDoc.id)
              .get();
            
            for (const dishDoc of dishesSnapshot.docs) {
              const dishData = dishDoc.data();
              if (dishData.name && dishData.name.toLowerCase().includes(dishTerm)) {
                return 1;
              }
            }
          }
          return 0;
        } else {
          return 1;
        }
      }
      return 0;
    });

    const counts = await Promise.all(countPromises);
    validRestaurantsCount = counts.reduce((sum, count) => sum + count, 0);

    console.log(`Valid restaurants with 5+ dishes: ${validRestaurantsCount}`);
    res.status(200).json({ count: validRestaurantsCount });
  } catch (error) {
    console.error("Error counting restaurants with 5+ dishes:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

app.get("/api/restaurants/:restaurantId", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const doc = await db.collection("restaurants").doc(restaurantId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Restaurant not found." });
    }
    res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error("Error fetching restaurant by ID:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

app.get("/api/restaurants-paginated", async (req, res) => {
  console.log("API restaurants-paginated called with query:", req.query);
  try {
    const { limit = 12, lastDocId, district, search, dish, includeCount = 'false' } = req.query;
    let query = db.collection("restaurants").orderBy("createdAt", "desc");

    if (district && district !== "Todos") {
      query = query.where("district", "==", district);
    }

    if (lastDocId) {
      const lastDocRef = await db
        .collection("restaurants")
        .doc(lastDocId)
        .get();
      if (lastDocRef.exists) {
        query = query.startAfter(lastDocRef);
      }
    }

    const snapshot = await query.limit(parseInt(limit)).get();
    let restaurants = [];

    const restaurantPromises = snapshot.docs.map(async (doc) => {
      const restaurantData = { id: doc.id, ...doc.data() };
      let totalLikes = 0;
      let totalDishes = 0;

      const cardsSnapshot = await db
        .collection("cards")
        .where("restaurantId", "==", restaurantData.id)
        .get();

      for (const cardDoc of cardsSnapshot.docs) {
        const dishesSnapshot = await db
          .collection("dishes")
          .where("cardId", "==", cardDoc.id)
          .get();

        dishesSnapshot.forEach((dishDoc) => {
          totalLikes += dishDoc.data().likesCount || 0;
          totalDishes++;
        });
      }

      restaurantData.totalLikes = totalLikes;
      restaurantData.totalDishes = totalDishes;
      
      // Incluir todos los restaurantes (temporal para debug)
      return restaurantData;
    });

    const restaurantsWithLikes = await Promise.all(restaurantPromises);
    console.log("Restaurants after processing:", restaurantsWithLikes.length);
    
    // Filtrar restaurantes nulos (con menos de 5 platos)
    const validRestaurants = restaurantsWithLikes.filter(restaurant => restaurant !== null);
    console.log("Valid restaurants after filtering nulls:", validRestaurants.length);

    // Filtrar por búsqueda si se proporciona el parámetro search
    if (search && search.trim() !== '') {
      const searchTerm = search.toLowerCase().trim();
      restaurants = validRestaurants.filter(restaurant => 
        restaurant.name && restaurant.name.toLowerCase().includes(searchTerm)
      );
    } else if (dish && dish.trim() !== '') {
      // Filtrar por platillo si se proporciona el parámetro dish
      const dishTerm = dish.toLowerCase().trim();
      const restaurantPromises = validRestaurants.map(async (restaurant) => {
        const cardsSnapshot = await db
          .collection("cards")
          .where("restaurantId", "==", restaurant.id)
          .get();
        
        for (const cardDoc of cardsSnapshot.docs) {
          const dishesSnapshot = await db
            .collection("dishes")
            .where("cardId", "==", cardDoc.id)
            .get();
          
          for (const dishDoc of dishesSnapshot.docs) {
            const dishData = dishDoc.data();
            if (dishData.name && dishData.name.toLowerCase().includes(dishTerm)) {
              return restaurant;
            }
          }
        }
        return null;
      });
      
      const filteredResults = await Promise.all(restaurantPromises);
      restaurants = filteredResults.filter(restaurant => restaurant !== null);
    } else {
      restaurants = validRestaurants;
    }
    
    console.log("Final restaurants to return:", restaurants.length);

    const lastVisible = snapshot.docs[snapshot.docs.length - 1];
    
    // Si se solicita incluir el contador, calcularlo
    let totalCount = null;
    if (includeCount === 'true' && !lastDocId) {
      // Solo calcular en la primera página
      let countQuery = db.collection("restaurants");
      if (district && district !== "Todos") {
        countQuery = countQuery.where("district", "==", district);
      }
      
      const allSnapshot = await countQuery.get();
      const countPromises = allSnapshot.docs.map(async (doc) => {
        const restaurantData = { id: doc.id, ...doc.data() };
        let totalDishes = 0;

        const cardsSnapshot = await db
          .collection("cards")
          .where("restaurantId", "==", restaurantData.id)
          .get();

        for (const cardDoc of cardsSnapshot.docs) {
          const dishesSnapshot = await db
            .collection("dishes")
            .where("cardId", "==", cardDoc.id)
            .get();

          totalDishes += dishesSnapshot.size;
        }

        // Solo contar restaurantes con 1 o más platos que cumplan los filtros (temporal para debug)
        if (totalDishes >= 1) {
          if (search && search.trim() !== '') {
            const searchTerm = search.toLowerCase().trim();
            if (restaurantData.name && restaurantData.name.toLowerCase().includes(searchTerm)) {
              return 1;
            }
            return 0;
          } else if (dish && dish.trim() !== '') {
            const dishTerm = dish.toLowerCase().trim();
            for (const cardDoc of cardsSnapshot.docs) {
              const dishesSnapshot = await db
                .collection("dishes")
                .where("cardId", "==", cardDoc.id)
                .get();
              
              for (const dishDoc of dishesSnapshot.docs) {
                const dishData = dishDoc.data();
                if (dishData.name && dishData.name.toLowerCase().includes(dishTerm)) {
                  return 1;
                }
              }
            }
            return 0;
          } else {
            return 1;
          }
        }
        return 0;
      });
      
      const counts = await Promise.all(countPromises);
      totalCount = counts.reduce((sum, count) => sum + count, 0);
    }

    const response = {
      restaurants: restaurants,
      lastDocId: lastVisible ? lastVisible.id : null,
    };
    
    if (totalCount !== null) {
      response.totalCount = totalCount;
    }
    
    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching paginated restaurants with likes:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

// Endpoint temporal para debug - ver platos por restaurante
app.get("/api/debug/restaurants-dishes", async (req, res) => {
  try {
    const snapshot = await db.collection("restaurants").get();
    const restaurantsDishes = [];

    for (const doc of snapshot.docs) {
      const restaurantData = { id: doc.id, ...doc.data() };
      let totalDishes = 0;

      const cardsSnapshot = await db
        .collection("cards")
        .where("restaurantId", "==", restaurantData.id)
        .get();

      for (const cardDoc of cardsSnapshot.docs) {
        const dishesSnapshot = await db
          .collection("dishes")
          .where("cardId", "==", cardDoc.id)
          .get();

        totalDishes += dishesSnapshot.size;
      }

      restaurantsDishes.push({
        name: restaurantData.name,
        id: restaurantData.id,
        dishes: totalDishes
      });
    }

    res.status(200).json(restaurantsDishes);
  } catch (error) {
    console.error("Error debugging restaurants dishes:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

// Endpoint para obtener distritos únicos donde hay restaurantes registrados
app.get("/api/districts", async (req, res) => {
  try {
    const snapshot = await db.collection("restaurants").get();
    const districts = new Set();

    snapshot.forEach((doc) => {
      const district = doc.data().district;
      if (district && district.trim() !== "") {
        districts.add(district.trim());
      }
    });

    const sortedDistricts = Array.from(districts).sort();
    res.status(200).json(sortedDistricts);
  } catch (error) {
    console.error("Error fetching districts:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

// Endpoint para obtener todos los platillos únicos
app.get("/api/all-dishes", async (req, res) => {
  try {
    const dishesSet = new Set();
    
    // Obtener todos los platillos de todas las cartas
    const dishesSnapshot = await db.collection("dishes").get();
    
    dishesSnapshot.forEach((doc) => {
      const dishData = doc.data();
      if (dishData.name && dishData.name.trim() !== "") {
        dishesSet.add(dishData.name.trim());
      }
    });

    const sortedDishes = Array.from(dishesSet).sort();
    res.status(200).json(sortedDishes);
  } catch (error) {
    console.error("Error fetching dishes:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

// Endpoint para obtener el rating de un restaurante basado en los likes de sus platos
app.get("/api/restaurants/:restaurantId/rating", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    // Verificar que el restaurante existe
    const restaurantDoc = await db.collection("restaurants").doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      return res.status(404).json({ error: "Restaurant not found." });
    }
    
    let totalLikes = 0;
    let totalDishes = 0;
    
    // Obtener todas las cartas del restaurante
    const cardsSnapshot = await db
      .collection("cards")
      .where("restaurantId", "==", restaurantId)
      .get();
    
    // Para cada carta, obtener sus platos y sumar los likes
    for (const cardDoc of cardsSnapshot.docs) {
      const dishesSnapshot = await db
        .collection("dishes")
        .where("cardId", "==", cardDoc.id)
        .get();
      
      dishesSnapshot.forEach((dishDoc) => {
        const dishData = dishDoc.data();
        totalLikes += dishData.likesCount || 0;
        totalDishes++;
      });
    }
    
    // Calcular rating basado en los likes
    let rating = 0;
    let reviewCount = totalLikes;
    
    if (totalDishes > 0) {
      // Algoritmo para convertir likes en rating (de 1 a 5 estrellas)
      const avgLikesPerDish = totalLikes / totalDishes;
      
      // Escala logarítmica para el rating
      if (avgLikesPerDish >= 50) rating = 5.0;
      else if (avgLikesPerDish >= 25) rating = 4.8;
      else if (avgLikesPerDish >= 15) rating = 4.5;
      else if (avgLikesPerDish >= 8) rating = 4.2;
      else if (avgLikesPerDish >= 4) rating = 4.0;
      else if (avgLikesPerDish >= 2) rating = 3.5;
      else if (avgLikesPerDish >= 1) rating = 3.0;
      else rating = 2.5;
    } else {
      // Si no hay platos, usar valores por defecto
      rating = 4.0;
      reviewCount = Math.floor(Math.random() * 500) + 100; // Entre 100-600 reseñas simuladas
    }
    
    res.status(200).json({
      restaurantId,
      rating: parseFloat(rating.toFixed(1)),
      reviewCount,
      totalLikes,
      totalDishes
    });
    
  } catch (error) {
    console.error("Error fetching restaurant rating:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

app.get("/api/restaurants/:restaurantId/menu", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const cardsSnapshot = await db
      .collection("cards")
      .where("restaurantId", "==", restaurantId)
      .where("isActive", "==", true)
      .orderBy("createdAt", "asc")
      .get();

    const menuData = [];
    for (const cardDoc of cardsSnapshot.docs) {
      const card = { id: cardDoc.id, ...cardDoc.data(), dishes: [] };
      const dishesSnapshot = await db
        .collection("dishes")
        .where("cardId", "==", card.id)
        .where("isActive", "==", true)
        .orderBy("createdAt", "asc")
        .get();

      dishesSnapshot.forEach((dishDoc) => {
        const dishData = dishDoc.data();
        card.dishes.push({
          id: dishDoc.id,
          name: dishData.name,
          price: dishData.price,
          photoUrl: dishData.photoUrl,
          isActive: dishData.isActive,
          likesCount: dishData.likesCount || 0,
        });
      });
      menuData.push(card);
    }
    res.status(200).json(menuData);
  } catch (error) {
    console.error("Error fetching restaurant menu:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

app.put(
  "/api/restaurants/:restaurantId",
  authenticateAndAuthorize,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        name,
        description,
        district,
        whatsapp,
        photoUrl,
        logoUrl,
        ruc,
        yape,
        phone,
        hasDelivery,
        hasLocalService,
        schedule,
        location,
        qr,
      } = req.body;
      
      // Log detallado para debug
      console.log('📋 DATOS RECIBIDOS COMPLETOS:', req.body);
      console.log('📋 Datos recibidos para actualizar restaurante:', {
        restaurantId,
        name,
        description,
        district,
        whatsapp,
        photoUrl: photoUrl ? 'Sí tiene imagen' : 'No tiene imagen',
        logoUrl: logoUrl ? 'Sí tiene logo' : 'No tiene logo',
        ruc,
        yape,
        phone,
        hasDelivery,
        hasLocalService,
        schedule,
        location,
        qr
      });
      
      const restaurantDoc = await db
        .collection("restaurants")
        .doc(restaurantId)
        .get();
      if (
        !restaurantDoc.exists ||
        restaurantDoc.data().ownerId !== req.user.uid
      ) {
        return res
          .status(403)
          .json({ error: "Forbidden: You do not own this restaurant." });
      }

      if (!name || !district || !whatsapp) {
        return res.status(400).json({ error: "All fields are required." });
      }

      const restaurantRef = db.collection("restaurants").doc(restaurantId);
      const oldData = restaurantDoc.data();
      const oldPhotoUrl = oldData.photoUrl;
      const updatedData = {
        name: name ?? "",
        description: description ?? null,
        district: district ?? "",
        whatsapp: whatsapp ?? "",
        photoUrl: photoUrl ?? null,
        logoUrl: logoUrl ?? null,
        ruc: ruc ?? null,
        yape: yape ?? null,
        phone: phone ?? null,
        hasDelivery: hasDelivery ?? false,
        hasLocalService: hasLocalService ?? false,
        location: location ?? null,
        qr: qr ?? null,
        schedule: {
          monday: schedule?.monday ?? { from: null, to: null },
          tuesday: schedule?.tuesday ?? { from: null, to: null },
          wednesday: schedule?.wednesday ?? { from: null, to: null },
          thursday: schedule?.thursday ?? { from: null, to: null },
          friday: schedule?.friday ?? { from: null, to: null },
          saturday: schedule?.saturday ?? { from: null, to: null },
          sunday: schedule?.sunday ?? { from: null, to: null },
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      console.log('📋 Datos que se van a guardar en Firestore:', updatedData);
      
      await restaurantRef.update(updatedData);
      
      console.log('✅ Restaurante actualizado exitosamente en Firestore');
      
      // Verificar los datos guardados
      const updatedDoc = await restaurantRef.get();
      console.log('📋 Datos verificados en Firestore después de actualización:', updatedDoc.data());

      if (photoUrl && oldPhotoUrl && photoUrl !== oldPhotoUrl) {
        try {
          const filePath = decodeURIComponent(
            oldPhotoUrl.split("/o/")[1].split("?alt=media")[0]
          );
          const bucket = admin.storage().bucket();
          await bucket.file(filePath).delete();
          console.log(`Old restaurant image deleted: ${filePath}`);
        } catch (storageError) {
          console.error(
            `Could not delete old restaurant image (${oldPhotoUrl}):`,
            storageError.message
          );
        }
      }
      res
        .status(200)
        .json({
          message: "Restaurant successfully updated",
          data: updatedData,
        });
    } catch (error) {
      console.error("Error updating restaurant:", error);
      res.status(500).json({ error: "An error occurred on the server." });
    }
  }
);

app.post("/api/cards", authenticateAndAuthorize, async (req, res) => {
  try {
    const { restaurantId, name } = req.body;

    const restaurantDoc = await db
      .collection("restaurants")
      .doc(restaurantId)
      .get();
    if (
      !restaurantDoc.exists ||
      restaurantDoc.data().ownerId !== req.user.uid
    ) {
      return res
        .status(403)
        .json({ error: "Forbidden: You do not own this restaurant." });
    }

    if (!restaurantId || !name) {
      return res
        .status(400)
        .json({ error: "restaurantId and name are required." });
    }
    const cardData = {
      restaurantId,
      name,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const cardRef = await db.collection("cards").add(cardData);
    res
      .status(201)
      .json({ message: "Card successfully created.", cardId: cardRef.id });
  } catch (error) {
    console.error("Error creating card:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

app.get(
  "/api/restaurants/:restaurantId/cards",
  authenticateAndAuthorize,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;

      const restaurantDoc = await db
        .collection("restaurants")
        .doc(restaurantId)
        .get();
      if (
        !restaurantDoc.exists ||
        restaurantDoc.data().ownerId !== req.user.uid
      ) {
        return res
          .status(403)
          .json({ error: "Forbidden: You do not own this restaurant." });
      }

      const snapshot = await db
        .collection("cards")
        .where("restaurantId", "==", restaurantId)
        .get();
      const cards = [];
      snapshot.forEach((doc) => {
        cards.push({ id: doc.id, ...doc.data() });
      });
      res.status(200).json(cards);
    } catch (error) {
      console.error("Error fetching cards:", error);
      res.status(500).json({ error: "An error occurred on the server." });
    }
  }
);

app.put(
  "/api/cards/:cardId/toggle",
  authenticateAndAuthorize,
  async (req, res) => {
    try {
      const { cardId } = req.params;
      const { isActive } = req.body;

      const cardDoc = await db.collection("cards").doc(cardId).get();
      if (!cardDoc.exists) {
        return res.status(404).json({ error: "Card not found." });
      }
      const restaurantIdOfCard = cardDoc.data().restaurantId;
      const restaurantDoc = await db
        .collection("restaurants")
        .doc(restaurantIdOfCard)
        .get();
      if (
        !restaurantDoc.exists ||
        restaurantDoc.data().ownerId !== req.user.uid
      ) {
        return res
          .status(403)
          .json({ error: "Forbidden: You do not own this card's restaurant." });
      }

      await db.collection("cards").doc(cardId).update({ isActive });
      res
        .status(200)
        .json({ message: `Card ${cardId} updated to ${isActive}` });
    } catch (error) {
      console.error("Error updating card:", error);
      res.status(500).json({ error: "An error occurred on the server." });
    }
  }
);

app.put("/api/cards/:cardId", authenticateAndAuthorize, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { name } = req.body;

    const cardDoc = await db.collection("cards").doc(cardId).get();
    if (!cardDoc.exists) {
      return res.status(404).json({ error: "Card not found." });
    }
    const restaurantIdOfCard = cardDoc.data().restaurantId;
    const restaurantDoc = await db
      .collection("restaurants")
      .doc(restaurantIdOfCard)
      .get();
    if (
      !restaurantDoc.exists ||
      restaurantDoc.data().ownerId !== req.user.uid
    ) {
      return res
        .status(403)
        .json({ error: "Forbidden: You do not own this card's restaurant." });
    }

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Card name cannot be empty." });
    }
    await db.collection("cards").doc(cardId).update({ name });
    res.status(200).json({ message: "Card name successfully updated." });
  } catch (error) {
    console.error("Error updating card name:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

app.delete("/api/cards/:cardId", authenticateAndAuthorize, async (req, res) => {
  try {
    const { cardId } = req.params;

    const cardDoc = await db.collection("cards").doc(cardId).get();
    if (!cardDoc.exists) {
      return res.status(404).json({ error: "Card not found." });
    }
    const restaurantIdOfCard = cardDoc.data().restaurantId;
    const restaurantDoc = await db
      .collection("restaurants")
      .doc(restaurantIdOfCard)
      .get();
    if (
      !restaurantDoc.exists ||
      restaurantDoc.data().ownerId !== req.user.uid
    ) {
      return res
        .status(403)
        .json({ error: "Forbidden: You do not own this card's restaurant." });
    }

    const batch = db.batch();
    const dishesSnapshot = await db
      .collection("dishes")
      .where("cardId", "==", cardId)
      .get();
    const deletionPromises = [];
    dishesSnapshot.forEach((doc) => {
      const dishData = doc.data();
      if (dishData.photoUrl) {
        try {
          const filePath = decodeURIComponent(
            dishData.photoUrl.split("/o/")[1].split("?alt=media")[0]
          );
          deletionPromises.push(
            admin.storage().bucket().file(filePath).delete()
          );
        } catch (e) {
          console.error(
            `Invalid image URL, cannot delete: ${dishData.photoUrl}`,
            e
          );
        }
      }
      batch.delete(doc.ref);
    });
    batch.delete(db.collection("cards").doc(cardId));
    await Promise.all(deletionPromises);
    await batch.commit();
    res
      .status(200)
      .json({ message: `Card ${cardId} and its contents deleted.` });
  } catch (error) {
    console.error("Error deleting card and its contents:", error);
    res
      .status(500)
      .json({ error: "An error occurred on the server during deletion." });
  }
});

app.post("/api/dishes", authenticateAndAuthorize, async (req, res) => {
  try {
    const { cardId, name, price, photoUrl } = req.body;

    const cardDoc = await db.collection("cards").doc(cardId).get();
    if (!cardDoc.exists) {
      return res.status(404).json({ error: "Card not found." });
    }
    const restaurantIdOfCard = cardDoc.data().restaurantId;
    const restaurantDoc = await db
      .collection("restaurants")
      .doc(restaurantIdOfCard)
      .get();
    if (
      !restaurantDoc.exists ||
      restaurantDoc.data().ownerId !== req.user.uid
    ) {
      return res
        .status(403)
        .json({
          error: "Forbidden: You do not own this dish's card or restaurant.",
        });
    }

    if (!cardId || !name || !price) {
      return res
        .status(400)
        .json({ error: "cardId, name, and price are required." });
    }
    const dishData = {
      cardId,
      name,
      price: parseFloat(price),
      isActive: true,
      photoUrl: photoUrl || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      likesCount: 0,
    };
    const dishRef = await db.collection("dishes").add(dishData);
    res
      .status(201)
      .json({
        message: "Dish successfully created.",
        dishId: dishRef.id,
        data: dishData,
      });
  } catch (error) {
    console.error("Error creating dish:", error);
    res.status(500).json({ error: "An error occurred on the server." });
  }
});

app.get(
  "/api/cards/:cardId/dishes",
  authenticateAndAuthorize,
  async (req, res) => {
    try {
      const { cardId } = req.params;

      const cardDoc = await db.collection("cards").doc(cardId).get();
      if (!cardDoc.exists) {
        return res.status(404).json({ error: "Card not found." });
      }
      const restaurantIdOfCard = cardDoc.data().restaurantId;
      const restaurantDoc = await db
        .collection("restaurants")
        .doc(restaurantIdOfCard)
        .get();
      if (
        !restaurantDoc.exists ||
        restaurantDoc.data().ownerId !== req.user.uid
      ) {
        return res
          .status(403)
          .json({ error: "Forbidden: You do not own this card's restaurant." });
      }

      const snapshot = await db
        .collection("dishes")
        .where("cardId", "==", cardId)
        .get();
      const dishes = [];
      snapshot.forEach((doc) => {
        const dishData = doc.data();
        dishes.push({
          id: doc.id,
          name: dishData.name,
          price: dishData.price,
          photoUrl: dishData.photoUrl,
          isActive: dishData.isActive,
          likesCount: dishData.likesCount || 0,
        });
      });
      res.status(200).json(dishes);
    } catch (error) {
      console.error("Error fetching dishes:", error);
      res.status(500).json({ error: "An error occurred on the server." });
    }
  }
);

app.put('/api/dishes/:dishId', authenticateAndAuthorize, async (req, res) => {
    try {
        const { dishId } = req.params;
        const { name, price, photoUrl } = req.body;

        const dishDoc = await db.collection('dishes').doc(dishId).get();
        if (!dishDoc.exists) {
            return res.status(404).json({ error: 'Dish not found.' });
        }
        const cardIdOfDish = dishDoc.data().cardId;
        const cardDoc = await db.collection('cards').doc(cardIdOfDish).get();
        if (!cardDoc.exists) {
            return res.status(500).json({ error: 'Associated card not found.' });
        }
        const restaurantIdOfCard = cardDoc.data().restaurantId;
        const restaurantDoc = await db.collection('restaurants').doc(restaurantIdOfCard).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this dish\'s card or restaurant.' });
        }

        if (!name || !price) {
            return res.status(400).json({ error: 'Name and price are required.' });
        }
        const dishRef = db.collection('dishes').doc(dishId);
        const oldData = dishDoc.data();
        const oldPhotoUrl = oldData.photoUrl;
        const updatedData = { name, price: parseFloat(price), photoUrl: photoUrl || oldPhotoUrl };
        await dishRef.update(updatedData);
        if (photoUrl && oldPhotoUrl && photoUrl !== oldPhotoUrl) {
            try {
                const filePath = decodeURIComponent(oldPhotoUrl.split('/o/')[1].split('?alt=media')[0]);
                await admin.storage().bucket().file(filePath).delete();
                console.log(`Old dish image deleted successfully: ${filePath}`);
            } catch (storageError) {
                console.error(`Could not delete old dish image from Storage (${oldPhotoUrl}):`, storageError.message);
            }
        }
        res.status(200).json({ message: 'Dish successfully updated', data: updatedData });
    } catch (error) {
        console.error('Error updating dish:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

app.put('/api/dishes/:dishId/toggle', authenticateAndAuthorize, async (req, res) => {
    try {
        const { dishId } = req.params;
        const { isActive } = req.body;


        const dishDoc = await db.collection('dishes').doc(dishId).get();
        if (!dishDoc.exists) {
            return res.status(404).json({ error: 'Dish not found.' });
        }
        const cardIdOfDish = dishDoc.data().cardId;
        const cardDoc = await db.collection('cards').doc(cardIdOfDish).get();
        if (!cardDoc.exists) {
            return res.status(500).json({ error: 'Associated card not found.' });
        }
        const restaurantIdOfCard = cardDoc.data().restaurantId;
        const restaurantDoc = await db.collection('restaurants').doc(restaurantIdOfCard).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this dish\'s card or restaurant.' });
        }

        await db.collection('dishes').doc(dishId).update({ isActive });
        res.status(200).json({ message: `Dish ${dishId} updated to ${isActive}` });
    } catch (error) {
        console.error('Error updating dish:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

app.delete('/api/dishes/:dishId', authenticateAndAuthorize, async (req, res) => {
    try {
        const { dishId } = req.params;


        const dishDoc = await db.collection('dishes').doc(dishId).get();
        if (!dishDoc.exists) {
            return res.status(404).json({ error: 'Dish not found.' });
        }
        const cardIdOfDish = dishDoc.data().cardId;
        const cardDoc = await db.collection('cards').doc(cardIdOfDish).get();
        if (!cardDoc.exists) {
            return res.status(500).json({ error: 'Associated card not found.' });
        }
        const restaurantIdOfCard = cardDoc.data().restaurantId;
        const restaurantDoc = await db.collection('restaurants').doc(restaurantIdOfCard).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this dish\'s card or restaurant.' });
        }

        const dishRef = db.collection('dishes').doc(dishId);
        const photoUrl = dishDoc.data().photoUrl;
        if (photoUrl) {
            try {
                const filePath = decodeURIComponent(photoUrl.split('/o/')[1].split('?alt=media')[0]);
                await admin.storage().bucket().file(filePath).delete();
                console.log(`Dish image deleted from Storage: ${filePath}`);
            } catch (storageError) {
                console.error(`Could not delete dish image from Storage (${photoUrl}):`, storageError.message);
            }
        }
        await dishRef.delete();
        res.status(200).json({ message: 'Dish successfully deleted.' });
    } catch (error) {
        console.error('Error deleting dish:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});




app.delete(
  "/api/dishes/:dishId",
  authenticateAndAuthorize,
  async (req, res) => {
    try {
      const { dishId } = req.params;

      const dishDoc = await db.collection("dishes").doc(dishId).get();
      if (!dishDoc.exists) {
        return res.status(404).json({ error: "Dish not found." });
      }
      const cardIdOfDish = dishDoc.data().cardId;
      const cardDoc = await db.collection("cards").doc(cardIdOfDish).get();
      if (!cardDoc.exists) {
        return res.status(500).json({ error: "Associated card not found." });
      }
      const restaurantIdOfCard = cardDoc.data().restaurantId;
      const restaurantDoc = await db
        .collection("restaurants")
        .doc(restaurantIdOfCard)
        .get();
      if (
        !restaurantDoc.exists ||
        restaurantDoc.data().ownerId !== req.user.uid
      ) {
        return res
          .status(403)
          .json({
            error: "Forbidden: You do not own this dish's card or restaurant.",
          });
      }

      const dishRef = db.collection("dishes").doc(dishId);
      const photoUrl = dishDoc.data().photoUrl;
      if (photoUrl) {
        try {
          const filePath = decodeURIComponent(
            photoUrl.split("/o/")[1].split("?alt=media")[0]
          );
          await admin.storage().bucket().file(filePath).delete();
          console.log(`Dish image deleted from Storage: ${filePath}`);
        } catch (storageError) {
          console.error(
            `Could not delete dish image from Storage (${photoUrl}):`,
            storageError.message
          );
        }
      }
      await dishRef.delete();
      res.status(200).json({ message: "Dish successfully deleted." });
    } catch (error) {
      console.error("Error deleting dish:", error);
      res.status(500).json({ error: "An error occurred on the server." });
    }
  }
);

app.post("/api/dishes/:dishId/like", async (req, res) => {
  const { dishId } = req.params;
  const { action } = req.body; // 'like' o 'unlike'

  const authHeader = req.headers.authorization;
  let currentUserUid = null;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn(
      "Authentication failed for like operation: No Bearer token provided."
    );
    return res
      .status(401)
      .json({ error: "Unauthorized: Login required to like/unlike dishes." });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await authAdmin.verifyIdToken(idToken);
    currentUserUid = decodedToken.uid;
  } catch (error) {
    console.error(
      "Error verifying Firebase ID token for like operation:",
      error.message
    );
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid token for like operation." });
  }

  if (!["like", "unlike"].includes(action)) {
    return res
      .status(400)
      .json({ error: 'Invalid action. Must be "like" or "unlike".' });
  }

  const dishRef = db.collection("dishes").doc(dishId);

  const userFavoriteRef = db
    .collection("invited")
    .doc(currentUserUid)
    .collection("favorites")
    .doc(dishId);

  try {
    await db.runTransaction(async (transaction) => {
      const dishDoc = await transaction.get(dishRef);
      const userFavoriteDoc = await transaction.get(userFavoriteRef);

      if (!dishDoc.exists) {
        throw new Error("Plato no encontrado.");
      }

      let currentLikes = dishDoc.data().likesCount || 0;
      let newLikes = currentLikes;

      if (action === "like") {
        if (userFavoriteDoc.exists) {
          return res
            .status(200)
            .json({ likesCount: currentLikes, message: "Already liked." });
        }
        newLikes = currentLikes + 1;
        transaction.set(userFavoriteRef, {
          likedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else if (action === "unlike") {
        if (!userFavoriteDoc.exists) {
          return res
            .status(200)
            .json({ likesCount: currentLikes, message: "Not liked yet." });
        }
        newLikes = Math.max(0, currentLikes - 1);
        transaction.delete(userFavoriteRef);
      }

      transaction.update(dishRef, { likesCount: newLikes });
      res
        .status(200)
        .json({
          likesCount: newLikes,
          message: `Likes updated to ${newLikes}`,
        });
    });
  } catch (error) {
    console.error(
      "Error al actualizar likes del plato o favoritos del usuario:",
      error
    );
    res
      .status(500)
      .json({ error: `Error al procesar el 'me gusta': ${error.message}` });
  }
});

app.post("/api/comments", async (req, res) => {
  try {
    const { invitedId, dishId, content, restaurantId } = req.body;

    console.log("📝 Recibiendo comentario:", { invitedId, dishId, content, restaurantId });

    // Validaciones básicas
    if (!content || !dishId || !invitedId) {
      console.error("❌ Faltan campos requeridos:", { content: !!content, dishId: !!dishId, invitedId: !!invitedId });
      return res
        .status(400)
        .json({ error: "dishId, invitedId y content son requeridos." });
    }

    // Validar que el plato existe y obtener información del restaurante
    const dishDoc = await db.collection("dishes").doc(dishId).get();
    if (!dishDoc.exists) {
      console.error("❌ Plato no encontrado:", dishId);
      return res
        .status(404)
        .json({ error: "El plato especificado no existe." });
    }

    const dishData = dishDoc.data();
    let actualRestaurantId = restaurantId;

    // Si no se proporcionó restaurantId, obtenerlo desde el plato (OBLIGATORIO)
    if (!actualRestaurantId) {
      console.log('⚠️ No se proporcionó restaurantId, obteniendo desde el plato...');
      const cardDoc = await db.collection("cards").doc(dishData.cardId).get();
      if (cardDoc.exists) {
        actualRestaurantId = cardDoc.data().restaurantId;
        console.log('🔍 RestaurantId obtenido de la carta:', actualRestaurantId);
      } else {
        console.error('❌ Carta no encontrada:', dishData.cardId);
      }
    }

    // Validar que tenemos un restaurantId válido (CRÍTICO)
    if (!actualRestaurantId) {
      console.error('❌ No se pudo determinar el restaurantId para el comentario');
      console.error('❌ Datos del plato:', dishData);
      return res
        .status(400)
        .json({ error: "No se pudo determinar el restaurante del plato. El comentario no puede ser guardado sin esta información." });
    }

    // Validar que el usuario invitado existe
    const invitedDoc = await db.collection("invited").doc(invitedId).get();
    if (!invitedDoc.exists) {
      console.error("❌ Usuario invitado no encontrado:", invitedId);
      return res
        .status(404)
        .json({ error: "El usuario especificado no existe." });
    }

    // Validar que el restaurante existe
    const restaurantDoc = await db.collection("restaurants").doc(actualRestaurantId).get();
    if (!restaurantDoc.exists) {
      console.error("❌ Restaurante no encontrado:", actualRestaurantId);
      return res
        .status(404)
        .json({ error: "El restaurante especificado no existe." });
    }

    // Crear el comentario con toda la información necesaria
    const commentData = {
      invitedId: invitedId,
      dishId,
      restaurantId: actualRestaurantId, // GARANTIZAR que siempre esté presente
      content,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    console.log("💾 Guardando comentario con datos completos:", commentData);
    const commentRef = await db.collection("comments_dishes").add(commentData);

    console.log("✅ Comentario guardado exitosamente con ID:", commentRef.id);
    console.log("🏪 Asociado al restaurante:", actualRestaurantId);

    res.status(201).json({
      message: "Comentario guardado exitosamente.",
      commentId: commentRef.id,
      restaurantId: actualRestaurantId,
      data: commentData,
    });
  } catch (error) {
    console.error("❌ Error al guardar comentario:", error);
    res.status(500).json({ error: "Ocurrió un error en el servidor." });
  }
});






// Endpoint para obtener comentarios de un restaurante
app.get("/api/restaurants/:restaurantId/comments", authenticateAndAuthorize, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    console.log("🔍 Buscando comentarios para restaurante:", restaurantId);

    // Verificar que el usuario es dueño del restaurante
    const restaurantDoc = await db.collection("restaurants").doc(restaurantId).get();
    if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
      console.log("❌ Usuario no es dueño del restaurante");
      return res.status(403).json({ 
        error: "Forbidden: You do not own this restaurant." 
      });
    }

    // 1. Obtener todas las cards del restaurante
    const cardsSnapshot = await db.collection("cards")
      .where("restaurantId", "==", restaurantId)
      .get();

    console.log("🗂️ Cards encontradas:", cardsSnapshot.size);

    if (cardsSnapshot.empty) {
      return res.status(200).json({ comments: [] });
    }

    // 2. Obtener todos los dishes de esas cards
    const cardIds = cardsSnapshot.docs.map(doc => doc.id);
    console.log("🍽️ IDs de cartas:", cardIds);
    
    const dishesPromises = cardIds.map(cardId => 
      db.collection("dishes").where("cardId", "==", cardId).get()
    );
    const dishesSnapshots = await Promise.all(dishesPromises);
    
    const dishes = {};
    dishesSnapshots.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        dishes[doc.id] = doc.data();
      });
    });

    const dishIds = Object.keys(dishes);
    console.log("🥘 Platos encontrados:", dishIds.length);
    
    if (dishIds.length === 0) {
      return res.status(200).json({ comments: [] });
    }

    // 3. Obtener comentarios de esos dishes
    const commentsPromises = dishIds.map(dishId => 
      db.collection("comments_dishes").where("dishId", "==", dishId).get()
    );
    const commentsSnapshots = await Promise.all(commentsPromises);
    
    const comments = [];
    const userIds = new Set();

    commentsSnapshots.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        const commentData = doc.data();
        comments.push({
          id: doc.id,
          ...commentData
        });
        if (commentData.invitedId) {
          userIds.add(commentData.invitedId);
        }
      });
    });

    console.log("💬 Comentarios encontrados:", comments.length);
    console.log("👥 Usuarios únicos:", userIds.size);

    // 4. Obtener información de usuarios (invited)
    const users = {};
    if (userIds.size > 0) {
      const usersPromises = Array.from(userIds).map(userId => 
        db.collection("invited").doc(userId).get()
      );
      const usersSnapshots = await Promise.all(usersPromises);
      
      usersSnapshots.forEach(doc => {
        if (doc.exists) {
          users[doc.id] = doc.data();
        }
      });
    }

    console.log("👤 Información de usuarios obtenida:", Object.keys(users).length);

    // 5. Combinar toda la información
    const enrichedComments = comments.map(comment => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      dish: {
        id: comment.dishId,
        name: dishes[comment.dishId]?.name || "Plato no encontrado",
        price: dishes[comment.dishId]?.price || 0,
        photoUrl: dishes[comment.dishId]?.photoUrl || null
      },
      user: {
        id: comment.invitedId,
        displayName: users[comment.invitedId]?.displayName || "Usuario desconocido",
        email: users[comment.invitedId]?.email || null
      }
    }));

    // Ordenar por fecha de creación (más recientes primero)
    enrichedComments.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt.toDate() - a.createdAt.toDate();
    });

    console.log("✅ Comentarios enriquecidos y ordenados:", enrichedComments.length);

    res.status(200).json({ 
      comments: enrichedComments,
      total: enrichedComments.length 
    });

  } catch (error) {
    console.error("❌ Error al obtener comentarios:", error);
    res.status(500).json({ error: "Ocurrió un error en el servidor." });
  }
});


// Endpoint de debug para comentarios
app.get("/api/debug/comments", authenticateAndAuthorize, async (req, res) => {
  try {
    console.log("🔍 DEBUG: Obteniendo todos los comentarios");
    
    const commentsSnapshot = await db.collection("comments_dishes").get();
    const allComments = [];
    
    commentsSnapshot.docs.forEach(doc => {
      allComments.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || 'Sin fecha'
      });
    });
    
    console.log("📄 Total de comentarios en la base de datos:", allComments.length);
    
    res.status(200).json({
      total: allComments.length,
      comments: allComments
    });
    
  } catch (error) {
    console.error("❌ Error en debug de comentarios:", error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});




// Endpoint temporal para corregir comentarios sin restaurantId
app.post("/api/fix-comments", async (req, res) => {
  try {
    console.log('🔧 Iniciando corrección de comentarios sin restaurantId...');
    
    // Obtener todos los comentarios y verificar cuáles necesitan corrección
    const commentsSnapshot = await db.collection("comments_dishes").get();
    const commentsToFix = [];
    
    commentsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!data.restaurantId) {
        commentsToFix.push({ id: doc.id, data });
      }
    });
    
    if (commentsToFix.length === 0) {
      return res.json({ message: "No hay comentarios que corregir", fixed: 0 });
    }
    
    console.log(`📝 Encontrados ${commentsToFix.length} comentarios para corregir`);
    
    let fixed = 0;
    for (const comment of commentsToFix) {
      try {
        // Obtener el plato
        const dishDoc = await db.collection("dishes").doc(comment.data.dishId).get();
        if (!dishDoc.exists) continue;
        
        // Obtener la carta
        const cardDoc = await db.collection("cards").doc(dishDoc.data().cardId).get();
        if (!cardDoc.exists) continue;
        
        const restaurantId = cardDoc.data().restaurantId;
        if (restaurantId) {
          await db.collection("comments_dishes").doc(comment.id).update({
            restaurantId: restaurantId
          });
          console.log(`✅ Comentario ${comment.id} corregido con restaurantId: ${restaurantId}`);
          fixed++;
        }
      } catch (error) {
        console.error(`❌ Error corrigiendo comentario ${comment.id}:`, error);
      }
    }
    
    res.json({ 
      message: `Comentarios corregidos exitosamente`, 
      fixed: fixed,
      total: commentsToFix.length 
    });
    
  } catch (error) {
    console.error("❌ Error corrigiendo comentarios:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ===== ANALYTICS ENDPOINTS =====

// Endpoint para registrar eventos de analytics
// Endpoint para tracking de analytics con documento único por tipo
app.post("/api/analytics/track", async (req, res) => {
  try {
    const { eventType, restaurantId, cardId, metadata = {} } = req.body;

    // Mapear eventos en inglés a español y sus subcolecciones
    const eventTypeMapping = {
      'restaurant_share': {
        spanish: 'compartir_restaurante',
        subcollection: 'compartir_normal'
      },
      'share_restaurant_whatsapp': {
        spanish: 'compartir_restaurante',
        subcollection: 'compartir_normal'
      },
      'share_card_whatsapp': {
        spanish: 'compartir_carta_whatsapp',
        subcollection: 'compartir_whatsapp'
      },
      'order_button_click': {
        spanish: 'hacer_pedido',
        subcollection: 'hacer_pedido'
      }
    };

    // Solo permitir los 3 tipos de eventos específicos
    const validEventTypes = [
      'restaurant_share',
      'share_restaurant_whatsapp',
      'share_card_whatsapp',
      'order_button_click'
    ];

    if (!validEventTypes.includes(eventType)) {
      return res.status(400).json({ 
        error: "Tipo de evento inválido. Solo se permiten eventos de los 3 botones específicos",
        eventosPermitidos: [
          "restaurant_share (Compartir Restaurante)",
          "share_restaurant_whatsapp (Compartir Restaurante)",
          "share_card_whatsapp (Compartir Carta por WhatsApp)",
          "order_button_click (Hacer Pedido)"
        ]
      });
    }

    // Validar que restaurantId esté presente
    if (!restaurantId) {
      return res.status(400).json({ error: "restaurantId es requerido" });
    }

    // Obtener configuración del evento
    const eventConfig = eventTypeMapping[eventType];
    const eventoEnEspanol = eventConfig.spanish;
    const subcollectionName = eventConfig.subcollection;

    // Referencia directa al documento por tipo de evento
    const docRef = db.collection('analytics')
      .doc(subcollectionName); // Contador directo por tipo de evento

    // Obtener el documento actual o crear uno nuevo
    const doc = await docRef.get();
    
    let contadorClics = 1;
    if (doc.exists) {
      // Si existe, incrementar el contador
      contadorClics = (doc.data().contadorClics || 0) + 1;
    }

    // Datos a actualizar/crear
    const analyticsData = {
      eventType: eventoEnEspanol,
      ultimoTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      contadorClics: contadorClics,
      descripcionContador: `${contadorClics} ${contadorClics === 1 ? 'clic' : 'clics'} en ${eventoEnEspanol.replace('_', ' ')}`,
      ultimoRestauranteId: restaurantId // Mantener registro del último restaurante
    };

    // Actualizar o crear el documento único
    await docRef.set(analyticsData, { merge: true });

    console.log(`📊 Contador actualizado: ${eventoEnEspanol} = ${contadorClics} clics`);
    
    res.status(201).json({ 
      exito: true,
      success: true, // Mantener para compatibilidad
      eventoRegistrado: eventoEnEspanol,
      subcoleccion: subcollectionName,
      contadorActual: contadorClics,
      mensaje: "Contador actualizado exitosamente" 
    });

  } catch (error) {
    console.error("❌ Error registrando evento de analytics:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Endpoint para obtener estadísticas de un restaurante (requiere autenticación)
app.get("/api/analytics/restaurant/:restaurantId", authenticateAndAuthorize, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { startDate, endDate, eventType } = req.query;

    // Verificar que el usuario sea dueño del restaurante
    const restaurantDoc = await db.collection("restaurants").doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      return res.status(404).json({ error: "Restaurante no encontrado" });
    }

    const restaurantData = restaurantDoc.data();
    if (restaurantData.userId !== req.user.uid) {
      return res.status(403).json({ error: "No tienes permisos para ver estas estadísticas" });
    }

    // Construir la consulta
    let query = db.collection("analytics").where("restaurantId", "==", restaurantId);

    // Filtros opcionales
    if (eventType) {
      query = query.where("eventType", "==", eventType);
    }

    if (startDate) {
      query = query.where("date", ">=", startDate);
    }

    if (endDate) {
      query = query.where("date", "<=", endDate);
    }

    // Ordenar por timestamp descendente
    query = query.orderBy("timestamp", "desc");

    const snapshot = await query.get();
    const events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
    }));

    // Calcular estadísticas resumidas
    const stats = {
      total: events.length,
      byEventType: {},
      byDate: {},
      byCard: {}
    };

    events.forEach(event => {
      // Por tipo de evento
      stats.byEventType[event.eventType] = (stats.byEventType[event.eventType] || 0) + 1;
      
      // Por fecha
      stats.byDate[event.date] = (stats.byDate[event.date] || 0) + 1;
      
      // Por carta (si aplica)
      if (event.cardId) {
        stats.byCard[event.cardId] = (stats.byCard[event.cardId] || 0) + 1;
      }
    });

    res.json({
      restaurantId,
      stats,
      events: events.slice(0, 100) // Limitar a los últimos 100 eventos
    });

  } catch (error) {
    console.error("❌ Error getting analytics:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Endpoint para obtener contadores específicos de analytics por categorías (3 botones específicos)
app.get("/api/analytics/contadores/:restaurantId", authenticateAndAuthorize, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    // Verificar que el usuario sea dueño del restaurante
    const restaurantDoc = await db.collection("restaurants").doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      return res.status(404).json({ error: "Restaurante no encontrado" });
    }

    const restaurantData = restaurantDoc.data();
    if (restaurantData.userId !== req.user.uid) {
      return res.status(403).json({ error: "No tienes permisos para ver estas estadísticas" });
    }

    // Construir la consulta base
    let query = db.collection("analytics").where("restaurantId", "==", restaurantId);

    // Filtros opcionales por fecha
    if (fechaInicio) {
      query = query.where("date", ">=", fechaInicio);
    }

    if (fechaFin) {
      query = query.where("date", "<=", fechaFin);
    }

    const snapshot = await query.get();
    const eventos = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Contadores específicos para los 3 botones únicamente
    const contadores = {
      boton_compartir_restaurante: 0,
      boton_compartir_carta_whatsapp: 0,
      boton_hacer_pedido: 0
    };

    // Contar solo los eventos específicos de los 3 botones (usando campos en español)
    eventos.forEach(evento => {
      // Priorizar campos en español, usar inglés como fallback
      const tipoEvento = evento.eventoTipo || evento.tipoEvento || evento.eventType;
      
      switch (tipoEvento) {
        case 'compartir_restaurante':
        case 'restaurant_share':
        case 'share_restaurant_whatsapp':
          contadores.boton_compartir_restaurante++;
          break;
        case 'compartir_carta_whatsapp':
        case 'share_card_whatsapp':
          contadores.boton_compartir_carta_whatsapp++;
          break;
        case 'hacer_pedido':
        case 'order_button_click':
          contadores.boton_hacer_pedido++;
          break;
        // Ignorar cualquier otro tipo de evento
      }
    });

    console.log(`📊 Contadores calculados para restaurante ${restaurantId}:`, {
      compartir_restaurante: contadores.boton_compartir_restaurante,
      compartir_carta_whatsapp: contadores.boton_compartir_carta_whatsapp,
      hacer_pedido: contadores.boton_hacer_pedido
    });

    // Respuesta limpia y segmentada para los 3 botones específicos
    res.json({
      restauranteId: restaurantId,
      periodo: {
        fechaInicio: fechaInicio || null,
        fechaFin: fechaFin || null
      },
      botones: {
        compartir_restaurante: {
          nombre: "Compartir Restaurante",
          clics: contadores.boton_compartir_restaurante,
          descripcion: "Clics en el botón de compartir restaurante"
        },
        compartir_carta_whatsapp: {
          nombre: "Compartir Carta por WhatsApp",
          clics: contadores.boton_compartir_carta_whatsapp,
          descripcion: "Clics en el botón de compartir carta por WhatsApp"
        },
        hacer_pedido: {
          nombre: "Hacer Pedido",
          clics: contadores.boton_hacer_pedido,
          descripcion: "Clics en el botón de hacer pedido"
        }
      },
      resumen: {
        totalClicsContabilizados: contadores.boton_compartir_restaurante + contadores.boton_compartir_carta_whatsapp + contadores.boton_hacer_pedido,
        ultimaActualizacion: new Date().toLocaleString('es-ES', {
          timeZone: 'America/Lima',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      },
      estado: "exitoso",
      mensaje: "Contadores de botones obtenidos correctamente"
    });

  } catch (error) {
    console.error("❌ Error obteniendo contadores de botones:", error);
    res.status(500).json({ 
      error: "Error interno del servidor",
      mensaje: "No se pudieron obtener los contadores de botones" 
    });
  }
});

// Endpoint para obtener resumen simplificado de 3 botones con contadores
app.get("/api/analytics/resumen/:restaurantId", authenticateAndAuthorize, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    // Verificar que el usuario sea dueño del restaurante
    const restaurantDoc = await db.collection("restaurants").doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      return res.status(404).json({ error: "Restaurante no encontrado" });
    }

    const restaurantData = restaurantDoc.data();
    if (restaurantData.userId !== req.user.uid) {
      return res.status(403).json({ error: "No tienes permisos para ver estas estadísticas" });
    }

    // Construir la consulta base
    let query = db.collection("analytics").where("restaurantId", "==", restaurantId);

    // Filtros opcionales por fecha
    if (fechaInicio) {
      query = query.where("date", ">=", fechaInicio);
    }

    if (fechaFin) {
      query = query.where("date", "<=", fechaFin);
    }

    const snapshot = await query.get();
    const eventos = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Contadores para los 3 botones
    let compartirRestaurante = 0;
    let compartirCartaWhatsapp = 0;
    let hacerPedido = 0;

    // Contar eventos
    eventos.forEach(evento => {
      const tipoEvento = evento.eventoTipo || evento.tipoEvento || evento.eventType;
      
      switch (tipoEvento) {
        case 'compartir_restaurante':
        case 'restaurant_share':
        case 'share_restaurant_whatsapp':
          compartirRestaurante++;
          break;
        case 'compartir_carta_whatsapp':
        case 'share_card_whatsapp':
          compartirCartaWhatsapp++;
          break;
        case 'hacer_pedido':
        case 'order_button_click':
          hacerPedido++;
          break;
      }
    });

    // Respuesta con exactamente 3 registros
    const resumen = [
      {
        id: 1,
        boton: "Compartir Restaurante",
        clics: compartirRestaurante,
        descripcion: "Botón para compartir el restaurante"
      },
      {
        id: 2,
        boton: "Compartir Carta por WhatsApp",
        clics: compartirCartaWhatsapp,
        descripcion: "Botón para compartir carta por WhatsApp"
      },
      {
        id: 3,
        boton: "Hacer Pedido",
        clics: hacerPedido,
        descripcion: "Botón para realizar pedidos"
      }
    ];

    res.json({
      restauranteId: restaurantId,
      totalRegistros: 3,
      periodo: {
        fechaInicio: fechaInicio || null,
        fechaFin: fechaFin || null
      },
      resumen: resumen,
      totalClicsGeneral: compartirRestaurante + compartirCartaWhatsapp + hacerPedido,
      ultimaActualizacion: new Date().toLocaleString('es-ES', {
        timeZone: 'America/Lima'
      })
    });

  } catch (error) {
    console.error("❌ Error obteniendo resumen de botones:", error);
    res.status(500).json({ 
      error: "Error interno del servidor",
      mensaje: "No se pudo obtener el resumen de botones" 
    });
  }
});

// Endpoint para obtener estadísticas globales (solo para administradores)
app.get("/api/analytics/global", authenticateAndAuthorize, async (req, res) => {
  try {
    // Verificar que el usuario sea administrador (opcional - puedes ajustar esto)
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    const userData = userDoc.data();
    
    if (userData.role !== "admin" && userData.role !== "owner") {
      return res.status(403).json({ error: "No tienes permisos para ver estadísticas globales" });
    }

    const { startDate, endDate, eventType } = req.query;

    // Construir la consulta
    let query = db.collection("analytics");

    if (eventType) {
      query = query.where("eventType", "==", eventType);
    }

    if (startDate) {
      query = query.where("date", ">=", startDate);
    }

    if (endDate) {
      query = query.where("date", "<=", endDate);
    }

    const snapshot = await query.get();
    const events = snapshot.docs.map(doc => doc.data());

    // Calcular estadísticas globales
    const globalStats = {
      total: events.length,
      byEventType: {},
      byRestaurant: {},
      byDate: {}
    };

    events.forEach(event => {
      // Por tipo de evento
      globalStats.byEventType[event.eventType] = (globalStats.byEventType[event.eventType] || 0) + 1;
      
      // Por restaurante
      globalStats.byRestaurant[event.restaurantId] = (globalStats.byRestaurant[event.restaurantId] || 0) + 1;
      
      // Por fecha
      globalStats.byDate[event.date] = (globalStats.byDate[event.date] || 0) + 1;
    });

    res.json(globalStats);

  } catch (error) {
    console.error("❌ Error getting global analytics:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ===== FIN ANALYTICS ENDPOINTS =====



// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📱 Aplicación lista para usar`);
});


module.exports = app;
