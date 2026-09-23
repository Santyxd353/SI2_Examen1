# Conciliación entre documento y sistema

Documento rector: `C:/Users/ASUS/Desktop/FICCT/Estadistica 2/Plataforma_Vestidor3D_Grupo18.docx` (21 de septiembre de 2026). Código revisado: rama `codex/avance-ar-sucursales`, commit `9e22599`. El anexo 10 del Word es una evaluación de avance, no evidencia de que sus casos estén terminados. La cámara AR es la experiencia prioritaria; el avatar 3D permanece como componente legado mientras se valida AR.

## Resultado exigido

1. Cada requisito RF01–RF44 y RA01–RA08 tiene una implementación, interfaz y prueba de aceptación, o una limitación externa explícita que impide afirmar su cierre.
2. Cada función accesible en API, web y móvil aparece en el documento, con reglas, datos y pruebas concordantes.
3. Word, PDF, esquema de datos y diagramas mantienen dos carátulas, índice navegable y diseño legible.
4. Ningún estado «Implementado» se basa solo en tablas o una ruta vacía. El avance indica pruebas ejecutadas, fecha y entorno.

## Secuencia de trabajo

### 1. Línea base y auditoría

- [x] Descargar rama nueva y comprobar árbol limpio.
- [x] Comparar Word entregado con versión en Git: hay anexo 10 nuevo, dos tablas nuevas y 50 enlaces de índice válidos.
- [x] Compilar API y ejecutar 44 pruebas de integración iniciales.
- [ ] Revisar RF01–RF44, RA01–RA08 y CU01–CU25 por flujo, autorización, persistencia, interfaz y pruebas.
- [ ] Enumerar rutas, pantallas, entidades y comportamientos presentes solo en código.
- [ ] Registrar matriz bidireccional con estado real y evidencia verificable.

### 2. Identidad y catálogo

- [ ] Probar y completar cuentas, roles, permisos, perfil, direcciones y preferencias (CU01–03, CU07).
- [ ] Probar y completar edición/retiro/publicación de catálogo, reglas comerciales, canales y cajas (CU04–05, CU08, CU13).

### 3. Operación comercial

- [ ] Probar y completar estados e historial del pedido, devoluciones, reintegro y reembolso de prueba (CU09–12, CU14).
- [ ] Incorporar avisos, notificaciones, bandeja, lectura, dispositivos y preferencias (CU06, CU21).

### 4. Vestidor y analítica

- [ ] Cerrar defectos verificables del prototipo AR y medir sus límites con fotos y dispositivos reales (RA01–RA08, CU15–16).
- [ ] Completar búsqueda por imagen, gestión de modelos de prendas y flujos del avatar legado que sigan en alcance (CU18, CU23–25).
- [ ] Probar y completar reportes netos, anomalías, pronósticos, reposición y consultas comerciales (CU10, CU17, CU19–20, CU22).

### 5. Concordancia documental y entrega

- [ ] Corregir contradicción sobre prioridad AR/3D en secciones anteriores y anexo 10.
- [ ] Actualizar requisitos, casos, arquitectura, secuencias, datos, ciclos, pruebas y trazabilidad según código final.
- [ ] Actualizar Word/PDF sin alterar diseño de carátulas e índice; renderizar y revisar todas las páginas modificadas.
- [ ] Ejecutar pruebas API, web, móvil y verificación de documentos; publicar cambios en rama de revisión y resumir límites externos honestamente.

## Límites que requieren evidencia externa

Cobros bancarios, push y servicios IA externos necesitan cuentas/credenciales de prueba y validación contra proveedor. La RA real requiere prendas autorizadas con transparencia y ensayos en teléfonos Android; iOS requiere equipo de compilación/prueba. Un simulador o geometría ilustrativa no constituye esa validación.
