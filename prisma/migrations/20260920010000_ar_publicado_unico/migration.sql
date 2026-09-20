CREATE UNIQUE INDEX ux_recurso_catalogo_ar_publicado_variante
  ON recurso_catalogo (variante_id)
  WHERE uso = 'AR' AND estado = 'PUBLICADO';
