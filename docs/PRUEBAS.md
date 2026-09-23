# Verificación del primer avance

Fecha: 16 de septiembre de 2026. Entorno local Windows, Node 22.19, PostgreSQL 18 y Python 3.12. Las pruebas se ejecutaron sobre implementación existente. Los resultados no equivalen a la aprobación de todos los casos de uso del documento.

## Resultados

| Comprobación      | Resultado y alcance                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparación local | `setup.ps1` completó instalación reproducible desde los bloqueos de dependencias, verificación de recursos, generación de GLB, semilla y compilación. Se probó sobre este equipo con clúster y descargas ya existentes; no en un segundo equipo limpio                                                                                                                                                                 |
| Esquema           | 49 tablas funcionales y 83 claves foráneas consultadas en PostgreSQL; Prisma válido y migración aplicada sin pendientes                                                                                                                                                                                                                                                                                                |
| API               | **52 pruebas de integración aprobadas** en `vestidor18_test`; incluyen registro y seguridad web/móvil, perfil y direcciones, WebSocket autenticado, avatares, sucursales/almacenes, personal, inventario, ventas, carritos WEB/APP, ciclo administrativo de pedidos, cancelaciones, devoluciones, pagos y reembolsos simulados, catálogo con galería, recursos AR, reportes, predicciones, recomendaciones y analítica |
| React Native      | TypeScript sin errores, dependencias Expo compatibles y bundle Android generado por Metro; cámara física y seguimiento corporal aún no acreditados                                                                                                                                                                                                                                                                     |
| Python/Blender    | **9 pruebas aprobadas**, incluyendo exportación de un GLB cuya altura geométrica corresponde a 1,85 m, dentro de 2 cm de tolerancia                                                                                                                                                                                                                                                                                    |
| Navegador         | Registro, catálogo, captura, acceso privado a fixture, aprobación, dos prendas sucesivas, borrado y sesión durante descarga verificados con Chromium                                                                                                                                                                                                                                                                   |
| Adaptación móvil  | Anchura de 390 px, sin desbordamiento horizontal ni errores JavaScript en el recorrido ejecutado                                                                                                                                                                                                                                                                                                                       |
| Dependencias      | `npm audit` sin vulnerabilidades reportadas; `pip check` sin incompatibilidades                                                                                                                                                                                                                                                                                                                                        |

## API: lo que se comprueba

`apps/api/test/access.test.ts` cubre registro exclusivo Cliente, intento de asignar un rol interno, límite UTF-8 de contraseña, correo duplicado normalizado, contraseña incorrecta, autenticación del perfil, renovación de un solo uso, revocación del acceso anterior, permiso de escritura de catálogo, precios/stock persistidos, captura incompleta, identificador de avatar inexistente, logout y renovación coincidente con logout.

`apps/api/test/avatar.test.ts` usa archivos privados y PostgreSQL reales. Comprueba el acceso a un avatar existente desde dos cuentas diferentes; aprobación de una única versión; bloqueo inmediato y purga tras borrar; admisión de un único trabajo por usuario ante cargas simultáneas; idempotencia de la carga y purga tras un rechazo real de Python; e idempotencia concurrente de eventos de prueba de prendas, rechazando la reutilización del identificador con otro contenido.

`apps/api/test/locations.test.ts` comprueba creación, edición y desactivación de sucursal/almacén; bloqueo de desactivación con existencias; conservación del historial; alta, asignación múltiple y retiro de un Vendedor; aislamiento del inventario y las alertas por ubicación; detalle físico, reservado, comprometido y disponible; rechazo de conteos menores que las reservas; conciliación trazable; configuración de stock mínimo; ajuste de existencias; transferencia atómica con dos movimientos relacionados; rechazo por stock insuficiente; disponibilidad pública por sucursal; y denegación de acceso al rol Cliente.

`apps/api/test/reports.test.ts` comprueba el filtro público de catálogo por sucursal, métricas de ventas confirmadas por producto/ubicación/vendedor, proyección de demanda, persistencia de predicciones y recomendaciones, consulta comercial de solo lectura, rechazo de instrucciones destructivas y denegación de reportes al rol Cliente.

`apps/api/test/sales.test.ts` comprueba que el Vendedor solo vea sus ubicaciones asignadas; que una venta cree pedido, detalle, pago y movimiento mientras descuenta stock una sola vez; que el reintento idempotente no duplique la salida; que el stock insuficiente revierta toda la transacción; y que el rol Cliente no acceda al punto de venta.

`apps/api/test/mobile.test.ts` comprueba registro móvil limitado al rol Cliente, entrega de sesión renovable, login y renovación con tokens rotativos, invalidación del acceso anterior, rechazo de reutilización del token, autenticación WebSocket, suscripción a inventario activo y revocación al cerrar sesión.

`apps/api/test/profile.test.ts` comprueba edición del perfil, teléfono y preferencias; creación de la primera dirección como principal; sustitución y reasignación de la dirección principal; baja lógica; aislamiento entre propietarios y auditoría. `apps/api/test/orders.test.ts` comprueba el permiso administrativo, filtros, transiciones válidas desde confirmado hasta cerrado, seguimiento obligatorio, historial y rechazo de saltos de estado; además verifica cancelación idempotente con reintegro y reembolso total, devolución parcial con reintegro proporcional y rechazo sin alteración de stock ni reembolso.

`apps/api/test/catalog-garments.test.ts` comprueba el alta de una prenda con galería, variantes por talla y color, catálogo común con existencias separadas y filtros combinados. `apps/api/test/catalog-ar.test.ts` comprueba que un PNG AR quede en borrador y solo llegue al catálogo móvil después de publicarse. `apps/api/test/commerce.test.ts` cubre carrito, reserva, pago simulado, idempotencia, rechazo y vencimiento, además del aislamiento de carritos y pedidos entre los canales WEB y APP.

## Regresiones reproducidas y corregidas

- La entrega autorizada del GLB fallaba al estar almacenado bajo `.local`: se corrigió el envío del archivo privado después del control de propietario.
- Cambiar la prenda revocaba también la URL del cuerpo que seguía en uso: cada recurso conserva su propio ciclo de vida.
- Un registro podía aceptar más de 72 bytes de contraseña y sufrir truncamiento en bcrypt: se valida la longitud UTF-8 antes de guardarla.
- Renovar y cerrar sesión podían dejar una sesión sucesora válida: la renovación ahora rota sobre la misma fila, con comparación del hash y versión del acceso. Una cookie firmada anterior puede revocar esa misma sesión aunque acabe de rotar.
- Una respuesta GLB retrasada hasta después del logout reponía el avatar: se invalidan respuestas pendientes por cuenta y por vista. La prueba retrasa la entrega real del archivo hasta después del cierre.
- Abrir nuevamente el avatar durante su borrado podía impedir limpiar la vista: se bloquean acciones incompatibles mientras se confirma la operación.
- Reintentos de eventos podían competir o aceptar otra prenda bajo el mismo identificador: se inserta sin duplicación y se verifica que el evento corresponda al mismo contenido.

## Evidencia visual

`scripts/check-ui.cjs` guarda `ui-desktop.png`, `ui-avatar.png`, `ui-fitting.png`, `ui-mobile.png` y `ui-result.json` en `.local`. Los avatares utilizados por esa prueba son copias explícitas del maniquí asignadas a cuentas de prueba; **no provienen de una reconstrucción fotográfica**.

## Pendiente de acreditar

- Generación satisfactoria desde tres fotografías reales autorizadas y calidad para personas de distintas proporciones.
- Precisión/calibración de medidas, reconocimiento de orientación de vistas y ajuste de prendas a cuerpos distintos.
- Corrección de avatares, administración completa, Android, ciclos 2 y 3 y despliegue.
- Resiliencia bajo carga, fallos de disco, interrupciones prolongadas y políticas de respaldos.

Python muestra dos avisos de obsolescencia de protobuf sobre cambios futuros en Python 3.14; el entorno probado usa Python 3.12. Las pruebas de aceptación de `linea-base.json` permanecen pendientes hasta ejecutarse con sus condiciones completas.

## Versiones corregidas de dependencias

Se fija Multer 2.4.0 también dentro de NestJS, y deepmerge-ts 8.0.0 dentro de Prisma. Las excepciones de resolución están en `package.json` y quedaron verificadas por compilación, migraciones y pruebas. Corresponden a los avisos de [Multer](https://github.com/expressjs/multer/security/advisories/GHSA-wc9g-mqfw-jrwm) y [DeepmergeTS](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
