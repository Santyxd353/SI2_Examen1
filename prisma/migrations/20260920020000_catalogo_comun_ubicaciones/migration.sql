-- Cada prenda publicada pertenece al surtido de todas las ubicaciones activas,
-- aunque las existencias comiencen en cero y se administren por separado.
INSERT INTO inventario (variante_id, ubicacion_id, fisico, reservado, comprometido, version)
SELECT v.id, u.id, 0, 0, 0, 0
FROM variante v
JOIN producto p ON p.id = v.producto_id AND p.estado = 'PUBLICADO'
CROSS JOIN ubicacion u
WHERE v.activa AND u.activa
ON CONFLICT (variante_id, ubicacion_id) DO NOTHING;

INSERT INTO disponibilidad_canal
  (variante_id, ubicacion_id, canal, habilitada, stock_seguridad, plazo_reposicion_dias)
SELECT v.id, u.id, c.canal, TRUE, 0, 0
FROM variante v
JOIN producto p ON p.id = v.producto_id AND p.estado = 'PUBLICADO'
CROSS JOIN ubicacion u
CROSS JOIN (VALUES ('WEB'), ('APP')) AS c(canal)
WHERE v.activa AND u.activa
ON CONFLICT (variante_id, ubicacion_id, canal) DO NOTHING;
