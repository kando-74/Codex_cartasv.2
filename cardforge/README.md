# Cardforge

Cardforge es una aplicación React para crear y gestionar mazos de cartas asistidos con IA. Utiliza Firebase para autenticación, Firestore para el almacenamiento de proyectos y un servicio externo de IA para generar texto e imágenes.

## Requisitos previos

- Node.js 18 o superior.
- Una cuenta de Firebase con un proyecto configurado.
  - Habilita **Authentication** con el método de inicio de sesión anónimo.
  - Crea una base de datos **Cloud Firestore** en modo de producción o prueba.
  - Habilita **Cloud Storage** y define las reglas necesarias.
- Credenciales de un proveedor de IA compatible con la API utilizada (por ejemplo, una pasarela propia que exponga modelos de texto e imagen).

## Configuración del entorno

1. Clona el repositorio e instala las dependencias:

   ```bash
   npm install
   ```

2. Copia la plantilla de variables de entorno y completa los valores:

   ```bash
   cp .env.example .env
   ```

   Rellena los campos `VITE_FIREBASE_*` con los datos de la configuración Web de tu proyecto en Firebase Console (Configuración del proyecto → Tus apps → SDK de Firebase para Web).

   Los campos `VITE_AI_*` corresponden a la URL base, token y modelos disponibles en tu proveedor de IA. Ajusta los nombres de los modelos si utilizas otros distintos.

3. Arranca el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   La aplicación se sirve normalmente en <http://localhost:5173>.

## Variables de entorno

| Variable                             | Descripción                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`              | API key de Firebase.                                                        |
| `VITE_FIREBASE_AUTH_DOMAIN`          | Dominio de autenticación (p. ej. `tu-proyecto.firebaseapp.com`).            |
| `VITE_FIREBASE_PROJECT_ID`           | ID del proyecto de Firebase.                                                |
| `VITE_FIREBASE_STORAGE_BUCKET`       | Bucket de Cloud Storage.                                                    |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`  | Sender ID asociado al proyecto.                                             |
| `VITE_FIREBASE_APP_ID`               | App ID del proyecto web.                                                    |
| `VITE_AI_BASE_URL`                   | URL base del servicio de IA utilizado.                                      |
| `VITE_AI_API_KEY`                    | Token o clave de autenticación para la API de IA.                           |
| `VITE_AI_MODEL`                      | Modelo de texto por defecto (opcional, `qwen-plus` si se omite).            |
| `VITE_AI_IMAGE_MODEL`                | Modelo de imagen por defecto (opcional, `wanx-v1` si se omite).             |
| `VITE_AI_IMAGE_SIZE`                 | Tamaño de las imágenes generadas (opcional, `1024x1024` si se omite).       |

## Scripts disponibles

- `npm run dev`: Inicia el servidor de desarrollo con Vite.
- `npm run build`: Genera la build de producción.
- `npm run preview`: Sirve la build generada previamente.
- `npm run lint`: Ejecuta ESLint con las reglas configuradas.
- `npm run test`: Lanza la suite de pruebas con Vitest y Testing Library.

## Persistencia sin conexión

Cardforge intenta activar la persistencia offline de Firestore mediante IndexedDB. Algunos navegadores o situaciones (por ejemplo, varias pestañas abiertas simultáneamente) pueden impedirlo. En ese caso se mostrará una franja de aviso en la parte superior indicando que se requiere conexión en línea para ver los datos más recientes.

## Despliegue

1. Asegúrate de que el proyecto compila correctamente:

   ```bash
   npm run build
   ```

2. Despliega el contenido de la carpeta `dist/` en tu servicio de hosting preferido (Firebase Hosting, Vercel, Netlify, etc.).

Recuerda configurar las mismas variables de entorno (`VITE_*`) en el entorno de despliegue.

## Pruebas

La aplicación incluye pruebas unitarias para la inicialización de Firebase y el error boundary global.

- Ejecuta todas las pruebas con:

  ```bash
  npm run test
  ```

- Ejecuta el linting con:

  ```bash
  npm run lint
  ```

Mantén estas tareas integradas en tu flujo de CI/CD para garantizar la calidad del código.
