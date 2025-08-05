const admin = require('firebase-admin');

// Configurar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function debugInvitedUser() {
  try {
    const targetUserId = 'wCbrqW55oMXYLpMXOWMpn1l4TED2';
    
    console.log('👤 Buscando usuario invitado:', targetUserId);
    console.log('='.repeat(50));
    
    // Verificar si el usuario invitado existe
    const invitedDoc = await db.collection('invited').doc(targetUserId).get();
    
    if (invitedDoc.exists) {
      console.log('✅ USUARIO INVITADO ENCONTRADO:');
      console.log(invitedDoc.data());
    } else {
      console.log('❌ USUARIO INVITADO NO ENCONTRADO');
      
      // Listar todos los usuarios invitados para ver qué hay disponible
      console.log('\n👥 Listando todos los usuarios invitados en la BD:');
      const allInvited = await db.collection('invited').get();
      
      if (allInvited.empty) {
        console.log('❌ No hay usuarios invitados en la base de datos');
      } else {
        allInvited.forEach(doc => {
          console.log(`ID: ${doc.id}`);
          console.log(`Datos:`, doc.data());
          console.log('-'.repeat(30));
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

debugInvitedUser();
