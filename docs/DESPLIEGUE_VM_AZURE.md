# Despliegue en VM Azure

La VM ejecuta tres contenedores con Docker Compose:

- `proxy`: Caddy publica HTTPS y renueva el certificado.
- `app`: web React, API NestJS y worker MediaPipe/Blender.
- `database`: PostgreSQL 16, accesible solo desde la red interna de Docker.

Los datos PostgreSQL, archivos de avatares y certificados usan volúmenes persistentes.

## Actualizar desde este equipo

La copia en la VM vive en `/opt/vestidor18`. Transferir el árbol de trabajo sin `.env`, dependencias ni archivos locales y ejecutar:

```bash
cd /opt/vestidor18
sudo docker compose --env-file .env.vm -f infra/vm/compose.yml up -d --build
```

Estado:

```bash
sudo docker compose --env-file .env.vm -f infra/vm/compose.yml ps
sudo docker compose --env-file .env.vm -f infra/vm/compose.yml logs --tail=100
```

La base de datos no publica el puerto 5432. Los únicos puertos públicos son SSH 22, HTTP 80 y HTTPS 443.
