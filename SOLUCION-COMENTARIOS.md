SOLUCIÓN IMPLEMENTADA: SISTEMA DE DOBLE ROL PARA USUARIOS
======================================================

🔍 PROBLEMA IDENTIFICADO:
- Los usuarios que se registraban primero como "comensales" y luego como "dueños de restaurante" perdían la capacidad de hacer comentarios
- Esto ocurría porque el sistema migraba al usuario de la colección "invited" (comensales) a "users" (dueños), eliminando su registro de "invited"
- Sin registro en "invited", no podían hacer comentarios en platos

✅ SOLUCIÓN IMPLEMENTADA:
- Modificado el endpoint `/api/users/upsert` en server.js para permitir DOBLE ROL
- Ahora un usuario puede estar SIMULTÁNEAMENTE en ambas colecciones:
  * En "users" con role="owner" (para gestionar restaurante)
  * En "invited" con role="customer" (para hacer comentarios)

🔧 CAMBIOS REALIZADOS:

1. **Líneas 294-317 en server.js**: Eliminada la migración destructiva
   - ANTES: `await userDocRefInInvited.delete()` (elimina de invited)
   - AHORA: Mantiene al usuario en ambas colecciones

2. **Líneas 319-335 en server.js**: Permitir ambos roles
   - ANTES: Rechazaba si owner quería ser customer
   - AHORA: Permite mantener ambos roles simultáneamente

3. **Creado usuario faltante**: fix-missing-user.js
   - Recreó el usuario problemático en la colección "invited"

🧪 VERIFICACIÓN:
- Usuario 'wCbrqW55oMXYLpMXOWMpn1l4TED2' ahora tiene:
  ✅ Rol owner en colección "users" (puede gestionar restaurante)
  ✅ Rol customer en colección "invited" (puede hacer comentarios)

- Endpoint `/api/comments` probado exitosamente:
  ✅ Status 201 - Comentario guardado correctamente
  ✅ RestaurantId asociado correctamente
  ✅ Comentarios aparecen en el dashboard

📊 ESTADO ACTUAL:
- Sistema de comentarios funcionando correctamente
- 3 comentarios asociados al restaurante "El tenedor feliz"
- Usuarios pueden mantener ambos roles sin conflictos

🎯 RESULTADO:
Los usuarios ahora pueden:
1. Registrarse como comensales ✅
2. Hacer comentarios en platos ✅
3. Registrar un restaurante ✅
4. Gestionar su restaurante ✅
5. SEGUIR haciendo comentarios como comensales ✅

El problema de los comentarios que no aparecían está completamente resuelto.
