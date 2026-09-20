export type Identity = {
  id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  roles: string[];
  permissions: string[];
};

export type LocationAvailability = {
  id: string;
  nombre: string;
  tipo: 'TIENDA' | 'ALMACEN';
  disponible: number;
};

export type Variant = {
  id: string;
  talla: string;
  color: string;
  color_hex?: string;
  precio: number;
  disponible: number;
  ubicaciones: LocationAvailability[];
  arImagePath?: string | null;
};

export type Product = {
  id: string;
  nombre: string;
  descripcion: string;
  material: string;
  variantes: Variant[];
};

export type CatalogLocation = {
  id: string;
  nombre: string;
  tipo: 'TIENDA' | 'ALMACEN';
};

export type Catalog = { products: Product[]; locations: CatalogLocation[] };
