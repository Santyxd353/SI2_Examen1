DROP INDEX IF EXISTS carrito_activo;

CREATE UNIQUE INDEX carrito_activo
  ON carrito (usuario_id, canal)
  WHERE estado = 'ACTIVO';
