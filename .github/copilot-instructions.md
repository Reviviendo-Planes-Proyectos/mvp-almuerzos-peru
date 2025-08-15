# Copilot Instructions for Almuerzos Perú

## Project Overview
- Web app for managing restaurant menus and user favorites in Peru.
- Backend: Node.js + Express (`server.js`)
- Database & Auth: Firebase Firestore & Authentication (`serviceAccountKey.json` required)
- Frontend: Static HTML/CSS/JS in `public/`
- Deployment: Vercel (`vercel.json`)

## Key Workflows
- **Install dependencies:** `npm install`
- **Run locally:** `npm start` (default port 3000)
- **Firebase setup:** Place `serviceAccountKey.json` in root; never commit this file.
- **Production deploy:** Vercel auto-deploys from main branch; config in `vercel.json`.

## Patterns & Conventions
- All backend logic is in `server.js`. No MVC separation; routes and logic are in one file.
- Frontend JS is split by page in `public/js/` (e.g., `menu.js`, `dashboard.js`).
- CSS is split by page in `public/css/`.
- Use Firebase Admin SDK for DB/auth (see `server.js`).
- User roles and authentication are handled via Firebase; see `verify-user-roles.js` for custom logic.
- Comments and code fixes scripts: see `fix-comments.js`, `fix-missing-user.js`.

## Integration Points
- **Firebase:** All DB/auth calls use Firebase Admin SDK.
- **Vercel:** Static hosting and serverless functions (if needed).

## Examples
- To add a new page, create HTML/JS/CSS in `public/` and link in `index.html`.
- To add a new backend route, edit `server.js` directly.
- For admin/dashboard features, see `dashboard.html` and `dashboard.js`.

## Cautions
- Never commit `serviceAccountKey.json`.
- All sensitive config for production must be set in Vercel environment variables.
- No automated tests or CI/CD scripts present.

---
For more details, see `README.md`.
---

# Instrucciones Copilot para Almuerzos Perú (Español)

## Resumen del Proyecto
- Aplicación web para gestión de menús y favoritos en restaurantes peruanos.
- Backend: Node.js + Express (`server.js`)
- Base de datos y autenticación: Firebase Firestore y Authentication (`serviceAccountKey.json` requerido)
- Frontend: HTML/CSS/JS estático en `public/`
- Despliegue: Vercel (`vercel.json`)

## Flujos Principales
- **Instalación:** `npm install`
- **Ejecución local:** `npm start` (puerto 3000 por defecto)
- **Configuración Firebase:** Coloca `serviceAccountKey.json` en la raíz (no subir a git)
- **Despliegue:** Vercel desde rama principal; config en `vercel.json`

## Dependencias Clave
- `express`: servidor web principal
- `firebase-admin`: acceso a Firestore y autenticación
- `axios`: llamadas HTTP (usado en scripts)
- `sharp`: procesamiento de imágenes
- `qrcode`: generación de códigos QR
- `cropperjs`: recorte de imágenes en frontend

## Patrones y Convenciones
- Toda la lógica backend está en `server.js` (sin separación MVC)
- JS y CSS por página en `public/js/` y `public/css/`
- Roles y autenticación gestionados en Firebase; ver `verify-user-roles.js`
- Scripts de corrección: `fix-comments.js`, `fix-missing-user.js`

## Integraciones
- **Firebase:** Todas las operaciones de DB/autenticación usan Firebase Admin SDK
- **Vercel:** Hosting estático y funciones serverless

## Ejemplos
- Para agregar una página, crea HTML/JS/CSS en `public/` y enlaza en `index.html`
- Para nuevas rutas backend, edita `server.js`
- Para funciones admin, revisa `dashboard.html` y `dashboard.js`

## Observaciones y Mejoras
- No hay tests automáticos ni CI/CD; agregar pruebas unitarias y flujos de integración continua mejoraría la calidad
- El backend podría beneficiarse de una estructura modular (separar rutas, controladores)
- El manejo de errores y validaciones puede ser más robusto en las rutas de `server.js`
- Considera usar variables de entorno para todas las credenciales y configuraciones sensibles

---
Para más detalles, revisa `README.md`.

---

## Main Services / Servicios Principales

### Endpoints (English)
- `POST /api/optimize-image`: Optimize restaurant images (uses `sharp`).
- `POST /api/users/upsert`: Create or update user profile.
- `GET /api/users/:uid/role`: Get user role (owner, etc).
- `GET /api/qr`: Generate QR code for restaurant/menu.
- `POST /api/restaurants`: Create restaurant (owner only, auth required).
- `GET /api/restaurants/user/:userId`: Get restaurants for a user.
- `GET /api/restaurants-count`: Get count of restaurants with 5+ dishes.
- `GET /api/restaurants/:restaurantId`: Get details of a restaurant.
- `GET /api/restaurants-paginated`: Paginated list of restaurants.

### Endpoints (Español)
- `POST /api/optimize-image`: Optimiza imágenes de restaurantes (usa `sharp`).
- `POST /api/users/upsert`: Crea o actualiza perfil de usuario.
- `GET /api/users/:uid/role`: Obtiene el rol del usuario (owner, etc).
- `GET /api/qr`: Genera código QR para restaurante/menú.
- `POST /api/restaurants`: Crea restaurante (solo owner, requiere auth).
- `GET /api/restaurants/user/:userId`: Obtiene restaurantes de un usuario.
- `GET /api/restaurants-count`: Obtiene el total de restaurantes con 5+ platos.
- `GET /api/restaurants/:restaurantId`: Obtiene detalles de un restaurante.
- `GET /api/restaurants-paginated`: Listado paginado de restaurantes.
