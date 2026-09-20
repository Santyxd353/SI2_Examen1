import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  History,
  PackagePlus,
  Pencil,
  Power,
  UserCog,
  UserPlus,
} from 'lucide-react';
import { api } from './api';

type Location = {
  id: string;
  nombre: string;
  tipo: 'TIENDA' | 'ALMACEN';
  direccion?: string;
  activa: boolean;
  _count: { inventario: number; usuario_ubicacion: number };
  usuario_ubicacion: { usuario: { id: string; nombres: string; apellidos: string } }[];
};
type Staff = {
  id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  estado: string;
  usuario_rol: { rol: { nombre: string } }[];
  usuario_ubicacion: { ubicacion_id: string }[];
};
type Product = {
  id: string;
  nombre: string;
  variantes: { id: string; talla: string; color: string }[];
};
type Movement = {
  id: string;
  tipo: string;
  deltaFisico: number;
  conteoObservado?: number;
  motivo: string;
  creadoEn: string;
  actor: { nombres: string; apellidos: string };
  variante: { sku: string; talla: string; color: string; producto: { nombre: string } };
  contraparte?: { nombre: string };
};
type InventoryRow = {
  id: string;
  variante_id: string;
  fisico: number;
  reservado: number;
  comprometido: number;
  disponible: number;
  stockSeguridad: number;
  plazoReposicionDias: number;
  alertaStock: boolean;
  variante: { sku: string; talla: string; color: string; producto: { nombre: string } };
};
type StockAlert = {
  ubicacion_id: string;
  ubicacion: string;
  variante_id: string;
  producto: string;
  sku: string;
  talla: string;
  color: string;
  disponible: number;
  stock_seguridad: number;
};

export function Admin({ products, permissions }: { products: Product[]; permissions: string[] }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyLocation, setHistoryLocation] = useState<Location | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffLocations, setStaffLocations] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [inventoryLocation, setInventoryLocation] = useState<Location | null>(null);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [countingRow, setCountingRow] = useState<InventoryRow | null>(null);
  const [thresholdRow, setThresholdRow] = useState<InventoryRow | null>(null);
  const managesLocations = permissions.includes('ubicaciones:gestionar');
  const managesUsers = permissions.includes('usuarios:gestionar');
  const managesInventory = permissions.includes('inventario:gestionar');
  const variants = useMemo(
    () =>
      products.flatMap((product) =>
        product.variantes.map((variant) => ({ ...variant, producto: product.nombre })),
      ),
    [products],
  );

  async function reload() {
    const [locationData, staffData, alertData] = await Promise.all([
      api('/locations'),
      managesUsers ? api('/staff') : Promise.resolve([]),
      api('/locations/inventory/alerts'),
    ]);
    setLocations(locationData);
    setStaff(staffData);
    setAlerts(alertData);
  }

  async function showInventory(location: Location) {
    setError('');
    try {
      setInventory(await api(`/locations/${location.id}/inventory`));
      setInventoryLocation(location);
      setCountingRow(null);
      setThresholdRow(null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function showHistory(location: Location) {
    setError('');
    try {
      setMovements(await api(`/locations/${location.id}/movements`));
      setHistoryLocation(location);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  useEffect(() => {
    void reload().catch((reason) => setError(reason.message));
  }, []);

  async function submit(
    path: string,
    form: HTMLFormElement,
    transform?: (data: Record<string, string>) => unknown,
  ) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
      await api(path, {
        method: 'POST',
        body: JSON.stringify(transform ? transform(values) : values),
      });
      form.reset();
      await reload();
      if (inventoryLocation)
        setInventory(await api(`/locations/${inventoryLocation.id}/inventory`));
      setMessage('Cambios guardados correctamente.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLocation) return;
    setBusy(true);
    setError('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<
        string,
        string
      >;
      await api(`/locations/${editingLocation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre: values.nombre,
          tipo: values.tipo,
          direccion: values.direccion,
        }),
      });
      setEditingLocation(null);
      await reload();
      setMessage('Ubicación actualizada correctamente.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(location: Location) {
    if (
      !window.confirm(
        `¿Desactivar ${location.nombre}? El historial se conservará y dejará de aparecer en el catálogo.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/locations/${location.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activa: false }),
      });
      await reload();
      setMessage('Ubicación desactivada. Su historial se conserva.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function editAssignments(person: Staff) {
    setEditingStaff(person);
    setStaffLocations(person.usuario_ubicacion.map((assignment) => assignment.ubicacion_id));
  }

  async function saveAssignments() {
    if (!editingStaff) return;
    setBusy(true);
    setError('');
    try {
      const previous = new Set(
        editingStaff.usuario_ubicacion.map((assignment) => assignment.ubicacion_id),
      );
      const next = new Set(staffLocations);
      await Promise.all([
        ...[...next]
          .filter((locationId) => !previous.has(locationId))
          .map((locationId) =>
            api(`/locations/${locationId}/assignments`, {
              method: 'POST',
              body: JSON.stringify({ usuarioId: editingStaff.id }),
            }),
          ),
        ...[...previous]
          .filter((locationId) => !next.has(locationId))
          .map((locationId) =>
            api(`/locations/${locationId}/assignments/${editingStaff.id}`, {
              method: 'DELETE',
            }),
          ),
      ]);
      setEditingStaff(null);
      await reload();
      setMessage('Asignaciones actualizadas correctamente.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inventoryLocation || !countingRow) return;
    setBusy(true);
    setError('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<
        string,
        string
      >;
      await api(`/locations/${inventoryLocation.id}/inventory/counts`, {
        method: 'POST',
        body: JSON.stringify({
          varianteId: countingRow.variante_id,
          conteoObservado: Number(values.conteoObservado),
          motivo: values.motivo,
        }),
      });
      setInventory(await api(`/locations/${inventoryLocation.id}/inventory`));
      setAlerts(await api('/locations/inventory/alerts'));
      setCountingRow(null);
      setMessage('Conteo conciliado y movimiento registrado.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveThreshold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inventoryLocation || !thresholdRow) return;
    setBusy(true);
    setError('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<
        string,
        string
      >;
      await api(
        `/locations/${inventoryLocation.id}/inventory/${thresholdRow.variante_id}/threshold`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            stockSeguridad: Number(values.stockSeguridad),
            plazoReposicionDias: Number(values.plazoReposicionDias),
          }),
        },
      );
      setInventory(await api(`/locations/${inventoryLocation.id}/inventory`));
      setAlerts(await api('/locations/inventory/alerts'));
      setThresholdRow(null);
      setMessage('Mínimo de stock actualizado.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-page">
      <div className="section-title">
        <span className="eyebrow">OPERACIÓN MULTISUCURSAL</span>
        <h1>Sucursales, almacenes y responsables</h1>
        <p>
          Registra ubicaciones, asigna vendedores o analistas y actualiza existencias por variante.
        </p>
      </div>
      {error && <div className="message error">{error}</div>}
      {message && <div className="message">{message}</div>}
      {alerts.length > 0 && (
        <div className="stock-alerts" role="status">
          <div>
            <span className="eyebrow">ATENCIÓN DE INVENTARIO</span>
            <h2>
              {alerts.length} {alerts.length === 1 ? 'alerta activa' : 'alertas activas'}
            </h2>
          </div>
          {alerts.slice(0, 6).map((alert) => (
            <button
              key={`${alert.ubicacion_id}-${alert.variante_id}`}
              onClick={() => {
                const location = locations.find((item) => item.id === alert.ubicacion_id);
                if (location) void showInventory(location);
              }}
            >
              <b>
                {alert.producto} · {alert.talla}
              </b>
              <span>
                {alert.ubicacion}: {alert.disponible} disponibles / mínimo {alert.stock_seguridad}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="admin-grid">
        {managesLocations && (
          <form
            className="admin-card"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void submit('/locations', event.currentTarget);
            }}
          >
            <Building2 size={24} />
            <h2>Nueva ubicación</h2>
            <label>
              Nombre
              <input name="nombre" minLength={2} required />
            </label>
            <label>
              Tipo
              <select name="tipo">
                <option value="TIENDA">Sucursal</option>
                <option value="ALMACEN">Almacén</option>
              </select>
            </label>
            <label>
              Dirección
              <input name="direccion" minLength={5} required />
            </label>
            <button className="primary" disabled={busy}>
              Crear ubicación
            </button>
          </form>
        )}
        {managesUsers && (
          <form
            className="admin-card"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void submit('/staff', event.currentTarget, (values) => ({
                nombres: values.nombres,
                apellidos: values.apellidos,
                correo: values.correo,
                clave: values.clave,
                rol: values.rol,
                ubicaciones: values.ubicacion ? [values.ubicacion] : [],
              }));
            }}
          >
            <UserPlus size={24} />
            <h2>Nuevo responsable</h2>
            <div className="two-fields">
              <label>
                Nombres
                <input name="nombres" required />
              </label>
              <label>
                Apellidos
                <input name="apellidos" required />
              </label>
            </div>
            <label>
              Correo
              <input name="correo" type="email" required />
            </label>
            <label>
              Contraseña inicial
              <input name="clave" type="password" minLength={10} required />
            </label>
            <div className="two-fields">
              <label>
                Rol
                <select name="rol">
                  <option>Vendedor</option>
                  <option>Analista</option>
                </select>
              </label>
              <label>
                Ubicación
                <select name="ubicacion" required>
                  <option value="">Seleccionar</option>
                  {locations
                    .filter((x) => x.activa)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <button className="primary" disabled={busy || locations.length === 0}>
              Crear y asignar
            </button>
          </form>
        )}
        {managesInventory && (
          <form
            className="admin-card"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = event.currentTarget;
              const locationId = String(new FormData(form).get('ubicacion'));
              void submit(`/locations/${locationId}/inventory/adjustments`, form, (values) => ({
                varianteId: values.varianteId,
                delta: Number(values.delta),
                motivo: values.motivo,
              }));
            }}
          >
            <PackagePlus size={24} />
            <h2>Ajustar existencias</h2>
            <label>
              Ubicación
              <select name="ubicacion" required>
                <option value="">Seleccionar</option>
                {locations
                  .filter((x) => x.activa)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Prenda y variante
              <select name="varianteId" required>
                <option value="">Seleccionar</option>
                {variants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.producto} · {x.talla} · {x.color}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cantidad (+ entrada / − salida)
              <input name="delta" type="number" min="-100000" max="100000" required />
            </label>
            <label>
              Motivo
              <input name="motivo" minLength={5} required />
            </label>
            <button className="primary" disabled={busy || variants.length === 0}>
              Registrar ajuste
            </button>
          </form>
        )}
        {managesInventory && (
          <form
            className="admin-card"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void submit('/locations/transfers', event.currentTarget, (values) => ({
                origenId: values.origenId,
                destinoId: values.destinoId,
                varianteId: values.varianteId,
                cantidad: Number(values.cantidad),
                motivo: values.motivo,
              }));
            }}
          >
            <ArrowRightLeft size={24} />
            <h2>Transferir existencias</h2>
            <div className="two-fields">
              <label>
                Origen
                <select name="origenId" required>
                  <option value="">Seleccionar</option>
                  {locations
                    .filter((x) => x.activa)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Destino
                <select name="destinoId" required>
                  <option value="">Seleccionar</option>
                  {locations
                    .filter((x) => x.activa)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Prenda y variante
              <select name="varianteId" required>
                <option value="">Seleccionar</option>
                {variants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.producto} · {x.talla} · {x.color}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cantidad
              <input name="cantidad" type="number" min="1" max="100000" required />
            </label>
            <label>
              Motivo
              <input name="motivo" minLength={5} required />
            </label>
            <button className="primary" disabled={busy || locations.length < 2}>
              Confirmar transferencia
            </button>
          </form>
        )}
      </div>
      <div className="location-list">
        <h2>Ubicaciones registradas</h2>
        {locations.map((location) => (
          <article key={location.id}>
            <div>
              <b>{location.nombre}</b>
              <span>
                {location.tipo === 'TIENDA' ? 'Sucursal' : 'Almacén'} ·{' '}
                {location.direccion || 'Sin dirección'} {!location.activa && '· Inactiva'}
              </span>
            </div>
            <div>
              <b>{location._count.inventario}</b>
              <span>variantes</span>
            </div>
            <div>
              <b>{location._count.usuario_ubicacion}</b>
              <span>responsables</span>
            </div>
            <small>
              {location.usuario_ubicacion
                .map((x) => `${x.usuario.nombres} ${x.usuario.apellidos}`)
                .join(', ') || 'Sin personal asignado'}
            </small>
            <div className="row-actions">
              <button className="text-button" onClick={() => void showInventory(location)}>
                <PackagePlus size={15} /> Inventario
              </button>
              <button className="text-button" onClick={() => void showHistory(location)}>
                <History size={15} /> Movimientos
              </button>
              {managesLocations && location.activa && (
                <>
                  <button className="text-button" onClick={() => setEditingLocation(location)}>
                    <Pencil size={15} /> Editar
                  </button>
                  <button className="text-button danger" onClick={() => void deactivate(location)}>
                    <Power size={15} /> Desactivar
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {editingLocation && (
        <form className="editor-panel" onSubmit={updateLocation}>
          <div>
            <span className="eyebrow">EDITAR UBICACIÓN</span>
            <h2>{editingLocation.nombre}</h2>
          </div>
          <label>
            Nombre
            <input name="nombre" defaultValue={editingLocation.nombre} minLength={2} required />
          </label>
          <label>
            Tipo
            <select name="tipo" defaultValue={editingLocation.tipo}>
              <option value="TIENDA">Sucursal</option>
              <option value="ALMACEN">Almacén</option>
            </select>
          </label>
          <label>
            Dirección
            <input
              name="direccion"
              defaultValue={editingLocation.direccion || ''}
              minLength={5}
              required
            />
          </label>
          <div className="row-actions">
            <button className="primary" disabled={busy}>
              Guardar cambios
            </button>
            <button type="button" className="text-button" onClick={() => setEditingLocation(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {inventoryLocation && (
        <div className="inventory-detail">
          <div className="movement-heading">
            <div>
              <span className="eyebrow">INVENTARIO DETALLADO</span>
              <h2>{inventoryLocation.nombre}</h2>
            </div>
            <button className="text-button" onClick={() => setInventoryLocation(null)}>
              Cerrar
            </button>
          </div>
          <div className="inventory-head">
            <span>Prenda y variante</span>
            <span>Físico</span>
            <span>Reservado</span>
            <span>Comprometido</span>
            <span>Disponible</span>
            <span>Mínimo</span>
            <span>Estado</span>
            <span>Acciones</span>
          </div>
          {inventory.map((row) => (
            <article className="inventory-row" key={row.id}>
              <div>
                <b>{row.variante.producto.nombre}</b>
                <span>
                  {row.variante.sku} · {row.variante.talla} · {row.variante.color}
                </span>
              </div>
              <strong>{row.fisico}</strong>
              <span>{row.reservado}</span>
              <span>{row.comprometido}</span>
              <strong>{row.disponible}</strong>
              <span>{row.stockSeguridad}</span>
              <span className={row.alertaStock ? 'stock-warning' : 'stock-ok'}>
                {row.alertaStock ? 'Stock bajo' : 'Disponible'}
              </span>
              <div className="row-actions">
                {managesInventory && (
                  <button className="text-button" onClick={() => setCountingRow(row)}>
                    Contar
                  </button>
                )}
                {managesInventory && (
                  <button className="text-button" onClick={() => setThresholdRow(row)}>
                    Mínimo
                  </button>
                )}
              </div>
            </article>
          ))}
          {inventory.length === 0 && (
            <p className="fineprint">Esta ubicación todavía no tiene inventario.</p>
          )}
        </div>
      )}
      {countingRow && inventoryLocation && (
        <form className="editor-panel" onSubmit={saveCount}>
          <div>
            <span className="eyebrow">CONTEO FÍSICO</span>
            <h2>
              {countingRow.variante.producto.nombre} · {countingRow.variante.talla}
            </h2>
          </div>
          <label>
            Unidades observadas
            <input
              name="conteoObservado"
              type="number"
              min="0"
              defaultValue={countingRow.fisico}
              required
            />
          </label>
          <label>
            Motivo
            <input name="motivo" minLength={5} defaultValue="Conteo físico periódico" required />
          </label>
          <div className="row-actions">
            <button className="primary" disabled={busy}>
              Conciliar conteo
            </button>
            <button type="button" className="text-button" onClick={() => setCountingRow(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {thresholdRow && inventoryLocation && (
        <form className="editor-panel" onSubmit={saveThreshold}>
          <div>
            <span className="eyebrow">MÍNIMO DE STOCK</span>
            <h2>
              {thresholdRow.variante.producto.nombre} · {thresholdRow.variante.talla}
            </h2>
          </div>
          <label>
            Stock mínimo
            <input
              name="stockSeguridad"
              type="number"
              min="0"
              defaultValue={thresholdRow.stockSeguridad}
              required
            />
          </label>
          <label>
            Reposición en días
            <input
              name="plazoReposicionDias"
              type="number"
              min="0"
              max="365"
              defaultValue={thresholdRow.plazoReposicionDias}
              required
            />
          </label>
          <div className="row-actions">
            <button className="primary" disabled={busy}>
              Guardar mínimo
            </button>
            <button type="button" className="text-button" onClick={() => setThresholdRow(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {managesUsers && (
        <div className="staff-list">
          <h2>Personal y asignaciones</h2>
          {staff.map((person) => {
            const assignedNames = person.usuario_ubicacion
              .map(
                (assignment) =>
                  locations.find((location) => location.id === assignment.ubicacion_id)?.nombre,
              )
              .filter(Boolean);
            return (
              <article key={person.id}>
                <div>
                  <b>
                    {person.nombres} {person.apellidos}
                  </b>
                  <span>
                    {person.usuario_rol.map((item) => item.rol.nombre).join(', ')} · {person.correo}
                  </span>
                </div>
                <span>{assignedNames.join(', ') || 'Sin ubicación asignada'}</span>
                <button className="text-button" onClick={() => editAssignments(person)}>
                  <UserCog size={16} /> Gestionar ubicaciones
                </button>
              </article>
            );
          })}
          {staff.length === 0 && (
            <p className="fineprint">Todavía no hay vendedores o analistas.</p>
          )}
        </div>
      )}
      {editingStaff && (
        <div className="editor-panel assignment-editor">
          <div>
            <span className="eyebrow">ASIGNAR UBICACIONES</span>
            <h2>
              {editingStaff.nombres} {editingStaff.apellidos}
            </h2>
          </div>
          <div className="assignment-options">
            {locations.map((location) => (
              <label key={location.id}>
                <input
                  type="checkbox"
                  checked={staffLocations.includes(location.id)}
                  disabled={!location.activa && !staffLocations.includes(location.id)}
                  onChange={(event) =>
                    setStaffLocations((current) =>
                      event.target.checked
                        ? [...new Set([...current, location.id])]
                        : current.filter((id) => id !== location.id),
                    )
                  }
                />
                <span>
                  {location.nombre}
                  <small>
                    {location.tipo === 'TIENDA' ? 'Sucursal' : 'Almacén'}
                    {!location.activa ? ' · Inactiva' : ''}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="row-actions">
            <button className="primary" disabled={busy} onClick={() => void saveAssignments()}>
              Guardar asignaciones
            </button>
            <button className="text-button" onClick={() => setEditingStaff(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {historyLocation && (
        <div className="movement-history">
          <div className="movement-heading">
            <div>
              <span className="eyebrow">HISTORIAL DE INVENTARIO</span>
              <h2>{historyLocation.nombre}</h2>
            </div>
            <button className="text-button" onClick={() => setHistoryLocation(null)}>
              Cerrar
            </button>
          </div>
          {movements.length === 0 ? (
            <p className="fineprint">Todavía no hay movimientos registrados.</p>
          ) : (
            movements.map((movement) => (
              <article className="movement-row" key={movement.id}>
                <time>
                  {new Intl.DateTimeFormat('es-BO', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(movement.creadoEn))}
                </time>
                <div>
                  <b>{movement.variante.producto.nombre}</b>
                  <span>
                    {movement.variante.sku} · {movement.variante.talla} · {movement.variante.color}
                  </span>
                </div>
                <strong className={movement.deltaFisico > 0 ? 'positive' : 'negative'}>
                  {movement.deltaFisico > 0 ? '+' : ''}
                  {movement.deltaFisico}
                </strong>
                <div>
                  <b>
                    {movement.tipo === 'TRANSFERENCIA' && movement.contraparte
                      ? `${movement.deltaFisico > 0 ? 'Desde' : 'Hacia'} ${movement.contraparte.nombre}`
                      : movement.tipo}
                  </b>
                  <span>{movement.motivo}</span>
                </div>
                <small>
                  {movement.actor.nombres} {movement.actor.apellidos}
                </small>
              </article>
            ))
          )}
        </div>
      )}
      {staff.length > 0 && (
        <p className="fineprint">
          Personal activo: {staff.length}. Cada vendedor o analista consulta únicamente las
          ubicaciones que tenga asignadas.
        </p>
      )}
    </section>
  );
}
