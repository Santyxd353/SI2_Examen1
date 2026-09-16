# Inicio del ciclo 1
Diseño aprobado: ../Plataforma_Vestidor3D_Grupo18.docx (secciones 1.8, 1.9, 2.5, 4, 5.1 y 5.4).
La autorización del usuario del 16-09-2026 pide comenzar con el stack y alcance ya definidos.

Arquitectura: monorepositorio npm; API NestJS/TypeScript; web React/TypeScript/Three.js; PostgreSQL y Prisma; proceso Python para fotos y GLB. Aplicación Android prevista mediante React Native y WebView. Puerto API 3018 y web 5173; PostgreSQL de desarrollo independiente en 55418. Archivos privados fuera del directorio público.

## Entrega inicial verificable
- [ ] Base con migración de las 49 tablas del documento; semilla local; comandos reproducibles.
- [ ] Registro exclusivo Cliente; inicio JWT corto, renovación rotativa revocable, cierre y perfil. Pruebas contra PostgreSQL de duplicados, escalado de roles, sesión revocada y aislamiento.
- [ ] Catálogo persistido con variantes, precios WEB/APP e inventario inicial; consulta y publicación por permisos. Una prenda 3D preparada para validar integración.
- [ ] Captura de FRENTE/PERFIL/ESPALDA, altura 100–230 cm y consentimiento; cola durable, idempotencia, validación real de fotos con Python, resultado EN_REVISION, aprobación y borrado privado.
- [ ] Visor Three.js con rotación, zoom y una prenda compatible, registro de eventos y control de propietario.
- [ ] Pantallas de registro/login, catálogo, captura y revisión/vestidor; estados vacíos y errores comprensibles.
- [ ] Comprobación de compilación, pruebas de integración y revisión del navegador; avance registrado por CU sin declarar ciclo 1 completo si falta funcionalidad.

## Límites
No incorporar funciones fuera del documento. No simular éxito del generador: entradas inválidas o dependencias ausentes son FALLIDO con causa. El maniquí de referencia se identifica explícitamente y no se presenta como avatar del usuario. Las fotos se purgan al finalizar o antes de 24h, incluidas fallidas; el avatar exige aprobación. Las pruebas de aceptación pendientes siguen pendientes hasta demostrar el recorrido real.
Los siguientes incrementos cubren administración completa de usuarios/roles, direcciones, reglas, inventario por ubicaciones y publicación de recursos, Android real; después ciclos 2 y 3. La entrega inicial inicia el ciclo 1 y no declara el sistema final.

## Contrato del proceso 3D
CLI: python workers/avatar/process.py --job <JSON absoluto>
Entrada: {"height_cm":170,"photos":{"FRENTE":"ruta","PERFIL":"ruta","ESPALDA":"ruta"},"output_dir":"ruta privada","job_id":"uuid"}.
Éxito stdout JSON: {"ok":true,"avatar_file":"ruta absoluta GLB","medidas":{"altura":{"valor_cm":170,"origen":"DECLARADA","confianza":1}, ...},"parametros_malla":{...},"version_proceso":"..."}.
Fallo stdout JSON: {"ok":false,"error_code":"...","message":"español"} con código de salida !=0.
Semilla: python workers/avatar/process.py --demo <carpeta>; produce reference.glb (referencia explícita), garment.glb (camiseta propia) y metadata.json. Mismo origen suelo, metros, +Y arriba, pose, topología y versión de plantilla. Salida usa parámetros de fotos, no cuerpo fijo.
Node orquesta trabajo/retención y revocación, Python no toca BD ni elimina entradas. Job privado, nunca registro de fotos o medidas en logs.

## Decisiones de ejecución
Ruling: proyecto nuevo en carpeta sistema y rama desarrollo/ciclo-1; no existe checkout previo que requiera worktree.
Ruling: especificación y stack aprobados en conversación; no repetir puertas de aprobación.
Ruling: revisión de trabajo por componente; un implementador independiente para proceso 3D mientras el principal desarrolla persistencia/API/UI con contrato acordado.

