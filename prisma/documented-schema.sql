-- Grupo 18 | Diseño físico PostgreSQL 16+ | Estado: especificado, no desplegado.

BEGIN;

CREATE TABLE usuario (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombres varchar(100) NOT NULL,
  apellidos varchar(120) NOT NULL,
  correo varchar(160) NOT NULL,
  clave_hash varchar(255) NOT NULL,
  telefono varchar(30),
  estado varchar(20) NOT NULL,
  preferencias jsonb NOT NULL,
  creado_en timestamptz NOT NULL,
  CHECK (estado IN ('ACTIVO','SUSPENDIDO')),
  UNIQUE (correo)
);

CREATE TABLE rol (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre varchar(60) NOT NULL,
  descripcion varchar(255) NOT NULL,
  protegido boolean NOT NULL,
  UNIQUE (nombre)
);

CREATE TABLE permiso (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recurso varchar(60) NOT NULL,
  accion varchar(30) NOT NULL,
  descripcion varchar(200) NOT NULL,
  UNIQUE (recurso, accion)
);

CREATE TABLE usuario_rol (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  rol_id uuid NOT NULL,
  asignado_en timestamptz NOT NULL,
  UNIQUE (usuario_id, rol_id)
);

CREATE TABLE rol_permiso (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rol_id uuid NOT NULL,
  permiso_id uuid NOT NULL,
  UNIQUE (rol_id, permiso_id)
);

CREATE TABLE sesion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  refresh_hash varchar(255) NOT NULL,
  creada_en timestamptz NOT NULL,
  vence_en timestamptz NOT NULL,
  revocada_en timestamptz,
  ultimo_acceso timestamptz,
  CHECK (vence_en > creada_en),
  UNIQUE (refresh_hash)
);

CREATE TABLE direccion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  alias varchar(50) NOT NULL,
  destinatario varchar(160) NOT NULL,
  telefono varchar(30) NOT NULL,
  ciudad varchar(100) NOT NULL,
  zona varchar(100) NOT NULL,
  detalle varchar(400) NOT NULL,
  predeterminada boolean NOT NULL,
  activa boolean NOT NULL
);

CREATE TABLE categoria (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre varchar(80) NOT NULL,
  descripcion varchar(255),
  activa boolean NOT NULL,
  UNIQUE (nombre)
);

CREATE TABLE producto (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria_id uuid NOT NULL,
  nombre varchar(160) NOT NULL,
  descripcion text NOT NULL,
  coleccion varchar(100),
  marca varchar(100),
  material varchar(150) NOT NULL,
  estado varchar(20) NOT NULL,
  creado_en timestamptz NOT NULL,
  CHECK (estado IN ('BORRADOR','PUBLICADO','RETIRADO'))
);

CREATE TABLE variante (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id uuid NOT NULL,
  sku varchar(60) NOT NULL,
  codigo_barras varchar(80),
  talla varchar(20) NOT NULL,
  color varchar(50) NOT NULL,
  color_hex varchar(7),
  activa boolean NOT NULL,
  UNIQUE (sku),
  UNIQUE (codigo_barras),
  UNIQUE (producto_id, talla, color)
);

CREATE TABLE recurso_catalogo (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id uuid NOT NULL,
  variante_id uuid,
  clave_objeto varchar(500) NOT NULL,
  tipo_mime varchar(80) NOT NULL,
  orden integer NOT NULL,
  texto_alternativo varchar(255) NOT NULL,
  embedding jsonb,
  licencia varchar(255) NOT NULL,
  uso varchar(20) NOT NULL DEFAULT 'GALERIA',
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR',
  CHECK (uso IN ('GALERIA', 'AR')),
  CHECK (estado IN ('BORRADOR', 'PUBLICADO')),
  CHECK (orden >= 0)
);

CREATE TABLE precio_canal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variante_id uuid NOT NULL,
  canal varchar(10) NOT NULL,
  moneda char(3) NOT NULL,
  importe numeric(12,2) NOT NULL,
  descuento_pct numeric(5,2) NOT NULL,
  desde timestamptz NOT NULL,
  hasta timestamptz,
  CHECK (canal IN ('WEB','APP','TIENDA')),
  CHECK (importe >= 0),
  CHECK (descuento_pct BETWEEN 0 AND 100),
  CHECK (hasta IS NULL OR hasta > desde),
  UNIQUE (variante_id, canal, desde)
);

CREATE TABLE ubicacion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  padre_id uuid,
  nombre varchar(120) NOT NULL,
  tipo varchar(20) NOT NULL,
  direccion varchar(300),
  activa boolean NOT NULL,
  CHECK (tipo IN ('ALMACEN','TIENDA','CAJA')),
  CHECK (padre_id IS NULL OR padre_id <> id)
);

CREATE TABLE usuario_ubicacion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  ubicacion_id uuid NOT NULL,
  UNIQUE (usuario_id, ubicacion_id)
);

CREATE TABLE disponibilidad_canal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variante_id uuid NOT NULL,
  ubicacion_id uuid NOT NULL,
  canal varchar(10) NOT NULL,
  habilitada boolean NOT NULL,
  stock_seguridad integer NOT NULL,
  plazo_reposicion_dias integer NOT NULL,
  CHECK (canal IN ('WEB','APP','TIENDA')),
  CHECK (stock_seguridad >= 0),
  CHECK (plazo_reposicion_dias >= 0),
  UNIQUE (variante_id, ubicacion_id, canal)
);

CREATE TABLE inventario (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variante_id uuid NOT NULL,
  ubicacion_id uuid NOT NULL,
  fisico integer NOT NULL,
  reservado integer NOT NULL,
  comprometido integer NOT NULL,
  disponible integer GENERATED ALWAYS AS (fisico - reservado - comprometido) STORED,
  version integer NOT NULL,
  CHECK (fisico >= 0 AND reservado >= 0 AND comprometido >= 0),
  CHECK (fisico >= reservado + comprometido),
  CHECK (version >= 0),
  UNIQUE (variante_id, ubicacion_id)
);

CREATE TABLE movimiento_stock (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventario_id uuid NOT NULL,
  grupo_operacion uuid NOT NULL,
  tipo varchar(25) NOT NULL,
  delta_fisico integer NOT NULL,
  delta_reservado integer NOT NULL,
  delta_comprometido integer NOT NULL,
  conteo_observado integer,
  motivo varchar(400) NOT NULL,
  actor_id uuid NOT NULL,
  pedido_id uuid,
  creado_en timestamptz NOT NULL,
  CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE','CONTEO','TRANSFERENCIA','RESERVA','LIBERACION','COMPROMISO','DESPACHO','DEVOLUCION')),
  CHECK (conteo_observado IS NULL OR conteo_observado >= 0)
);

CREATE TABLE reserva_stock (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  detalle_pedido_id uuid NOT NULL,
  inventario_id uuid NOT NULL,
  cantidad integer NOT NULL,
  estado varchar(20) NOT NULL,
  creada_en timestamptz NOT NULL,
  vence_en timestamptz NOT NULL,
  cerrada_en timestamptz,
  CHECK (cantidad > 0),
  CHECK (vence_en > creada_en),
  CHECK (estado IN ('ACTIVA','COMPROMETIDA','LIBERADA','DESPACHADA'))
);

CREATE TABLE consentimiento (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  version_texto varchar(30) NOT NULL,
  finalidad varchar(100) NOT NULL,
  declaracion_adulto boolean NOT NULL,
  aceptado_en timestamptz NOT NULL,
  revocado_en timestamptz
);

CREATE TABLE captura_corporal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  consentimiento_id uuid NOT NULL,
  altura_cm numeric(5,2),
  estado varchar(20) NOT NULL,
  creada_en timestamptz NOT NULL,
  purgar_antes_de timestamptz NOT NULL,
  purgada_en timestamptz,
  CHECK (altura_cm IS NULL OR altura_cm BETWEEN 100 AND 230),
  CHECK (purgar_antes_de <= creada_en + interval '24 hours'),
  CHECK (estado IN ('BORRADOR','VALIDADA','PROCESANDO','PURGADA','RECHAZADA'))
);

CREATE TABLE foto_temporal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  captura_id uuid NOT NULL,
  vista varchar(10) NOT NULL,
  clave_objeto varchar(500),
  mime varchar(40) NOT NULL,
  bytes integer NOT NULL,
  validacion jsonb,
  purgada_en timestamptz,
  CHECK (vista IN ('FRENTE','PERFIL','ESPALDA')),
  CHECK (bytes > 0 AND bytes <= 10485760),
  UNIQUE (captura_id, vista)
);

CREATE TABLE plantilla_corporal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre varchar(80) NOT NULL,
  version varchar(30) NOT NULL,
  clave_malla varchar(500) NOT NULL,
  esqueleto_version varchar(40) NOT NULL,
  parametros jsonb NOT NULL,
  licencia varchar(255) NOT NULL,
  activa boolean NOT NULL,
  UNIQUE (nombre, version)
);

CREATE TABLE trabajo_avatar (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  captura_id uuid,
  avatar_id uuid,
  tipo varchar(15) NOT NULL,
  estado varchar(20) NOT NULL,
  idempotencia uuid NOT NULL,
  intentos integer NOT NULL,
  version_proceso varchar(50) NOT NULL,
  parametros jsonb,
  error_codigo varchar(60),
  creado_en timestamptz NOT NULL,
  iniciado_en timestamptz,
  terminado_en timestamptz,
  CHECK (tipo IN ('GENERAR','CORREGIR','ELIMINAR')),
  CHECK (estado IN ('EN_COLA','PROCESANDO','COMPLETADO','FALLIDO','CANCELADO')),
  CHECK (intentos BETWEEN 0 AND 3),
  UNIQUE (idempotencia)
);

CREATE TABLE avatar (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  plantilla_id uuid NOT NULL,
  version integer NOT NULL,
  clave_glb varchar(500),
  medidas jsonb,
  parametros_malla jsonb,
  estado varchar(20) NOT NULL,
  creado_en timestamptz NOT NULL,
  aprobado_en timestamptz,
  eliminado_en timestamptz,
  CHECK (version > 0),
  CHECK (estado IN ('EN_REVISION','APROBADO','SUSTITUIDO','ELIMINANDO','ELIMINADO')),
  CHECK (estado <> 'ELIMINADO' OR (clave_glb IS NULL AND medidas IS NULL AND parametros_malla IS NULL)),
  UNIQUE (usuario_id, version)
);

CREATE TABLE modelo_prenda (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variante_id uuid NOT NULL,
  plantilla_id uuid NOT NULL,
  version integer NOT NULL,
  clave_glb varchar(500) NOT NULL,
  ajuste jsonb NOT NULL,
  bytes integer NOT NULL,
  triangulos integer NOT NULL,
  licencia varchar(255) NOT NULL,
  estado varchar(20) NOT NULL,
  revisado_por uuid,
  creado_en timestamptz NOT NULL,
  CHECK (version > 0 AND bytes > 0 AND triangulos > 0),
  CHECK (estado IN ('BORRADOR','VALIDADO','PUBLICADO','RETIRADO')),
  UNIQUE (variante_id, plantilla_id, version)
);

CREATE TABLE sesion_vestidor (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  avatar_id uuid,
  canal varchar(10) NOT NULL,
  iniciada_en timestamptz NOT NULL,
  finalizada_en timestamptz,
  CHECK (canal IN ('WEB','APP'))
);

CREATE TABLE evento_vestidor (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sesion_id uuid NOT NULL,
  variante_id uuid,
  modelo_id uuid,
  evento_cliente uuid NOT NULL,
  tipo varchar(20) NOT NULL,
  error_codigo varchar(60),
  ocurrido_en timestamptz NOT NULL,
  CHECK (tipo IN ('APERTURA','CARGA','PRUEBA','CAMBIO','FALLO','AGREGAR_CARRITO','CIERRE')),
  UNIQUE (evento_cliente)
);

CREATE TABLE carrito (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  canal varchar(10) NOT NULL,
  estado varchar(15) NOT NULL,
  actualizado_en timestamptz NOT NULL,
  CHECK (canal IN ('WEB','APP','TIENDA')),
  CHECK (estado IN ('ACTIVO','CONVERTIDO','ABANDONADO'))
);

CREATE TABLE item_carrito (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  carrito_id uuid NOT NULL,
  variante_id uuid NOT NULL,
  cantidad integer NOT NULL,
  evento_vestidor_id uuid,
  CHECK (cantidad > 0),
  UNIQUE (carrito_id, variante_id)
);

CREATE TABLE pedido (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  vendedor_id uuid,
  ubicacion_id uuid,
  carrito_id uuid,
  numero varchar(30) NOT NULL,
  canal varchar(10) NOT NULL,
  moneda char(3) NOT NULL,
  subtotal numeric(12,2) NOT NULL,
  descuento numeric(12,2) NOT NULL,
  impuesto numeric(12,2) NOT NULL,
  entrega numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  direccion_snapshot jsonb NOT NULL,
  reglas_snapshot jsonb NOT NULL,
  estado varchar(25) NOT NULL,
  seguimiento varchar(150),
  creado_en timestamptz NOT NULL,
  entregado_en timestamptz,
  idempotencia uuid NOT NULL,
  CHECK (canal IN ('WEB','APP','TIENDA')),
  CHECK (subtotal >= 0 AND descuento >= 0 AND impuesto >= 0 AND entrega >= 0 AND total >= 0),
  CHECK (total = subtotal - descuento + impuesto + entrega),
  CHECK (estado IN ('PENDIENTE_PAGO','CONFIRMADO','PREPARANDO','DESPACHADO','ENTREGADO','CERRADO','CANCELADO','REEMBOLSO_PENDIENTE')),
  UNIQUE (numero),
  UNIQUE (idempotencia),
  UNIQUE (carrito_id)
);

CREATE TABLE detalle_pedido (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id uuid NOT NULL,
  variante_id uuid NOT NULL,
  sku_snapshot varchar(60) NOT NULL,
  descripcion_snapshot varchar(255) NOT NULL,
  talla_snapshot varchar(20) NOT NULL,
  color_snapshot varchar(50) NOT NULL,
  cantidad integer NOT NULL,
  precio_unitario numeric(12,2) NOT NULL,
  descuento numeric(12,2) NOT NULL,
  total_linea numeric(12,2) NOT NULL,
  CHECK (cantidad > 0),
  CHECK (precio_unitario >= 0 AND descuento >= 0),
  CHECK (total_linea = cantidad * precio_unitario - descuento AND total_linea >= 0)
);

CREATE TABLE pago (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id uuid NOT NULL,
  proveedor varchar(60) NOT NULL,
  referencia varchar(160),
  idempotencia uuid NOT NULL,
  monto numeric(12,2) NOT NULL,
  moneda char(3) NOT NULL,
  estado varchar(20) NOT NULL,
  creado_en timestamptz NOT NULL,
  confirmado_en timestamptz,
  CHECK (monto >= 0),
  CHECK (estado IN ('CREADO','PENDIENTE','CONFIRMADO','RECHAZADO','CANCELADO','REEMBOLSADO')),
  UNIQUE (idempotencia),
  UNIQUE (proveedor, referencia)
);

CREATE TABLE evento_pago (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pago_id uuid NOT NULL,
  proveedor varchar(60) NOT NULL,
  evento_externo varchar(180) NOT NULL,
  tipo varchar(50) NOT NULL,
  firma_verificada boolean NOT NULL,
  payload_resumen jsonb NOT NULL,
  recibido_en timestamptz NOT NULL,
  procesado_en timestamptz,
  error_codigo varchar(60),
  UNIQUE (proveedor, evento_externo)
);

CREATE TABLE devolucion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  tipo varchar(15) NOT NULL,
  estado varchar(25) NOT NULL,
  motivo varchar(500) NOT NULL,
  resolucion varchar(500),
  revisado_por uuid,
  solicitada_en timestamptz NOT NULL,
  resuelta_en timestamptz,
  CHECK (tipo IN ('CANCELACION','DEVOLUCION')),
  CHECK (estado IN ('SOLICITADA','AUTORIZADA','RECIBIDA','APROBADA','RECHAZADA','REEMBOLSO_PENDIENTE','RESUELTA'))
);

CREATE TABLE detalle_devolucion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  devolucion_id uuid NOT NULL,
  detalle_pedido_id uuid NOT NULL,
  cantidad integer NOT NULL,
  cantidad_apta integer NOT NULL,
  ubicacion_id uuid,
  observacion varchar(400),
  reintegrada_en timestamptz,
  CHECK (cantidad > 0 AND cantidad_apta BETWEEN 0 AND cantidad),
  UNIQUE (devolucion_id, detalle_pedido_id)
);

CREATE TABLE reembolso (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pago_id uuid NOT NULL,
  devolucion_id uuid,
  idempotencia uuid NOT NULL,
  referencia varchar(160),
  monto numeric(12,2) NOT NULL,
  estado varchar(20) NOT NULL,
  motivo varchar(400) NOT NULL,
  creado_en timestamptz NOT NULL,
  confirmado_en timestamptz,
  CHECK (monto > 0),
  CHECK (estado IN ('PENDIENTE','CONFIRMADO','FALLIDO')),
  UNIQUE (idempotencia),
  UNIQUE (pago_id, referencia)
);

CREATE TABLE historial_pedido (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id uuid NOT NULL,
  actor_id uuid,
  estado_anterior varchar(25),
  estado_nuevo varchar(25) NOT NULL,
  motivo varchar(400) NOT NULL,
  creado_en timestamptz NOT NULL
);

CREATE TABLE modelo_analitico (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo varchar(20) NOT NULL,
  nombre varchar(80) NOT NULL,
  version varchar(40) NOT NULL,
  parametros jsonb NOT NULL,
  metricas_validacion jsonb,
  estado varchar(20) NOT NULL,
  CHECK (tipo IN ('DEMANDA','ANOMALIA','VISUAL','LENGUAJE')),
  UNIQUE (tipo, nombre, version)
);

CREATE TABLE ejecucion_analitica (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  modelo_id uuid NOT NULL,
  solicitante_id uuid NOT NULL,
  desde date NOT NULL,
  hasta date NOT NULL,
  filtros jsonb NOT NULL,
  metricas jsonb,
  estado varchar(20) NOT NULL,
  creada_en timestamptz NOT NULL,
  CHECK (hasta >= desde),
  CHECK (estado IN ('PENDIENTE','COMPLETADA','FALLIDA','SIN_DATOS'))
);

CREATE TABLE prediccion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ejecucion_id uuid NOT NULL,
  variante_id uuid NOT NULL,
  ubicacion_id uuid NOT NULL,
  canal varchar(10) NOT NULL,
  fecha date NOT NULL,
  cantidad numeric(12,3) NOT NULL,
  limite_inferior numeric(12,3),
  limite_superior numeric(12,3),
  CHECK (cantidad >= 0),
  CHECK (canal IN ('WEB','APP','TIENDA')),
  CHECK (limite_inferior IS NULL OR limite_inferior >= 0),
  CHECK (limite_superior IS NULL OR limite_superior >= limite_inferior),
  UNIQUE (ejecucion_id, variante_id, ubicacion_id, canal, fecha)
);

CREATE TABLE anomalia (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ejecucion_id uuid NOT NULL,
  indicador varchar(80) NOT NULL,
  entidad_tipo varchar(50) NOT NULL,
  entidad_id uuid,
  puntaje numeric(12,4) NOT NULL,
  evidencia jsonb NOT NULL,
  estado varchar(20) NOT NULL,
  revisado_por uuid,
  observacion varchar(500),
  CHECK (estado IN ('PENDIENTE','EXPLICADA','CONFIRMADA'))
);

CREATE TABLE recomendacion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ejecucion_id uuid,
  variante_id uuid NOT NULL,
  origen_id uuid,
  destino_id uuid NOT NULL,
  tipo varchar(15) NOT NULL,
  cantidad integer NOT NULL,
  cobertura_dias integer NOT NULL,
  motivo jsonb NOT NULL,
  estado varchar(20) NOT NULL,
  revisado_por uuid,
  observacion varchar(500),
  grupo_movimiento uuid,
  CHECK (tipo IN ('REPOSICION','TRASLADO')),
  CHECK (cantidad > 0 AND cobertura_dias > 0),
  CHECK (estado IN ('PROPUESTA','REVISADA','DESCARTADA','EJECUTADA')),
  CHECK (origen_id IS NULL OR origen_id <> destino_id)
);

CREATE TABLE consulta_analitica (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  modelo_id uuid,
  tipo varchar(15) NOT NULL,
  pregunta text,
  interpretacion jsonb NOT NULL,
  filtros jsonb NOT NULL,
  resultado_resumen jsonb,
  estado varchar(20) NOT NULL,
  creada_en timestamptz NOT NULL,
  CHECK (tipo IN ('LENGUAJE','VISUAL')),
  CHECK (estado IN ('COMPLETADA','ACLARACION','RECHAZADA','SIN_DATOS'))
);

CREATE TABLE aviso (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  autor_id uuid NOT NULL,
  titulo varchar(160) NOT NULL,
  contenido text NOT NULL,
  enlace varchar(500),
  audiencia jsonb NOT NULL,
  canales jsonb NOT NULL,
  desde timestamptz NOT NULL,
  hasta timestamptz NOT NULL,
  estado varchar(15) NOT NULL,
  CHECK (hasta > desde),
  CHECK (estado IN ('BORRADOR','PUBLICADO','RETIRADO'))
);

CREATE TABLE dispositivo (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  token_push varchar(500) NOT NULL,
  plataforma varchar(15) NOT NULL,
  activo boolean NOT NULL,
  actualizado_en timestamptz NOT NULL,
  CHECK (plataforma IN ('ANDROID','WEB')),
  UNIQUE (token_push)
);

CREATE TABLE notificacion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  evento_id uuid NOT NULL,
  dispositivo_id uuid,
  tipo varchar(40) NOT NULL,
  contenido jsonb NOT NULL,
  estado varchar(20) NOT NULL,
  intentos integer NOT NULL,
  creada_en timestamptz NOT NULL,
  enviada_en timestamptz,
  leida_en timestamptz,
  ultimo_error varchar(150),
  CHECK (estado IN ('PENDIENTE','ENVIADA','FALLIDA','SOLO_BANDEJA')),
  CHECK (intentos BETWEEN 0 AND 3),
  UNIQUE (usuario_id, evento_id, dispositivo_id)
);

CREATE TABLE outbox_evento (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clave varchar(180) NOT NULL,
  tipo varchar(60) NOT NULL,
  entidad_id uuid NOT NULL,
  payload jsonb NOT NULL,
  creado_en timestamptz NOT NULL,
  publicado_en timestamptz,
  intentos integer NOT NULL,
  CHECK (intentos >= 0),
  UNIQUE (clave)
);

CREATE TABLE configuracion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clave varchar(100) NOT NULL,
  version integer NOT NULL,
  valor jsonb NOT NULL,
  desde timestamptz NOT NULL,
  hasta timestamptz,
  autor_id uuid NOT NULL,
  CHECK (version > 0),
  CHECK (hasta IS NULL OR hasta > desde),
  UNIQUE (clave, version)
);

CREATE TABLE auditoria (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid,
  accion varchar(100) NOT NULL,
  entidad varchar(60) NOT NULL,
  entidad_id uuid,
  cambios jsonb NOT NULL,
  motivo varchar(400),
  correlacion uuid NOT NULL,
  creado_en timestamptz NOT NULL
);

ALTER TABLE usuario_rol ADD CONSTRAINT fk_usuario_rol_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_usuario_rol_usuario_id ON usuario_rol (usuario_id);

ALTER TABLE usuario_rol ADD CONSTRAINT fk_usuario_rol_rol_id FOREIGN KEY (rol_id) REFERENCES rol (id) ON DELETE RESTRICT;

CREATE INDEX ix_usuario_rol_rol_id ON usuario_rol (rol_id);

ALTER TABLE rol_permiso ADD CONSTRAINT fk_rol_permiso_rol_id FOREIGN KEY (rol_id) REFERENCES rol (id) ON DELETE RESTRICT;

CREATE INDEX ix_rol_permiso_rol_id ON rol_permiso (rol_id);

ALTER TABLE rol_permiso ADD CONSTRAINT fk_rol_permiso_permiso_id FOREIGN KEY (permiso_id) REFERENCES permiso (id) ON DELETE RESTRICT;

CREATE INDEX ix_rol_permiso_permiso_id ON rol_permiso (permiso_id);

ALTER TABLE sesion ADD CONSTRAINT fk_sesion_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_sesion_usuario_id ON sesion (usuario_id);

ALTER TABLE direccion ADD CONSTRAINT fk_direccion_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_direccion_usuario_id ON direccion (usuario_id);

ALTER TABLE producto ADD CONSTRAINT fk_producto_categoria_id FOREIGN KEY (categoria_id) REFERENCES categoria (id) ON DELETE RESTRICT;

CREATE INDEX ix_producto_categoria_id ON producto (categoria_id);

ALTER TABLE variante ADD CONSTRAINT fk_variante_producto_id FOREIGN KEY (producto_id) REFERENCES producto (id) ON DELETE RESTRICT;

CREATE INDEX ix_variante_producto_id ON variante (producto_id);

ALTER TABLE recurso_catalogo ADD CONSTRAINT fk_recurso_catalogo_producto_id FOREIGN KEY (producto_id) REFERENCES producto (id) ON DELETE RESTRICT;

CREATE INDEX ix_recurso_catalogo_producto_id ON recurso_catalogo (producto_id);

ALTER TABLE recurso_catalogo ADD CONSTRAINT fk_recurso_catalogo_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_recurso_catalogo_variante_id ON recurso_catalogo (variante_id);

CREATE INDEX ix_recurso_catalogo_variante_uso_estado ON recurso_catalogo (variante_id, uso, estado);

CREATE UNIQUE INDEX ux_recurso_catalogo_ar_publicado_variante ON recurso_catalogo (variante_id) WHERE uso = 'AR' AND estado = 'PUBLICADO';

ALTER TABLE precio_canal ADD CONSTRAINT fk_precio_canal_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_precio_canal_variante_id ON precio_canal (variante_id);

ALTER TABLE ubicacion ADD CONSTRAINT fk_ubicacion_padre_id FOREIGN KEY (padre_id) REFERENCES ubicacion (id) ON DELETE RESTRICT;

CREATE INDEX ix_ubicacion_padre_id ON ubicacion (padre_id);

ALTER TABLE usuario_ubicacion ADD CONSTRAINT fk_usuario_ubicacion_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_usuario_ubicacion_usuario_id ON usuario_ubicacion (usuario_id);

ALTER TABLE usuario_ubicacion ADD CONSTRAINT fk_usuario_ubicacion_ubicacion_id FOREIGN KEY (ubicacion_id) REFERENCES ubicacion (id) ON DELETE RESTRICT;

CREATE INDEX ix_usuario_ubicacion_ubicacion_id ON usuario_ubicacion (ubicacion_id);

ALTER TABLE disponibilidad_canal ADD CONSTRAINT fk_disponibilidad_canal_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_disponibilidad_canal_variante_id ON disponibilidad_canal (variante_id);

ALTER TABLE disponibilidad_canal ADD CONSTRAINT fk_disponibilidad_canal_ubicacion_id FOREIGN KEY (ubicacion_id) REFERENCES ubicacion (id) ON DELETE RESTRICT;

CREATE INDEX ix_disponibilidad_canal_ubicacion_id ON disponibilidad_canal (ubicacion_id);

ALTER TABLE inventario ADD CONSTRAINT fk_inventario_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_inventario_variante_id ON inventario (variante_id);

ALTER TABLE inventario ADD CONSTRAINT fk_inventario_ubicacion_id FOREIGN KEY (ubicacion_id) REFERENCES ubicacion (id) ON DELETE RESTRICT;

CREATE INDEX ix_inventario_ubicacion_id ON inventario (ubicacion_id);

ALTER TABLE movimiento_stock ADD CONSTRAINT fk_movimiento_stock_inventario_id FOREIGN KEY (inventario_id) REFERENCES inventario (id) ON DELETE RESTRICT;

CREATE INDEX ix_movimiento_stock_inventario_id ON movimiento_stock (inventario_id);

ALTER TABLE movimiento_stock ADD CONSTRAINT fk_movimiento_stock_actor_id FOREIGN KEY (actor_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_movimiento_stock_actor_id ON movimiento_stock (actor_id);

ALTER TABLE movimiento_stock ADD CONSTRAINT fk_movimiento_stock_pedido_id FOREIGN KEY (pedido_id) REFERENCES pedido (id) ON DELETE RESTRICT;

CREATE INDEX ix_movimiento_stock_pedido_id ON movimiento_stock (pedido_id);

ALTER TABLE reserva_stock ADD CONSTRAINT fk_reserva_stock_detalle_pedido_id FOREIGN KEY (detalle_pedido_id) REFERENCES detalle_pedido (id) ON DELETE RESTRICT;

CREATE INDEX ix_reserva_stock_detalle_pedido_id ON reserva_stock (detalle_pedido_id);

ALTER TABLE reserva_stock ADD CONSTRAINT fk_reserva_stock_inventario_id FOREIGN KEY (inventario_id) REFERENCES inventario (id) ON DELETE RESTRICT;

CREATE INDEX ix_reserva_stock_inventario_id ON reserva_stock (inventario_id);

ALTER TABLE consentimiento ADD CONSTRAINT fk_consentimiento_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_consentimiento_usuario_id ON consentimiento (usuario_id);

ALTER TABLE captura_corporal ADD CONSTRAINT fk_captura_corporal_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_captura_corporal_usuario_id ON captura_corporal (usuario_id);

ALTER TABLE captura_corporal ADD CONSTRAINT fk_captura_corporal_consentimiento_id FOREIGN KEY (consentimiento_id) REFERENCES consentimiento (id) ON DELETE RESTRICT;

CREATE INDEX ix_captura_corporal_consentimiento_id ON captura_corporal (consentimiento_id);

ALTER TABLE foto_temporal ADD CONSTRAINT fk_foto_temporal_captura_id FOREIGN KEY (captura_id) REFERENCES captura_corporal (id) ON DELETE RESTRICT;

CREATE INDEX ix_foto_temporal_captura_id ON foto_temporal (captura_id);

ALTER TABLE trabajo_avatar ADD CONSTRAINT fk_trabajo_avatar_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_trabajo_avatar_usuario_id ON trabajo_avatar (usuario_id);

ALTER TABLE trabajo_avatar ADD CONSTRAINT fk_trabajo_avatar_captura_id FOREIGN KEY (captura_id) REFERENCES captura_corporal (id) ON DELETE RESTRICT;

CREATE INDEX ix_trabajo_avatar_captura_id ON trabajo_avatar (captura_id);

ALTER TABLE trabajo_avatar ADD CONSTRAINT fk_trabajo_avatar_avatar_id FOREIGN KEY (avatar_id) REFERENCES avatar (id) ON DELETE RESTRICT;

CREATE INDEX ix_trabajo_avatar_avatar_id ON trabajo_avatar (avatar_id);

ALTER TABLE avatar ADD CONSTRAINT fk_avatar_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_avatar_usuario_id ON avatar (usuario_id);

ALTER TABLE avatar ADD CONSTRAINT fk_avatar_plantilla_id FOREIGN KEY (plantilla_id) REFERENCES plantilla_corporal (id) ON DELETE RESTRICT;

CREATE INDEX ix_avatar_plantilla_id ON avatar (plantilla_id);

ALTER TABLE modelo_prenda ADD CONSTRAINT fk_modelo_prenda_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_modelo_prenda_variante_id ON modelo_prenda (variante_id);

ALTER TABLE modelo_prenda ADD CONSTRAINT fk_modelo_prenda_plantilla_id FOREIGN KEY (plantilla_id) REFERENCES plantilla_corporal (id) ON DELETE RESTRICT;

CREATE INDEX ix_modelo_prenda_plantilla_id ON modelo_prenda (plantilla_id);

ALTER TABLE modelo_prenda ADD CONSTRAINT fk_modelo_prenda_revisado_por FOREIGN KEY (revisado_por) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_modelo_prenda_revisado_por ON modelo_prenda (revisado_por);

ALTER TABLE sesion_vestidor ADD CONSTRAINT fk_sesion_vestidor_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_sesion_vestidor_usuario_id ON sesion_vestidor (usuario_id);

ALTER TABLE sesion_vestidor ADD CONSTRAINT fk_sesion_vestidor_avatar_id FOREIGN KEY (avatar_id) REFERENCES avatar (id) ON DELETE RESTRICT;

CREATE INDEX ix_sesion_vestidor_avatar_id ON sesion_vestidor (avatar_id);

ALTER TABLE evento_vestidor ADD CONSTRAINT fk_evento_vestidor_sesion_id FOREIGN KEY (sesion_id) REFERENCES sesion_vestidor (id) ON DELETE RESTRICT;

CREATE INDEX ix_evento_vestidor_sesion_id ON evento_vestidor (sesion_id);

ALTER TABLE evento_vestidor ADD CONSTRAINT fk_evento_vestidor_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_evento_vestidor_variante_id ON evento_vestidor (variante_id);

ALTER TABLE evento_vestidor ADD CONSTRAINT fk_evento_vestidor_modelo_id FOREIGN KEY (modelo_id) REFERENCES modelo_prenda (id) ON DELETE RESTRICT;

CREATE INDEX ix_evento_vestidor_modelo_id ON evento_vestidor (modelo_id);

ALTER TABLE carrito ADD CONSTRAINT fk_carrito_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_carrito_usuario_id ON carrito (usuario_id);

ALTER TABLE item_carrito ADD CONSTRAINT fk_item_carrito_carrito_id FOREIGN KEY (carrito_id) REFERENCES carrito (id) ON DELETE RESTRICT;

CREATE INDEX ix_item_carrito_carrito_id ON item_carrito (carrito_id);

ALTER TABLE item_carrito ADD CONSTRAINT fk_item_carrito_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_item_carrito_variante_id ON item_carrito (variante_id);

ALTER TABLE item_carrito ADD CONSTRAINT fk_item_carrito_evento_vestidor_id FOREIGN KEY (evento_vestidor_id) REFERENCES evento_vestidor (id) ON DELETE RESTRICT;

CREATE INDEX ix_item_carrito_evento_vestidor_id ON item_carrito (evento_vestidor_id);

ALTER TABLE pedido ADD CONSTRAINT fk_pedido_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_pedido_usuario_id ON pedido (usuario_id);

ALTER TABLE pedido ADD CONSTRAINT fk_pedido_vendedor_id FOREIGN KEY (vendedor_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_pedido_vendedor_id ON pedido (vendedor_id);

ALTER TABLE pedido ADD CONSTRAINT fk_pedido_ubicacion_id FOREIGN KEY (ubicacion_id) REFERENCES ubicacion (id) ON DELETE RESTRICT;

CREATE INDEX ix_pedido_ubicacion_id ON pedido (ubicacion_id);

ALTER TABLE pedido ADD CONSTRAINT fk_pedido_carrito_id FOREIGN KEY (carrito_id) REFERENCES carrito (id) ON DELETE RESTRICT;

CREATE INDEX ix_pedido_carrito_id ON pedido (carrito_id);

ALTER TABLE detalle_pedido ADD CONSTRAINT fk_detalle_pedido_pedido_id FOREIGN KEY (pedido_id) REFERENCES pedido (id) ON DELETE RESTRICT;

CREATE INDEX ix_detalle_pedido_pedido_id ON detalle_pedido (pedido_id);

ALTER TABLE detalle_pedido ADD CONSTRAINT fk_detalle_pedido_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_detalle_pedido_variante_id ON detalle_pedido (variante_id);

ALTER TABLE pago ADD CONSTRAINT fk_pago_pedido_id FOREIGN KEY (pedido_id) REFERENCES pedido (id) ON DELETE RESTRICT;

CREATE INDEX ix_pago_pedido_id ON pago (pedido_id);

ALTER TABLE evento_pago ADD CONSTRAINT fk_evento_pago_pago_id FOREIGN KEY (pago_id) REFERENCES pago (id) ON DELETE RESTRICT;

CREATE INDEX ix_evento_pago_pago_id ON evento_pago (pago_id);

ALTER TABLE devolucion ADD CONSTRAINT fk_devolucion_pedido_id FOREIGN KEY (pedido_id) REFERENCES pedido (id) ON DELETE RESTRICT;

CREATE INDEX ix_devolucion_pedido_id ON devolucion (pedido_id);

ALTER TABLE devolucion ADD CONSTRAINT fk_devolucion_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_devolucion_usuario_id ON devolucion (usuario_id);

ALTER TABLE devolucion ADD CONSTRAINT fk_devolucion_revisado_por FOREIGN KEY (revisado_por) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_devolucion_revisado_por ON devolucion (revisado_por);

ALTER TABLE detalle_devolucion ADD CONSTRAINT fk_detalle_devolucion_devolucion_id FOREIGN KEY (devolucion_id) REFERENCES devolucion (id) ON DELETE RESTRICT;

CREATE INDEX ix_detalle_devolucion_devolucion_id ON detalle_devolucion (devolucion_id);

ALTER TABLE detalle_devolucion ADD CONSTRAINT fk_detalle_devolucion_detalle_pedido_id FOREIGN KEY (detalle_pedido_id) REFERENCES detalle_pedido (id) ON DELETE RESTRICT;

CREATE INDEX ix_detalle_devolucion_detalle_pedido_id ON detalle_devolucion (detalle_pedido_id);

ALTER TABLE detalle_devolucion ADD CONSTRAINT fk_detalle_devolucion_ubicacion_id FOREIGN KEY (ubicacion_id) REFERENCES ubicacion (id) ON DELETE RESTRICT;

CREATE INDEX ix_detalle_devolucion_ubicacion_id ON detalle_devolucion (ubicacion_id);

ALTER TABLE reembolso ADD CONSTRAINT fk_reembolso_pago_id FOREIGN KEY (pago_id) REFERENCES pago (id) ON DELETE RESTRICT;

CREATE INDEX ix_reembolso_pago_id ON reembolso (pago_id);

ALTER TABLE reembolso ADD CONSTRAINT fk_reembolso_devolucion_id FOREIGN KEY (devolucion_id) REFERENCES devolucion (id) ON DELETE RESTRICT;

CREATE INDEX ix_reembolso_devolucion_id ON reembolso (devolucion_id);

ALTER TABLE historial_pedido ADD CONSTRAINT fk_historial_pedido_pedido_id FOREIGN KEY (pedido_id) REFERENCES pedido (id) ON DELETE RESTRICT;

CREATE INDEX ix_historial_pedido_pedido_id ON historial_pedido (pedido_id);

ALTER TABLE historial_pedido ADD CONSTRAINT fk_historial_pedido_actor_id FOREIGN KEY (actor_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_historial_pedido_actor_id ON historial_pedido (actor_id);

ALTER TABLE ejecucion_analitica ADD CONSTRAINT fk_ejecucion_analitica_modelo_id FOREIGN KEY (modelo_id) REFERENCES modelo_analitico (id) ON DELETE RESTRICT;

CREATE INDEX ix_ejecucion_analitica_modelo_id ON ejecucion_analitica (modelo_id);

ALTER TABLE ejecucion_analitica ADD CONSTRAINT fk_ejecucion_analitica_solicitante_id FOREIGN KEY (solicitante_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_ejecucion_analitica_solicitante_id ON ejecucion_analitica (solicitante_id);

ALTER TABLE prediccion ADD CONSTRAINT fk_prediccion_ejecucion_id FOREIGN KEY (ejecucion_id) REFERENCES ejecucion_analitica (id) ON DELETE RESTRICT;

CREATE INDEX ix_prediccion_ejecucion_id ON prediccion (ejecucion_id);

ALTER TABLE prediccion ADD CONSTRAINT fk_prediccion_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_prediccion_variante_id ON prediccion (variante_id);

ALTER TABLE prediccion ADD CONSTRAINT fk_prediccion_ubicacion_id FOREIGN KEY (ubicacion_id) REFERENCES ubicacion (id) ON DELETE RESTRICT;

CREATE INDEX ix_prediccion_ubicacion_id ON prediccion (ubicacion_id);

ALTER TABLE anomalia ADD CONSTRAINT fk_anomalia_ejecucion_id FOREIGN KEY (ejecucion_id) REFERENCES ejecucion_analitica (id) ON DELETE RESTRICT;

CREATE INDEX ix_anomalia_ejecucion_id ON anomalia (ejecucion_id);

ALTER TABLE anomalia ADD CONSTRAINT fk_anomalia_revisado_por FOREIGN KEY (revisado_por) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_anomalia_revisado_por ON anomalia (revisado_por);

ALTER TABLE recomendacion ADD CONSTRAINT fk_recomendacion_ejecucion_id FOREIGN KEY (ejecucion_id) REFERENCES ejecucion_analitica (id) ON DELETE RESTRICT;

CREATE INDEX ix_recomendacion_ejecucion_id ON recomendacion (ejecucion_id);

ALTER TABLE recomendacion ADD CONSTRAINT fk_recomendacion_variante_id FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE RESTRICT;

CREATE INDEX ix_recomendacion_variante_id ON recomendacion (variante_id);

ALTER TABLE recomendacion ADD CONSTRAINT fk_recomendacion_origen_id FOREIGN KEY (origen_id) REFERENCES ubicacion (id) ON DELETE RESTRICT;

CREATE INDEX ix_recomendacion_origen_id ON recomendacion (origen_id);

ALTER TABLE recomendacion ADD CONSTRAINT fk_recomendacion_destino_id FOREIGN KEY (destino_id) REFERENCES ubicacion (id) ON DELETE RESTRICT;

CREATE INDEX ix_recomendacion_destino_id ON recomendacion (destino_id);

ALTER TABLE recomendacion ADD CONSTRAINT fk_recomendacion_revisado_por FOREIGN KEY (revisado_por) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_recomendacion_revisado_por ON recomendacion (revisado_por);

ALTER TABLE consulta_analitica ADD CONSTRAINT fk_consulta_analitica_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_consulta_analitica_usuario_id ON consulta_analitica (usuario_id);

ALTER TABLE consulta_analitica ADD CONSTRAINT fk_consulta_analitica_modelo_id FOREIGN KEY (modelo_id) REFERENCES modelo_analitico (id) ON DELETE RESTRICT;

CREATE INDEX ix_consulta_analitica_modelo_id ON consulta_analitica (modelo_id);

ALTER TABLE aviso ADD CONSTRAINT fk_aviso_autor_id FOREIGN KEY (autor_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_aviso_autor_id ON aviso (autor_id);

ALTER TABLE dispositivo ADD CONSTRAINT fk_dispositivo_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_dispositivo_usuario_id ON dispositivo (usuario_id);

ALTER TABLE notificacion ADD CONSTRAINT fk_notificacion_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_notificacion_usuario_id ON notificacion (usuario_id);

ALTER TABLE notificacion ADD CONSTRAINT fk_notificacion_evento_id FOREIGN KEY (evento_id) REFERENCES outbox_evento (id) ON DELETE RESTRICT;

CREATE INDEX ix_notificacion_evento_id ON notificacion (evento_id);

ALTER TABLE notificacion ADD CONSTRAINT fk_notificacion_dispositivo_id FOREIGN KEY (dispositivo_id) REFERENCES dispositivo (id) ON DELETE RESTRICT;

CREATE INDEX ix_notificacion_dispositivo_id ON notificacion (dispositivo_id);

ALTER TABLE configuracion ADD CONSTRAINT fk_configuracion_autor_id FOREIGN KEY (autor_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_configuracion_autor_id ON configuracion (autor_id);

ALTER TABLE auditoria ADD CONSTRAINT fk_auditoria_actor_id FOREIGN KEY (actor_id) REFERENCES usuario (id) ON DELETE RESTRICT;

CREATE INDEX ix_auditoria_actor_id ON auditoria (actor_id);

CREATE UNIQUE INDEX usuario_correo_ci ON usuario (lower(correo));

CREATE UNIQUE INDEX direccion_principal ON direccion (usuario_id) WHERE predeterminada AND activa;

CREATE UNIQUE INDEX carrito_activo ON carrito (usuario_id, canal) WHERE estado = 'ACTIVO';

CREATE UNIQUE INDEX avatar_aprobado ON avatar (usuario_id) WHERE estado = 'APROBADO';

CREATE UNIQUE INDEX modelo_publicado ON modelo_prenda (variante_id, plantilla_id) WHERE estado = 'PUBLICADO';

CREATE UNIQUE INDEX reserva_vigente ON reserva_stock (detalle_pedido_id, inventario_id) WHERE estado IN ('ACTIVA','COMPROMETIDA');

CREATE UNIQUE INDEX notificacion_sin_dispositivo ON notificacion (usuario_id, evento_id) WHERE dispositivo_id IS NULL;

CREATE UNIQUE INDEX pedido_cobro_confirmado ON pago (pedido_id) WHERE estado = 'CONFIRMADO';

CREATE INDEX reserva_expiracion ON reserva_stock (vence_en) WHERE estado = 'ACTIVA';

CREATE INDEX fotos_purga ON captura_corporal (purgar_antes_de) WHERE purgada_en IS NULL;

CREATE INDEX trabajos_pendientes ON trabajo_avatar (estado, creado_en);

CREATE INDEX eventos_pendientes ON outbox_evento (creado_en) WHERE publicado_en IS NULL;

CREATE INDEX pedido_periodo ON pedido (creado_en, canal, estado);

COMMIT;


-- Reglas transaccionales que debe implementar y probar la aplicación:

-- El servicio de inventario bloquea filas en orden estable con SELECT FOR UPDATE y realiza movimientos, reservas, saldos y outbox dentro de una transacción; el esquema por sí solo no implementa ese protocolo.

-- Cada transferencia enlaza dos movimientos con el mismo grupo_operacion; sus deltas físicos suman cero y corresponden a la misma variante. No se ofrecen entradas futuras no registradas.

-- La suma de reservas activas por inventario debe coincidir con reservado; las comprometidas con comprometido. Toda liberación y despacho cambia estado una sola vez.

-- Un pago confirmado no puede superar el total del pedido ni repetirse para el mismo pedido. Los reembolsos confirmados o pendientes se suman con bloqueo del pago y no pueden superar el cobro.

-- Las cantidades devueltas acumuladas no superan las vendidas. Validar que detalle_devolucion pertenece al pedido indicado por devolucion y que cada modelo o imagen por variante pertenece a la prenda correcta.

-- Precios y configuraciones de una misma clave no tendrán vigencias superpuestas; el servicio valida rangos dentro de transacción. Los importes finales se redondean a dos decimales con una regla única.

-- El propietario de captura, consentimiento, trabajo y avatar debe coincidir. El backend valida esta relación cruzada y no confía en IDs enviados por el cliente.

-- Captura VALIDADA exige exactamente tres fotos aprobadas, una por vista, altura y consentimiento vigente. Después de la purga se conserva solo trazabilidad técnica.

-- Medidas y parametros_malla son JSONB acotados por contrato: altura, pecho, cintura, cadera, largoBrazo y largoPierna; cada medida registra valor_cm, origen y confianza. No son campos libres.

-- Eliminar avatar establece ELIMINANDO y revoca lectura. El worker borra GLB, derivados, medidas y parámetros en avatar, captura y trabajo; únicamente después marca ELIMINADO. Comprobar revocación antes de publicar resultados tardíos.

-- El borrado de fotos limpia clave_objeto, validacion y altura_cm cuando ya no se necesitan; se verifican todos los objetos privados. Respaldos de fotos están deshabilitados y los temporales del worker siguen el mismo vencimiento.

-- La eliminación no borra ventas. Los eventos del vestidor usados en reportes se desvinculan del avatar y se agregan sin medidas ni imágenes. Permisos de reportes impiden acceso a recursos corporales.

-- La jerarquía de ubicaciones no admite ciclos; caja pertenece a tienda. La disponibilidad de variantes solo usa ubicaciones activas autorizadas.

-- Las FK usan RESTRICT para proteger historial. Desactivar catálogo o usuarios conserva integridad; las purgas privadas son explícitas y no dependen de cascadas amplias.

-- Preferencias y plantillas tienen esquemas JSON validados: eventos permitidos, habilitación push y texto; los destinatarios siempre se resuelven en servidor.

-- El identificador entidad_id de auditoría, anomalía y outbox es una referencia polimórfica validada por entidad_tipo o tipo; no se presenta como FK física.
