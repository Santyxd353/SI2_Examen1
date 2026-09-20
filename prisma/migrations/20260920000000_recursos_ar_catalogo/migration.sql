ALTER TABLE recurso_catalogo
  ADD COLUMN uso varchar(20) NOT NULL DEFAULT 'GALERIA',
  ADD COLUMN estado varchar(20) NOT NULL DEFAULT 'BORRADOR';

ALTER TABLE recurso_catalogo
  ADD CONSTRAINT ck_recurso_catalogo_uso CHECK (uso IN ('GALERIA', 'AR')),
  ADD CONSTRAINT ck_recurso_catalogo_estado CHECK (estado IN ('BORRADOR', 'PUBLICADO'));

CREATE INDEX ix_recurso_catalogo_variante_uso_estado
  ON recurso_catalogo (variante_id, uso, estado);
