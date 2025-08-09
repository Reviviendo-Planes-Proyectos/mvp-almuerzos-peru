const admin = require('firebase-admin');

// Configurar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function createMissingUser() {
  try {
    const missingUserId = 'wCbrqW55oMXYLpMXOWMpn1l4TED2';
    
    console.log('👤 Creando usuario faltante:', missingUserId);
    console.log('='.repeat(50));
    
    // Verificar si ya existe
    const existingDoc = await db.collection('invited').doc(missingUserId).get();
    
    if (existingDoc.exists) {
      console.log('✅ El usuario ya existe:', existingDoc.data());
    } else {
      console.log('➕ Creando nuevo usuario en la colección invited...');
      
      // Crear el usuario con datos básicos
      await db.collection('invited').doc(missingUserId).set({
        uid: missingUserId,
        displayName: 'Usuario Comensal', // Nombre genérico
        email: 'usuario@example.com', // Email genérico
        role: 'customer',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      console.log('✅ Usuario creado exitosamente');
      
      // Verificar que se creó correctamente
      const newDoc = await db.collection('invited').doc(missingUserId).get();
      if (newDoc.exists) {
        console.log('✅ Verificación exitosa:', newDoc.data());
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

createMissingUser();
