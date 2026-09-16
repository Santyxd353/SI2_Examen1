# Avance de implementación · 16 de septiembre de 2026

## Alcance de esta entrega

Se inició el ciclo 1 con una aplicación local persistente centrada en el vestidor. La migración contiene las **49 tablas del documento**; disponer de una tabla no significa haber implementado su función. El documento aprobado y sus pruebas de aceptación se mantienen como línea base en `linea-base.json`.

| Caso de uso                               | Implementado en esta entrega                                                                                                                      | Pendiente para completar el caso                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CU01 · Gestionar usuarios                 | Registro público Cliente, correo único y contraseña protegida                                                                                     | Administración de personal, estados, último administrador y auditoría                                                                                           |
| CU02 · Autenticar y autorizar             | Login, JWT corto, renovación rotativa, logout revocable, consulta del propietario y control de permiso de catálogo                                | Auditoría y pruebas de alcance del personal por ubicación                                                                                                       |
| CU03 · Gestionar roles y permisos         | Tablas, roles y permisos iniciales; consulta de permisos al autorizar                                                                             | Pantallas, CRUD y asignaciones administrativas                                                                                                                  |
| CU04 · Gestionar y consultar catálogo     | Consulta persistida, búsqueda por nombre/categoría en API, variantes/precios/stock y alta de borrador protegida                                   | Administración, publicación, imágenes y filtros completos                                                                                                       |
| CU05 · Configurar reglas comerciales      | Estructura de datos                                                                                                                               | Funcionalidad y pantallas                                                                                                                                       |
| CU07 · Gestionar perfil y direcciones     | Consulta de identidad propia                                                                                                                      | Edición de perfil, teléfono, direcciones y medidas declaradas                                                                                                   |
| CU08 · Gestionar inventario y ubicaciones | Ubicación inicial y lectura de disponibilidad real del catálogo                                                                                   | Movimientos, conteos, transferencias y alcance por ubicación                                                                                                    |
| CU16 · Probar prendas sobre avatar 3D     | Visor web, rotación, zoom, avatar privado aprobado, carga de variantes compatibles y evento PRUEBA idempotente                                    | Ajuste corporal de prendas, esqueleto/morphs, eventos completos, Android y conexión con carrito en ciclo 2                                                      |
| CU23 · Generar avatar desde fotografías   | Recepción privada de tres vistas/altura/consentimiento; cola durable; validación Python; estimación de silueta; exportación GLB; revisión y purga | Validación satisfactoria con fotos reales, orientación de cada vista, calibración de proporciones, mensajes por foto y validación previa a confirmar la captura |
| CU24 · Gestionar modelos 3D de prendas    | Plantilla propia y camisetas GLB S/M/L asociadas a variantes como recursos iniciales                                                              | Pantalla de carga, validaciones completas, revisión, publicación y versionado administrativo                                                                    |
| CU25 · Revisar y eliminar avatar          | Visor privado, medidas estimadas, aprobación con sustitución de versión y borrado con purga verificada                                            | Corrección de parámetros y regeneración desde el avatar derivado, políticas de respaldo desplegadas                                                             |

**Todos estos casos siguen abiertos.** CU06, CU09–CU14 y CU21 corresponden al ciclo 2; CU15, CU17–CU20 y CU22 al ciclo 3. Sus funciones están pendientes. No se añadieron funciones comerciales fuera del documento.

## Criterios del siguiente incremento

1. Validar CU23 con fotografías reales de adultos que autoricen su uso; comprobar frente/perfil/espalda, cuerpos y alturas distintos, rechazo y borrado. Registrar evidencia sin guardar las fotos en Git.
2. Completar la malla paramétrica y preparar el ajuste de camisetas al cuerpo, con rangos explícitos y revisión visual. La longitud de brazos/piernas ya se estima, pero aún no deforma las extremidades del modelo.
3. Incorporar corrección versionada de CU25 y administración/publicación de recursos de CU24.
4. Completar administración, perfil/direcciones, reglas e inventario del ciclo 1.
5. Implementar y verificar Android con el mismo visor y autenticación prevista.
6. Ejecutar las pruebas de aceptación del ciclo sobre avances reales; cerrar cada caso solo cuando se cubran todos sus flujos y excepciones.

El detalle técnico del primer incremento está en `PLAN_CICLO1.md`; la evidencia ejecutada se registra en `PRUEBAS.md`. No se marcan como aprobadas pruebas de aceptación del sistema final por tener pruebas parciales exitosas.
