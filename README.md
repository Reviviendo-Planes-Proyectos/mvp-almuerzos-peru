
# Almuerzos Perú 🍽️

Aplicación web para la gestión de menús y favoritos en restaurantes peruanos, con autenticación y panel administrativo.

---

## 🚀 Enlaces Importantes

- **Producción:** [https://mvp-almuerzos-peru.vercel.app/login.html](https://mvp-almuerzos-peru.vercel.app/login.html)
- **Dashboard Vercel:** [https://vercel.com/almuerzos-perus-projects/app-almuerzos-peru](https://vercel.com/almuerzos-perus-projects/app-almuerzos-peru)

---

## 📋 Descripción

Almuerzos Perú permite:
- Visualizar el menú diario del restaurante
- Autenticarse y registrar usuarios (Firebase Auth)
- Marcar platos como favoritos
- Acceso a dashboard administrativo para gestión de menús y usuarios
- Interfaz moderna y responsive

## 🛠️ Tecnologías

- **Backend:** Node.js + Express
- **Base de Datos:** Firebase Firestore
- **Autenticación:** Firebase Authentication
- **Frontend:** HTML, CSS, JavaScript
- **Despliegue:** Vercel

## 📦 Requisitos

- Node.js >= 14
- npm
- Cuenta y proyecto en Firebase

## ⚡ Instalación y Configuración

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/Reviviendo-Planes-Proyectos/mvp-almuerzos-peru.git
   cd mvp-almuerzos-peru
   ```

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. **Configura las credenciales de Firebase:**
   - Crea el archivo `serviceAccountKey.json` en la raíz del proyecto
   - Copia el contenido de tu clave privada de Firebase en ese archivo
   - En Vercel, agrega la variable de entorno `SERVICE_ACCOUNT_KEY` con el mismo contenido

## 🖥️ Ejecución Local

1. **Inicia el servidor:**
   ```bash
   npm start
   ```

2. **Accede a la app:**
   - Abre tu navegador en [http://localhost:3000](http://localhost:3000)
   - El puerto puede cambiar si defines la variable `PORT`

## 📁 Estructura del Proyecto

```
├── server.js                # Servidor principal Express
├── package.json             # Dependencias y scripts
├── serviceAccountKey.json   # Credenciales Firebase (no subir a git)
├── vercel.json              # Configuración de despliegue
└── public/                  # Archivos estáticos
    ├── index.html           # Página principal
    ├── login.html           # Login y registro
    ├── menu.html            # Menú de platos
    ├── dashboard.html       # Panel administrativo
    ├── favorites.html       # Platos favoritos
    ├── css/                 # Hojas de estilo
    ├── js/                  # Scripts JS
    └── images/              # Imágenes
```

## 📜 Scripts

```bash
npm start    # Inicia el servidor en modo producción
```

## ✨ Funcionalidades

- Autenticación y registro de usuarios
- Visualización y gestión de menú
- Favoritos por usuario
- Panel administrativo (dashboard)
- Diseño responsive

## 🔗 Endpoints Principales

- `GET /`              - Página principal
- `GET /menu`          - Menú de platos
- `GET /login`         - Login y registro
- `GET /dashboard`     - Panel administrativo
- `GET /favorites`     - Platos favoritos
- Endpoints extra para operaciones CRUD (requieren autenticación)

## 🤝 Contribuir

1. Haz fork del proyecto
2. Crea una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Realiza tus cambios y haz commit (`git commit -m 'feat: nueva funcionalidad'`)
4. Haz push a tu rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 🆘 Soporte

¿Tienes dudas o problemas?
- Abre un issue en el repositorio
- Contacta al equipo de desarrollo

## 📄 Licencia

Este proyecto está bajo la Licencia ISC.
