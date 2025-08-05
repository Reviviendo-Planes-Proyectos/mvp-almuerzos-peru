const admin = require('firebase-admin');

// Configurar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function verifyUserRoles() {
  try {
    const targetUserId = 'wCbrqW55oMXYLpMXOWMpn1l4TED2';
    
    console.log('👤 Verificando roles del usuario:', targetUserId);
    console.log('='.repeat(60));
    
    // Verificar en colección 'users' (owners)
    console.log('🔍 Buscando en colección "users" (owners)...');
    const userDoc = await db.collection('users').doc(targetUserId).get();
    
    if (userDoc.exists) {
      console.log('✅ ENCONTRADO en "users":');
      console.log(userDoc.data());
    } else {
      console.log('❌ NO encontrado en "users"');
    }
    
    console.log('-'.repeat(40));
    
    // Verificar en colección 'invited' (customers)
    console.log('🔍 Buscando en colección "invited" (customers)...');
    const invitedDoc = await db.collection('invited').doc(targetUserId).get();
    
    if (invitedDoc.exists) {
      console.log('✅ ENCONTRADO en "invited":');
      console.log(invitedDoc.data());
    } else {
      console.log('❌ NO encontrado en "invited"');
    }
    
    console.log('='.repeat(60));
    
    // Resumen
    const hasOwnerRole = userDoc.exists;
    const hasCustomerRole = invitedDoc.exists;
    
    console.log('📊 RESUMEN:');
    console.log(`• Puede gestionar restaurante (owner): ${hasOwnerRole ? '✅' : '❌'}`);
    console.log(`• Puede hacer comentarios (customer): ${hasCustomerRole ? '✅' : '❌'}`);
    
    if (hasOwnerRole && hasCustomerRole) {
      console.log('🎉 PERFECTO: El usuario tiene ambos roles');
    } else if (hasOwnerRole && !hasCustomerRole) {
      console.log('⚠️ PROBLEMA: Es owner pero no puede comentar');
      console.log('💡 SOLUCIÓN: Necesita ser agregado a "invited"');
    } else if (!hasOwnerRole && hasCustomerRole) {
      console.log('✅ NORMAL: Solo es customer');
    } else {
      console.log('❌ ERROR: No tiene ningún rol');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

verifyUserRoles();
