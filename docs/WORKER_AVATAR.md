# Procesador de avatar

## Funcionamiento actual

NestJS crea un trabajo en PostgreSQL y guarda temporalmente las tres fotografías en almacenamiento privado. Un consumidor local consulta la cola cada tres segundos, reclama un trabajo de forma atómica y lanza el proceso Python. Solo se admite una generación activa por usuario; repetir la clave de idempotencia devuelve el trabajo existente.

Python comprueba archivos y duplicados exactos; Pillow corrige orientación EXIF, OpenCV mide desenfoque y MediaPipe obtiene puntos corporales y segmentación. Las anchuras de silueta frontal/posterior y profundidad de perfil se escalan por la altura declarada. Se estiman perímetros elípticos, sin inferir talla comercial.

Blender genera una malla corporal propia parametrizada por altura, pecho, cintura y cadera; une y suaviza los volúmenes y exporta GLB en metros con eje Y vertical. Se guardan parámetros y medidas, y el avatar queda `EN_REVISION`. Solo su propietario puede aprobarlo. Las fotos se purgan incluso si el proceso falla.

El procedimiento de MediaPipe sigue su [documentación oficial para Python](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/python). Los puntos y máscaras requieren interpretación adicional para estimar medidas; no constituyen por sí solos una reconstrucción corporal precisa.

## Contrato

```text
python workers/avatar/process.py --job <archivo JSON absoluto>
```

Entrada privada:

```json
{
  "height_cm": 170,
  "photos": { "FRENTE": "ruta", "PERFIL": "ruta", "ESPALDA": "ruta" },
  "output_dir": "directorio privado del trabajo",
  "job_id": "uuid"
}
```

Salida JSON por stdout: `ok`, `avatar_file`, `medidas`, `parametros_malla` y `version_proceso`; en fallo, `ok: false` y `error_code`. El servidor no publica rutas privadas. El archivo esperado es exclusivamente `private/jobs/<id>/avatar.glb`. Cada resultado crea una versión en PostgreSQL.

Tiempo máximo de Blender: 120 s; proceso Python: 180 s. Una tarea interrumpida se recupera después de diez minutos, con hasta tres intentos. Capturas vencidas se purgan antes de procesar la cola. Este consumidor local no reemplaza todavía la supervisión continua ni la infraestructura de producción.

## Recursos y procedencia

| Recurso            | Versión/procedencia                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Python             | 3.12, dependencias exactas en `requirements.lock.txt`                                    |
| MediaPipe          | 0.10.21, Pose Landmarker Full float16 v1, distribución oficial Google                    |
| OpenCV             | opencv-contrib-python 4.11.0.86                                                          |
| Blender            | 4.5.3 para Windows, distribución oficial blender.org                                     |
| Cuerpo y camisetas | Geometría programada para Grupo 18; no se descargan modelos personales ni prendas ajenas |

`scripts/setup-worker.ps1` fija las URL y hashes SHA-256 de los dos recursos binarios. Los binarios, sus avisos de licencia y paquetes se conservan en la instalación local, fuera del repositorio. `--demo` genera un maniquí explícitamente identificado como referencia y tres tallas de camiseta; no representa a un usuario.

## Límites que deben resolverse

- No se ha verificado aún una generación satisfactoria de extremo a extremo con fotos reales autorizadas.
- La identificación de orientación frente/perfil/espalda aún confía en el campo elegido. Se rechazan archivos idénticos, pero una copia recomprimida puede eludir esa comprobación.
- Perímetros son aproximaciones a partir de siluetas. La confianza `0.5` es un indicador provisional, no una probabilidad de precisión calibrada.
- La malla aún conserva proporciones base de extremidades; las longitudes estimadas no están aplicadas a ellas. No incluye rostro, textura personal ni anatomía detallada.
- Las camisetas iniciales comparten origen y plantilla; falta su deformación preparada para los distintos cuerpos. No existe simulación física de tela ni garantía de talla.
- La calidad cambia con luz, postura, oclusión, ropa y distancia a la cámara. Los umbrales requieren evaluación con muestras autorizadas.

Estas limitaciones mantienen abiertos CU16, CU23, CU24 y CU25; no se presentan como funciones terminadas.
