# Cambio de experiencia: avatar 3D a realidad aumentada

Fecha de solicitud: 17 de septiembre de 2026.

## Decisión comunicada

La experiencia para clientes deja de priorizar la generación de un modelo corporal 3D a partir de tres fotografías. El objetivo nuevo es probar principalmente ropa femenina sobre la imagen en vivo de la cámara del celular.

La línea base original se conserva como evidencia documental. El código de avatar existente tampoco se elimina durante la transición para evitar pérdida irreversible; se retirará de la navegación cuando el prototipo AR satisfaga las pruebas en dispositivos reales.

## Arquitectura objetivo

- React Native para Android e iOS.
- Cámara y detección corporal ejecutadas en el dispositivo.
- MediaPipe nativo para hombros, brazos, cintura, cadera, rodillas y tobillos.
- Recursos 2D transparentes y metadatos de anclaje para blusas, vestidos, faldas y pantalones.
- API NestJS y PostgreSQL existentes para identidad, catálogo, inventario, ventas y analítica.
- WebSocket autenticado exclusivamente para eventos pequeños de disponibilidad; nunca para transmitir video.
- Python reservado para preparación, evaluación y procesamiento avanzado fuera del flujo de cámara en vivo.

## Base implementada

- Proyecto Expo/React Native independiente en `apps/mobile`.
- Sesión móvil con tokens rotativos almacenables mediante SecureStore.
- Catálogo y filtro por sucursal o almacén.
- Cámara frontal con permiso y declaración de privacidad.
- Guía corporal y superposición visual explícitamente marcada como prototipo.
- Canal WebSocket autenticado y suscripción a actualizaciones de inventario.
- Emisión de actualización después de una venta.
- Selección de variante de talla/color en catálogo móvil.
- Primer módulo nativo Android con MediaPipe Pose Landmarker: detección local de hombros y cadera a partir de capturas temporales, proyección con recorte de cámara, suavizado y silueta vectorial diferenciada para blusa/vestido. Se compiló en EAS y el usuario confirmó que la superposición aparece en su teléfono Android.
- Muestra ilustrativa PNG con fondo transparente para «Camiseta esencial / Marfil», anclada a hombros y cadera. No representa una foto real del inventario.
- Gestión de imágenes AR por variante desde el panel administrador: carga de PNG, licencia, texto alternativo, revisión en borrador y publicación. El catálogo móvil recibe únicamente la imagen publicada de cada variante.

## Pendientes aplazados a solicitud del usuario (20 de septiembre de 2026)

1. Conseguir imágenes frontales autorizadas y con fondo transparente de una blusa y un vestido reales.
2. Cargarlas en el panel administrador, asociarlas a sus variantes de talla y color, revisarlas y publicarlas. La herramienta de carga ya está implementada; faltan los archivos.
3. Probar ambas prendas en un teléfono Android y ajustar posición, escala y seguimiento sobre el cuerpo.

## Otros pendientes antes de llamarlo vestidor AR funcional

1. Sustituir el muestreo de capturas por procesamiento continuo de fotogramas.
2. Definir anclajes y deformación desde hombros, cintura y cadera.
3. Mejorar orientación, oclusión por brazos y control de cuerpo completo visible.
4. Probar rendimiento, iluminación, cuerpos y teléfonos diferentes.
5. Preparar y validar iOS desde un equipo Mac.
6. Sustituir la navegación del avatar anterior solamente cuando la nueva experiencia esté validada.

La visualización deberá mostrar siempre que es aproximada y que no garantiza el ajuste físico ni la talla real.
