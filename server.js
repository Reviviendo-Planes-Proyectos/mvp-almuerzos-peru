
const express = require('express');
const path = require('path');
const admin = require('firebase-admin');
const sharp = require('sharp');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
        const jsonString = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(jsonString);
    } catch (error) {
        console.error('❌ Error decoding FIREBASE_SERVICE_ACCOUNT_BASE64:', error.message);
        process.exit(1);
    }
} else {
    console.error('❌ No service account environment variable found.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'cashma-8adfb.appspot.com'
});


const db = admin.firestore();
const authAdmin = admin.auth();

async function authenticateAndAuthorize(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn("Authentication failed: No Bearer token provided.");
        return res.status(401).json({ error: 'Unauthorized: No token provided.' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await authAdmin.verifyIdToken(idToken);
        req.user = decodedToken;


        const userDoc = await db.collection('users').doc(req.user.uid).get();

        if (!userDoc.exists) {
            console.warn(`Authorization failed: User ${req.user.uid} not found in 'users' collection.`);
            return res.status(403).json({ error: 'Forbidden: User profile not found in owners database.' });
        }

        const userData = userDoc.data();
        req.user.role = userData.role;


        if (userData.role !== 'owner') {
            console.warn(`Authorization failed: User ${req.user.uid} has role '${userData.role}', not 'owner'.`);
            return res.status(403).json({ error: 'Forbidden: Only restaurant owners can perform this action.' });
        }

        next();
    } catch (error) {
        console.error('Error verifying Firebase ID token or getting owner role:', error.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid token or authentication error.' });
    }
}

// Función para optimizar imágenes con Sharp
async function optimizeImage(inputPath, outputPath, options = {}) {
    const {
        width = 800,
        quality = 80,
        format = 'jpeg'
    } = options;

    try {
        // Verificar si el archivo existe
        const stats = await fs.stat(inputPath);
        const fileSizeInMB = stats.size / (1024 * 1024);

        // Verificar si el archivo original excede 5MB
        if (fileSizeInMB > 5) {
            console.error('\x1b[31m%s\x1b[0m', `❌ ERROR: La imagen es demasiado grande (${fileSizeInMB.toFixed(2)}MB). El tamaño máximo permitido es 5MB.`);
            return {
                success: false,
                error: 'Imagen demasiado grande para procesar',
                originalSize: fileSizeInMB
            };
        }

        // Validar formato
        const allowedFormats = ['jpeg', 'png', 'webp'];
        const blockedFormats = ['avif', 'heic', 'heif'];
        const formatLower = format.toLowerCase();
        
        // Verificar formatos explícitamente bloqueados
        if (blockedFormats.includes(formatLower)) {
            console.error('\x1b[31m%s\x1b[0m', `❌ ERROR: El formato ${format.toUpperCase()} no está soportado. Los formatos AVIF, HEIC y HEIF no son compatibles.`);
            return {
                success: false,
                error: `Formato ${format.toUpperCase()} no soportado. Solo se permiten JPEG, PNG o WebP.`
            };
        }
        
        // Verificar formatos permitidos
        if (!allowedFormats.includes(formatLower)) {
            console.error('\x1b[31m%s\x1b[0m', '❌ ERROR: Solo se permiten formatos JPEG, PNG o WebP.');
            return {
                success: false,
                error: 'Formato no permitido. Solo JPEG, PNG o WebP.'
            };
        }

        // Procesar la imagen con Sharp
        let sharpInstance = sharp(inputPath)
            .resize(width, null, {
                withoutEnlargement: true,
                fit: 'inside'
            });

        // Aplicar formato y compresión
        if (format.toLowerCase() === 'jpeg') {
            sharpInstance = sharpInstance.jpeg({ quality });
        } else if (format.toLowerCase() === 'png') {
            sharpInstance = sharpInstance.png({ quality });
        } else if (format.toLowerCase() === 'webp') {
            sharpInstance = sharpInstance.webp({ quality });
        }

        // Guardar la imagen optimizada
        await sharpInstance.toFile(outputPath);

        // Verificar el tamaño del archivo optimizado
        const optimizedStats = await fs.stat(outputPath);
        const optimizedSizeInMB = optimizedStats.size / (1024 * 1024);

        // Verificar si el archivo optimizado aún excede 5MB
        if (optimizedSizeInMB > 5) {
            await fs.unlink(outputPath); // Eliminar archivo si es muy grande
            console.error('\x1b[31m%s\x1b[0m', `❌ ERROR: La imagen optimizada sigue siendo demasiado grande (${optimizedSizeInMB.toFixed(2)}MB).`);
            return {
                success: false,
                error: 'Imagen optimizada aún excede el límite de 5MB',
                optimizedSize: optimizedSizeInMB
            };
        }

        console.log('\x1b[32m%s\x1b[0m', `✅ ÉXITO: Imagen optimizada correctamente.`);
        console.log(`📊 Tamaño original: ${fileSizeInMB.toFixed(2)}MB`);
        console.log(`📊 Tamaño optimizado: ${optimizedSizeInMB.toFixed(2)}MB`);
        console.log(`📊 Reducción: ${((fileSizeInMB - optimizedSizeInMB) / fileSizeInMB * 100).toFixed(1)}%`);

        return {
            success: true,
            originalSize: fileSizeInMB,
            optimizedSize: optimizedSizeInMB,
            reduction: ((fileSizeInMB - optimizedSizeInMB) / fileSizeInMB * 100).toFixed(1),
            outputPath
        };

    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', `❌ ERROR al procesar la imagen: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

// Endpoint para optimizar imágenes
app.post('/api/optimize-image', async (req, res) => {
    try {
        const { inputPath, outputPath, width, quality, format } = req.body;

        if (!inputPath || !outputPath) {
            return res.status(400).json({ 
                error: 'Se requieren las rutas de entrada y salida' 
            });
        }

        const result = await optimizeImage(inputPath, outputPath, {
            width: width || 800,
            quality: quality || 80,
            format: format || 'jpeg'
        });

        if (result.success) {
            res.status(200).json({
                message: 'Imagen optimizada exitosamente',
                ...result
            });
        } else {
            res.status(400).json({
                error: result.error,
                ...result
            });
        }
    } catch (error) {
        console.error('Error en endpoint de optimización:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor' 
        });
    }
});



app.use(express.static(path.join(__dirname, 'public')));

app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.post('/api/users/upsert', async (req, res) => {
    try {
        const { uid, displayName, email, role } = req.body;
        if (!uid || !email) {
            return res.status(400).json({ error: 'UID and email are required.' });
        }

        const userDocRefInUsers = db.collection('users').doc(uid);
        const userDocRefInInvited = db.collection('invited').doc(uid);

        const existingUserInUsers = await userDocRefInUsers.get();
        const existingUserInInvited = await userDocRefInInvited.get();

        let finalCollection = null;
        let finalRole = null;
        let message = '';

        if (role === 'owner') {
            finalCollection = 'users';
            finalRole = 'owner';

            if (existingUserInInvited.exists) {
                await userDocRefInInvited.delete();
                message += 'Migrated from invited to users. ';
                console.log(`User ${uid} migrated from 'invited' to 'users'.`);
            }

            await userDocRefInUsers.set({
                uid: uid,
                displayName: displayName || existingUserInUsers.data()?.displayName || null,
                email: email,
                role: finalRole,
                lastLogin: admin.firestore.FieldValue.serverTimestamp(),

                createdAt: existingUserInUsers.exists ? existingUserInUsers.data().createdAt : admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            message += `User upserted successfully in 'users' with role 'owner'.`;
            console.log(`User ${uid} upserted as owner.`);

        } else {
            finalCollection = 'invited';
            finalRole = 'customer';

            if (existingUserInUsers.exists && existingUserInUsers.data().role === 'owner') {
                console.warn(`Attempt to upsert owner ${uid} as customer. Ignoring role change.`);
                return res.status(200).json({ message: 'Owner user already exists, ignored customer upsert.', user: existingUserInUsers.data() });
            }

            await userDocRefInInvited.set({
                uid: uid,
                displayName: displayName || existingUserInInvited.data()?.displayName || null,
                email: email,
                role: finalRole,
                lastLogin: admin.firestore.FieldValue.serverTimestamp(),
                // createdAt solo si el doc es nuevo en invited
                createdAt: existingUserInInvited.exists ? existingUserInInvited.data().createdAt : admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            message += `User upserted successfully in 'invited' with role 'customer'.`;
            console.log(`User ${uid} upserted as customer.`);
        }

        return res.status(200).json({ message: message, user: { uid, displayName, email, role: finalRole } });

    } catch (error) {
        console.error('Error upserting user (owner or invited):', error);
        res.status(500).json({ error: 'An error occurred on the server while upserting user.' });
    }
});

app.get('/api/users/:uid/role', async (req, res) => {
    try {
        const { uid } = req.params;


        const ownerDoc = await db.collection('users').doc(uid).get();
        if (ownerDoc.exists && ownerDoc.data().role === 'owner') {
            return res.status(200).json({ role: 'owner' });
        }

        const invitedDoc = await db.collection('invited').doc(uid).get();
        if (invitedDoc.exists && invitedDoc.data().role === 'customer') {
            return res.status(200).json({ role: 'customer' });
        }

        // Si no se encuentra en ninguna colección con un rol reconocido
        return res.status(404).json({ error: 'User not found or role not recognized.' });
    } catch (error) {
        console.error('Error fetching user role from either collection:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});




app.post('/api/restaurants', authenticateAndAuthorize, async (req, res) => {
    try {
        const {
            userId,
            name,
            description,
            district,
            whatsapp,
            photoUrl,
            logoUrl = null,
            ruc = null,
            yape = null,
            phone = null,
            hasDelivery = false,
            hasLocalService = false,
            schedule = {},
            location
        } = req.body;

        // Verifica que el userId del body coincida con el UID del token
        if (req.user.uid !== userId) {
            return res.status(403).json({ error: 'Forbidden: Token UID does not match request userId.' });
        }
        if (!name) {
            return res.status(400).json({ error: 'Restaurant Name is required.' });
        }

        // Primero, verifica si ya tiene un restaurante para evitar duplicados
        const existingRestaurantSnapshot = await db
            .collection('restaurants')
            .where('ownerId', '==', userId)
            .limit(1)
            .get();
        if (!existingRestaurantSnapshot.empty) {
            return res.status(409).json({ error: 'This user already owns a restaurant.' });
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
            schedule: {
                monday: schedule.monday || { from: null, to: null },
                tuesday: schedule.tuesday || { from: null, to: null },
                wednesday: schedule.wednesday || { from: null, to: null },
                thursday: schedule.thursday || { from: null, to: null },
                friday: schedule.friday || { from: null, to: null },
                saturday: schedule.saturday || { from: null, to: null },
                sunday: schedule.sunday || { from: null, to: null },
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const restaurantRef = await db.collection('restaurants').add(restaurantData);

        res.status(201).json({
            message: 'Restaurant successfully registered.',
            restaurantId: restaurantRef.id,
            data: restaurantData
        });
    } catch (error) {
        console.error('Error registering restaurant:', error);
        if (error.message === 'This user already owns a restaurant.') {
            res.status(409).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'An error occurred on the server.' });
        }
    }
});


app.get('/api/restaurants/user/:userId', authenticateAndAuthorize, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.uid !== userId) {
            return res.status(403).json({ error: 'Forbidden: You can only query your own restaurant.' });
        }

        const snapshot = await db.collection('restaurants').where('ownerId', '==', userId).limit(1).get();
        if (snapshot.empty) {
            return res.status(404).json({ message: 'No restaurant found for this user.' });
        }
        let restaurantData = {};
        snapshot.forEach(doc => {
            restaurantData = { id: doc.id, ...doc.data() };
        });
        res.status(200).json(restaurantData);
    } catch (error) {
        console.error('Error fetching restaurant by user:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});


app.get('/api/restaurants/:restaurantId', async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const doc = await db.collection('restaurants').doc(restaurantId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Restaurant not found.' });
        }
        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) {
        console.error('Error fetching restaurant by ID:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

app.get('/api/restaurants-paginated', async (req, res) => {
    try {
        const { limit = 12, lastDocId, district } = req.query;
        let query = db.collection('restaurants').orderBy('createdAt', 'desc');

        if (district && district !== 'Todos') {
            query = query.where('district', '==', district);
        }

        if (lastDocId) {
            const lastDocRef = await db.collection('restaurants').doc(lastDocId).get();
            if (lastDocRef.exists) {
                query = query.startAfter(lastDocRef);
            }
        }

        const snapshot = await query.limit(parseInt(limit)).get();
        const restaurants = [];

        const restaurantPromises = snapshot.docs.map(async doc => {
            const restaurantData = { id: doc.id, ...doc.data() };
            let totalLikes = 0;

            const cardsSnapshot = await db.collection('cards')
                .where('restaurantId', '==', restaurantData.id)
                .get();

            for (const cardDoc of cardsSnapshot.docs) {
                const dishesSnapshot = await db.collection('dishes')
                    .where('cardId', '==', cardDoc.id)
                    .get();

                dishesSnapshot.forEach(dishDoc => {
                    totalLikes += (dishDoc.data().likesCount || 0);
                });
            }

            restaurantData.totalLikes = totalLikes;
            return restaurantData;
        });

        const restaurantsWithLikes = await Promise.all(restaurantPromises);

        const lastVisible = snapshot.docs[snapshot.docs.length - 1];
        res.status(200).json({
            restaurants: restaurantsWithLikes,
            lastDocId: lastVisible ? lastVisible.id : null
        });
    } catch (error) {
        console.error('Error fetching paginated restaurants with likes:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

// Endpoint para obtener distritos únicos donde hay restaurantes registrados
app.get('/api/districts', async (req, res) => {
    try {
        const snapshot = await db.collection('restaurants').get();
        const districts = new Set();
        
        snapshot.forEach(doc => {
            const district = doc.data().district;
            if (district && district.trim() !== '') {
                districts.add(district.trim());
            }
        });
        
        const sortedDistricts = Array.from(districts).sort();
        res.status(200).json(sortedDistricts);
    } catch (error) {
        console.error('Error fetching districts:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

app.get('/api/restaurants/:restaurantId/menu', async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const cardsSnapshot = await db.collection('cards')
            .where('restaurantId', '==', restaurantId)
            .where('isActive', '==', true)
            .orderBy('createdAt', 'asc').get();

        const menuData = [];
        for (const cardDoc of cardsSnapshot.docs) {
            const card = { id: cardDoc.id, ...cardDoc.data(), dishes: [] };
            const dishesSnapshot = await db.collection('dishes')
                .where('cardId', '==', card.id)
                .where('isActive', '==', true)
                .orderBy('createdAt', 'asc').get();

            dishesSnapshot.forEach(dishDoc => {
                const dishData = dishDoc.data();
                card.dishes.push({
                    id: dishDoc.id,
                    name: dishData.name,
                    price: dishData.price,
                    photoUrl: dishData.photoUrl,
                    isActive: dishData.isActive,
                    likesCount: dishData.likesCount || 0
                });
            });
            menuData.push(card);
        }
        res.status(200).json(menuData);
    } catch (error) {
        console.error('Error fetching restaurant menu:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});


app.put('/api/restaurants/:restaurantId', authenticateAndAuthorize, async (req, res) => {
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
            location
        } = req.body;
        const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this restaurant.' });
        }

        if (!name || !description || !district || !whatsapp) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const restaurantRef = db.collection('restaurants').doc(restaurantId);
        const oldData = restaurantDoc.data();
        const oldPhotoUrl = oldData.photoUrl;
        const updatedData = {
            name: name ?? '',
            description: description ?? '',
            district: district ?? '',
            whatsapp: whatsapp ?? '',
            photoUrl: photoUrl ?? null,
            logoUrl: logoUrl ?? null,
            ruc: ruc ?? null,
            yape: yape ?? null,
            phone: phone ?? null,
            hasDelivery: hasDelivery ?? false,
            hasLocalService: hasLocalService ?? false,
            location: location ?? null,
            schedule: {
                monday: schedule?.monday ?? { from: null, to: null },
                tuesday: schedule?.tuesday ?? { from: null, to: null },
                wednesday: schedule?.wednesday ?? { from: null, to: null },
                thursday: schedule?.thursday ?? { from: null, to: null },
                friday: schedule?.friday ?? { from: null, to: null },
                saturday: schedule?.saturday ?? { from: null, to: null },
                sunday: schedule?.sunday ?? { from: null, to: null }
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await restaurantRef.update(updatedData);

        if (photoUrl && oldPhotoUrl && photoUrl !== oldPhotoUrl) {
            try {
                const filePath = decodeURIComponent(oldPhotoUrl.split('/o/')[1].split('?alt=media')[0]);
                const bucket = admin.storage().bucket();
                await bucket.file(filePath).delete();
                console.log(`Old restaurant image deleted: ${filePath}`);
            } catch (storageError) {
                console.error(`Could not delete old restaurant image (${oldPhotoUrl}):`, storageError.message);
            }
        }
        res.status(200).json({ message: 'Restaurant successfully updated', data: updatedData });
    } catch (error) {
        console.error('Error updating restaurant:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});



app.post('/api/cards', authenticateAndAuthorize, async (req, res) => {
    try {
        const { restaurantId, name } = req.body;

        const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this restaurant.' });
        }

        if (!restaurantId || !name) {
            return res.status(400).json({ error: 'restaurantId and name are required.' });
        }
        const cardData = {
            restaurantId, name, isActive: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const cardRef = await db.collection('cards').add(cardData);
        res.status(201).json({ message: 'Card successfully created.', cardId: cardRef.id });
    } catch (error) {
        console.error('Error creating card:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});


app.get('/api/restaurants/:restaurantId/cards', authenticateAndAuthorize, async (req, res) => {
    try {
        const { restaurantId } = req.params;

        const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this restaurant.' });
        }

        const snapshot = await db.collection('cards').where('restaurantId', '==', restaurantId).get();
        const cards = [];
        snapshot.forEach(doc => {
            cards.push({ id: doc.id, ...doc.data() });
        });
        res.status(200).json(cards);
    } catch (error) {
        console.error('Error fetching cards:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

app.put('/api/cards/:cardId/toggle', authenticateAndAuthorize, async (req, res) => {
    try {
        const { cardId } = req.params;
        const { isActive } = req.body;

        const cardDoc = await db.collection('cards').doc(cardId).get();
        if (!cardDoc.exists) {
            return res.status(404).json({ error: 'Card not found.' });
        }
        const restaurantIdOfCard = cardDoc.data().restaurantId;
        const restaurantDoc = await db.collection('restaurants').doc(restaurantIdOfCard).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this card\'s restaurant.' });
        }

        await db.collection('cards').doc(cardId).update({ isActive });
        res.status(200).json({ message: `Card ${cardId} updated to ${isActive}` });
    } catch (error) {
        console.error('Error updating card:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

app.put('/api/cards/:cardId', authenticateAndAuthorize, async (req, res) => {
    try {
        const { cardId } = req.params;
        const { name } = req.body;


        const cardDoc = await db.collection('cards').doc(cardId).get();
        if (!cardDoc.exists) {
            return res.status(404).json({ error: 'Card not found.' });
        }
        const restaurantIdOfCard = cardDoc.data().restaurantId;
        const restaurantDoc = await db.collection('restaurants').doc(restaurantIdOfCard).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this card\'s restaurant.' });
        }

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Card name cannot be empty.' });
        }
        await db.collection('cards').doc(cardId).update({ name });
        res.status(200).json({ message: 'Card name successfully updated.' });
    } catch (error) {
        console.error('Error updating card name:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

app.delete('/api/cards/:cardId', authenticateAndAuthorize, async (req, res) => {
    try {
        const { cardId } = req.params;


        const cardDoc = await db.collection('cards').doc(cardId).get();
        if (!cardDoc.exists) {
            return res.status(404).json({ error: 'Card not found.' });
        }
        const restaurantIdOfCard = cardDoc.data().restaurantId;
        const restaurantDoc = await db.collection('restaurants').doc(restaurantIdOfCard).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this card\'s restaurant.' });
        }

        const batch = db.batch();
        const dishesSnapshot = await db.collection('dishes').where('cardId', '==', cardId).get();
        const deletionPromises = [];
        dishesSnapshot.forEach(doc => {
            const dishData = doc.data();
            if (dishData.photoUrl) {
                try {
                    const filePath = decodeURIComponent(dishData.photoUrl.split('/o/')[1].split('?alt=media')[0]);
                    deletionPromises.push(admin.storage().bucket().file(filePath).delete());
                } catch (e) {
                    console.error(`Invalid image URL, cannot delete: ${dishData.photoUrl}`, e);
                }
            }
            batch.delete(doc.ref);
        });
        batch.delete(db.collection('cards').doc(cardId));
        await Promise.all(deletionPromises);
        await batch.commit();
        res.status(200).json({ message: `Card ${cardId} and its contents deleted.` });
    } catch (error) {
        console.error('Error deleting card and its contents:', error);
        res.status(500).json({ error: 'An error occurred on the server during deletion.' });
    }
});


app.post('/api/dishes', authenticateAndAuthorize, async (req, res) => {
    try {
        const { cardId, name, price, photoUrl } = req.body;

        const cardDoc = await db.collection('cards').doc(cardId).get();
        if (!cardDoc.exists) {
            return res.status(404).json({ error: 'Card not found.' });
        }
        const restaurantIdOfCard = cardDoc.data().restaurantId;
        const restaurantDoc = await db.collection('restaurants').doc(restaurantIdOfCard).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this dish\'s card or restaurant.' });
        }

        if (!cardId || !name || !price) {
            return res.status(400).json({ error: 'cardId, name, and price are required.' });
        }
        const dishData = {
            cardId, name, price: parseFloat(price), isActive: true,
            photoUrl: photoUrl || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            likesCount: 0
        };
        const dishRef = await db.collection('dishes').add(dishData);
        res.status(201).json({ message: 'Dish successfully created.', dishId: dishRef.id, data: dishData });
    } catch (error) {
        console.error('Error creating dish:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

app.get('/api/cards/:cardId/dishes', authenticateAndAuthorize, async (req, res) => {
    try {
        const { cardId } = req.params;

        const cardDoc = await db.collection('cards').doc(cardId).get();
        if (!cardDoc.exists) {
            return res.status(404).json({ error: 'Card not found.' });
        }
        const restaurantIdOfCard = cardDoc.data().restaurantId;
        const restaurantDoc = await db.collection('restaurants').doc(restaurantIdOfCard).get();
        if (!restaurantDoc.exists || restaurantDoc.data().ownerId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this card\'s restaurant.' });
        }

        const snapshot = await db.collection('dishes').where('cardId', '==', cardId).get();
        const dishes = [];
        snapshot.forEach(doc => {
            const dishData = doc.data();
            dishes.push({
                id: doc.id,
                name: dishData.name,
                price: dishData.price,
                photoUrl: dishData.photoUrl,
                isActive: dishData.isActive,
                likesCount: dishData.likesCount || 0
            });
        });
        res.status(200).json(dishes);
    } catch (error) {
        console.error('Error fetching dishes:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

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


app.post('/api/dishes/:dishId/like', async (req, res) => {
    const { dishId } = req.params;
    const { action } = req.body; // 'like' o 'unlike'

    const authHeader = req.headers.authorization;
    let currentUserUid = null;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn("Authentication failed for like operation: No Bearer token provided.");
        return res.status(401).json({ error: 'Unauthorized: Login required to like/unlike dishes.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await authAdmin.verifyIdToken(idToken);
        currentUserUid = decodedToken.uid;
    } catch (error) {
        console.error('Error verifying Firebase ID token for like operation:', error.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid token for like operation.' });
    }

    if (!['like', 'unlike'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be "like" or "unlike".' });
    }

    const dishRef = db.collection('dishes').doc(dishId);

    const userFavoriteRef = db.collection('invited').doc(currentUserUid).collection('favorites').doc(dishId);

    try {
        await db.runTransaction(async (transaction) => {
            const dishDoc = await transaction.get(dishRef);
            const userFavoriteDoc = await transaction.get(userFavoriteRef);

            if (!dishDoc.exists) {
                throw new Error('Plato no encontrado.');
            }

            let currentLikes = dishDoc.data().likesCount || 0;
            let newLikes = currentLikes;

            if (action === 'like') {
                if (userFavoriteDoc.exists) {
                    return res.status(200).json({ likesCount: currentLikes, message: 'Already liked.' });
                }
                newLikes = currentLikes + 1;
                transaction.set(userFavoriteRef, { likedAt: admin.firestore.FieldValue.serverTimestamp() });
            } else if (action === 'unlike') {
                if (!userFavoriteDoc.exists) {
                    return res.status(200).json({ likesCount: currentLikes, message: 'Not liked yet.' });
                }
                newLikes = Math.max(0, currentLikes - 1);
                transaction.delete(userFavoriteRef);
            }

            transaction.update(dishRef, { likesCount: newLikes });
            res.status(200).json({ likesCount: newLikes, message: `Likes updated to ${newLikes}` });
        });
    } catch (error) {
        console.error('Error al actualizar likes del plato o favoritos del usuario:', error);
        res.status(500).json({ error: `Error al procesar el 'me gusta': ${error.message}` });
    }
});

app.post('/api/comments', async (req, res) => {
    try {
        const { invitedId, dishId, content } = req.body;

        // Validaciones básicas
        if (!content) {
            return res.status(400).json({ error: 'restaurantId y content son requeridos.' });
        }

        // Opcional: validar si el plato existe (si se envía dishId)
        if (dishId) {
            const dishDoc = await db.collection('dishes').doc(dishId).get();
            if (!dishDoc.exists) {
                return res.status(404).json({ error: 'El plato especificado no existe.' });
            }
        }
        if (invitedId) {
            const invitedDoc = await db.collection('invited').doc(invitedId).get();
            if (!invitedDoc.exists) {
                return res.status(404).json({ error: 'El plato especificado no existe.' });
            }
        }

        // Crear el comentario
        const commentData = {
            invitedId: invitedId,
            dishId,
            content,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const commentRef = await db.collection('comments_dishes').add(commentData);

        res.status(201).json({
            message: 'Comentario guardado exitosamente.',
            commentId: commentRef.id,
            data: commentData
        });
    } catch (error) {
        console.error('Error al guardar comentario:', error);
        res.status(500).json({ error: 'Ocurrió un error en el servidor.' });
    }
});

module.exports = app;
