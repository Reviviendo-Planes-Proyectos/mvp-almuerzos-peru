# Almuerzos Perú 🍽️

Aplicación web para gestión de menús de restaurante con sistema de autenticación y gestión de favoritos.

# ALMUERZOS-PERU

Dashboard Vercel: 
https://vercel.com/almuerzos-perus-projects/app-almuerzos-peru

<img width="1302" height="602" alt="image" src="https://github.com/user-attachments/assets/558810c4-f591-4a6e-98a6-6a9b89be55e0" />

Pagina Web desplegada:
https://app-almuerzos-peru.vercel.app/

<img width="1366" height="790" alt="image" src="https://github.com/user-attachments/assets/3b2b64ed-a99b-4df8-8158-03b7dac7714d" />

## Descripción

Almuerzos Perú es una aplicación web que permite a los usuarios:
- Ver el menú del restaurante
- Autenticarse con Firebase Authentication
- Gestionar platos favoritos
- Dashboard para administradores
- Sistema de gestión de menús

## Tecnologías Utilizadas

- **Backend**: Node.js + Express
- **Base de Datos**: Firebase Firestore
- **Autenticación**: Firebase Authentication
- **Frontend**: HTML, CSS, JavaScript
- **Despliegue**: Vercel

## Requisitos Previos

- Node.js (versión 14 o superior)
- npm o yarn
- Cuenta de Firebase con proyecto configurado

## Instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/Reviviendo-Planes-Proyectos/mvp-almuerzos-peru.git
cd almuerzos-peru
```

2. **Instalar dependencias**
```bash
npm install
```

3.  **Configurar variables de entorno en Vercel**
   - Agregar `SERVICE_ACCOUNT_KEY` con el contenido del archivo JSON
   - Crear archivo **serviceAccountKey.json** en la raiz del proyecto
   - Agregar contenido del archivo

## Cómo Levantar el Proyecto

### Desarrollo Local

1. **Ejecutar el servidor**
```bash
npm start
```

2. **Acceder a la aplicación**
   - Abrir el navegador en: `http://localhost:3000`
   - La aplicación estará disponible en el puerto 3000 (o el puerto configurado en PORT)

### Estructura de Archivos

```
├── server.js              # Servidor principal Express
├── package.json           # Dependencias y scripts
├── serviceAccountKey.json # Credenciales de Firebase (no incluir en git)
├── vercel.json           # Configuración de despliegue
└── public/               # Archivos estáticos
    ├── index.html        # Página principal
    ├── login.html        # Página de login
    ├── menu.html         # Página del menú
    ├── dashboard.html    # Panel de administración
    ├── favorites.html    # Página de favoritos
    ├── css/             # Hojas de estilo
    ├── js/              # Scripts JavaScript
    └── images/          # Imágenes del proyecto
```

## Scripts Disponibles

```bash
npm start    # Inicia el servidor en modo producción
```


## Funcionalidades

- **Autenticación**: Sistema completo de login/registro con Firebase Auth
- **Menú**: Visualización de platos disponibles
- **Favoritos**: Los usuarios pueden marcar platos como favoritos
- **Dashboard**: Panel administrativo para gestión
- **Responsive**: Diseño adaptable a diferentes dispositivos

## API Endpoints

- `GET /` - Página principal
- `GET /menu` - Página del menú
- `GET /login` - Página de autenticación
- `GET /dashboard` - Panel de administración
- `GET /favorites` - Página de favoritos
- API endpoints adicionales para operaciones CRUD (requieren autenticación)

## Contribuir

1. Fork el proyecto
2. Crear una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abrir un Pull Request

## Soporte

Si tienes problemas o preguntas:
- Crear un issue en el repositorio
- Contactar al equipo de desarrollo

## Licencia

Este proyecto está bajo la Licencia ISC.
