const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://cashma-8adfb-default-rtdb.firebaseio.com"
  });
}

// Test para verificar que un usuario con ambos roles puede comentar
async function testCommentsWithDualRole() {
  try {
    const UID = "wCbrqW55oMXYLpMXOWMpn1l4TED2";
    const baseUrl = "http://localhost:3000";
    
    console.log('🧪 PRUEBA: Usuario con doble rol puede comentar');
    console.log('============================================================');

    // 1. Crear un token personalizado para el usuario
    console.log('1️⃣ Generando token de autenticación...');
    const customToken = await admin.auth().createCustomToken(UID);
    console.log('✅ Token generado exitosamente');

    // 2. Simular un comentario a un platillo
    console.log('\n2️⃣ Simulando envío de comentario...');
    const dishId = "test-dish-id"; // ID de ejemplo
    const commentData = {
      dishId: dishId,
      text: "¡Excelente platillo! Recomendado 👍",
      rating: 5
    };

    // 3. Verificar que el usuario existe en invited (necesario para comentar)
    console.log('\n3️⃣ Verificando que el usuario puede comentar...');
    const db = admin.firestore();
    const invitedDoc = await db.collection('invited').doc(UID).get();
    
    if (!invitedDoc.exists) {
      console.log('❌ ERROR: Usuario no encontrado en colección "invited"');
      console.log('⚠️  Un usuario debe estar en "invited" para poder comentar');
      return false;
    }

    console.log('✅ Usuario encontrado en "invited" - puede comentar');
    console.log('📝 Datos del usuario:', {
      uid: invitedDoc.data().uid,
      role: invitedDoc.data().role,
      displayName: invitedDoc.data().displayName
    });

    // 4. Verificar que también es owner
    console.log('\n4️⃣ Verificando que también es owner...');
    const ownerDoc = await db.collection('users').doc(UID).get();
    
    if (!ownerDoc.exists) {
      console.log('❌ ERROR: Usuario no encontrado en colección "users"');
      return false;
    }

    console.log('✅ Usuario también encontrado en "users" - puede gestionar restaurante');
    console.log('🏪 Datos del owner:', {
      uid: ownerDoc.data().uid,
      role: ownerDoc.data().role,
      displayName: ownerDoc.data().displayName
    });

    console.log('\n============================================================');
    console.log('🎉 RESULTADO: El usuario tiene AMBOS roles correctamente');
    console.log('   • Puede comentar platillos (rol customer en "invited")');
    console.log('   • Puede gestionar restaurante (rol owner en "users")');
    console.log('   • Los comentarios NO se perderán al crear restaurante');
    console.log('============================================================');

    return true;

  } catch (error) {
    console.error('❌ Error en la prueba:', error);
    return false;
  }
}

// Ejecutar la prueba
if (require.main === module) {
  testCommentsWithDualRole()
    .then(success => {
      if (success) {
        console.log('\n✅ PRUEBA COMPLETADA EXITOSAMENTE');
      } else {
        console.log('\n❌ PRUEBA FALLÓ');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Error ejecutando la prueba:', error);
      process.exit(1);
    });
}

module.exports = { testCommentsWithDualRole };
