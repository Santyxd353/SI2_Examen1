# Vestidor AR móvil

Base React Native/Expo para reemplazar el avatar 3D por una experiencia de cámara. Esta primera versión incluye autenticación móvil con renovación segura, catálogo por ubicación, cámara frontal, guía de colocación y actualizaciones de inventario mediante WebSocket.

La prenda mostrada sobre la cámara es todavía una guía visual: **no existe seguimiento corporal en este incremento**. El siguiente paso es integrar MediaPipe mediante un módulo nativo/development build y deformar recursos 2D de blusas y vestidos con puntos de hombros, cintura y cadera.

## Preparación

1. Copia `.env.example` como `.env` y sustituye la dirección por la IP local de la computadora cuando uses un teléfono físico.
2. Inicia API y base de datos desde la raíz del repositorio.
3. Ejecuta `npm start` dentro de `apps/mobile`.

Para un teléfono físico configura temporalmente `API_HOST=0.0.0.0` en el `.env` de la raíz y permite el puerto 3018 solamente en la red privada de Windows. Mantén `127.0.0.1` cuando no estés realizando pruebas móviles.

La cámara funciona en Expo Go. El seguimiento corporal nativo requerirá un development build. Para compilar localmente Android se necesita Android Studio/SDK; iOS requiere macOS y Xcode.

El video de cámara debe mantenerse en el dispositivo. WebSocket transporta únicamente eventos de disponibilidad, nunca fotogramas.
