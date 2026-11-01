-- =====================================================================================================================
-- Zenit POS · esquema de la nube (Supabase / Postgres)
-- Se pega UNA vez en Supabase → SQL Editor → Run. Se puede volver a ejecutar sin romper nada (es idempotente).
--
-- Quién puede qué (se hace cumplir en la BASE DE DATOS con RLS, no en la app):
--   · usuario "caja"  : escribe y lee SOLO los datos de su negocio (la caja sube ventas con él). No puede borrar nada.
--   · usuario "dueño" : solo LEE los datos de su negocio (la app del celular). No puede escribir.
--   · anónimo         : nada.
-- La clave `service_role` (administrador total) NO se usa en la caja ni en la app.
-- =====================================================================================================================

create table if not exists public.negocios (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  zona_horaria text not null default 'America/Mexico_City',     -- define dónde cae la medianoche de "hoy"
  creado_en    timestamptz not null default now()
);

create table if not exists public.miembros (
  user_id    uuid not null references auth.users (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  rol        text not null check (rol in ('dueno', 'caja')),
  primary key (user_id, negocio_id)
);

-- Rol del usuario autenticado en un negocio (o NULL si no pertenece). SECURITY DEFINER: lee `miembros` sin depender de su propia RLS.
create or replace function public.rol_en(p_negocio uuid) returns text
language sql stable security definer set search_path = public as $$
  select rol from public.miembros where user_id = auth.uid() and negocio_id = p_negocio
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Datos que sube la caja. Llave = (negocio, instalación, id local): la "instalación" evita que una caja reinstalada con la
-- base vacía (ids que vuelven a empezar en 1) pise el historial de la anterior. Dinero en CENTAVOS (bigint).
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.ventas (
  negocio_id        uuid   not null references public.negocios (id) on delete cascade,
  instalacion_id    uuid   not null,
  id_local          bigint not null,
  fecha             timestamptz not null,
  usuario_nombre    text,
  subtotal          bigint not null,
  descuento_mayoreo bigint not null default 0,
  total             bigint not null,
  cambio            bigint not null default 0,
  estado            text   not null check (estado in ('completada', 'cancelada')),
  corte_id_local    bigint,
  actualizado_en    timestamptz not null default now(),
  primary key (negocio_id, instalacion_id, id_local)
);
create index if not exists ventas_fecha_idx on public.ventas (negocio_id, fecha);

create table if not exists public.venta_detalle (
  negocio_id        uuid   not null,
  instalacion_id    uuid   not null,
  venta_id_local    bigint not null,
  linea             int    not null,
  producto_id_local bigint not null,
  producto_nombre   text   not null,          -- copia del nombre: la nube no necesita el catálogo
  categoria         text,
  cantidad          int    not null,
  precio_unitario   bigint not null,
  importe           bigint not null,
  primary key (negocio_id, instalacion_id, venta_id_local, linea),
  foreign key (negocio_id, instalacion_id, venta_id_local) references public.ventas (negocio_id, instalacion_id, id_local) on delete cascade
);

create table if not exists public.pagos (
  negocio_id     uuid   not null,
  instalacion_id uuid   not null,
  venta_id_local bigint not null,
  n              int    not null,
  metodo         text   not null check (metodo in ('efectivo', 'tarjeta', 'transferencia')),
  monto          bigint not null,             -- en efectivo: lo APLICADO a la venta (sin el cambio devuelto)
  primary key (negocio_id, instalacion_id, venta_id_local, n),
  foreign key (negocio_id, instalacion_id, venta_id_local) references public.ventas (negocio_id, instalacion_id, id_local) on delete cascade
);

create table if not exists public.cortes (
  negocio_id           uuid   not null references public.negocios (id) on delete cascade,
  instalacion_id       uuid   not null,
  id_local             bigint not null,
  apertura             timestamptz not null,
  cierre               timestamptz,
  usuario_apertura     text,
  usuario_cierre       text,
  fondo_inicial        bigint not null default 0,
  efectivo_esperado    bigint,
  efectivo_contado     bigint,
  diferencia           bigint,
  num_ventas           bigint,
  total_ventas         bigint,
  descuentos           bigint,
  ventas_efectivo      bigint,
  ventas_tarjeta       bigint,
  ventas_transferencia bigint,
  ingresos             bigint,
  retiros              bigint,
  notas                text,
  actualizado_en       timestamptz not null default now(),
  primary key (negocio_id, instalacion_id, id_local)
);

-- Una fila por negocio: lo que la caja reporta en cada "latido" (aunque no haya ventas nuevas).
create table if not exists public.estado_negocio (
  negocio_id     uuid primary key references public.negocios (id) on delete cascade,
  instalacion_id uuid,
  latido         timestamptz not null default now(),   -- hora del SERVIDOR (no se confía en el reloj de la caja)
  caja           jsonb,
  ultimo_corte   jsonb,
  stock_bajo     jsonb,
  version        text,
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Seguridad por fila (RLS)
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.negocios       enable row level security;
alter table public.miembros       enable row level security;
alter table public.ventas         enable row level security;
alter table public.venta_detalle  enable row level security;
alter table public.pagos          enable row level security;
alter table public.cortes         enable row level security;
alter table public.estado_negocio enable row level security;

revoke all on public.negocios, public.miembros, public.ventas, public.venta_detalle, public.pagos, public.cortes, public.estado_negocio from anon, public;
grant select on public.negocios, public.miembros to authenticated;
grant select, insert, update on public.ventas, public.venta_detalle, public.pagos, public.cortes, public.estado_negocio to authenticated;
-- (ninguna tabla tiene DELETE para nadie: la nube es un historial)

drop policy if exists negocios_ver on public.negocios;
create policy negocios_ver on public.negocios for select to authenticated using (public.rol_en(id) is not null);
drop policy if exists miembros_ver on public.miembros;
create policy miembros_ver on public.miembros for select to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['ventas', 'venta_detalle', 'pagos', 'cortes', 'estado_negocio'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('drop policy if exists %1$s_insertar on public.%1$s', t);
    execute format('drop policy if exists %1$s_actualizar on public.%1$s', t);
    -- leer: el dueño y la caja de ESE negocio
    execute format($p$create policy %1$s_ver on public.%1$s for select to authenticated using (public.rol_en(negocio_id) in ('dueno', 'caja'))$p$, t);
    -- escribir: SOLO la caja de ese negocio (el dueño es de solo lectura)
    execute format($p$create policy %1$s_insertar on public.%1$s for insert to authenticated with check (public.rol_en(negocio_id) = 'caja')$p$, t);
    execute format($p$create policy %1$s_actualizar on public.%1$s for update to authenticated using (public.rol_en(negocio_id) = 'caja') with check (public.rol_en(negocio_id) = 'caja')$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- RPC de la caja: sube un lote COMPLETO en una sola transacción (ventas + líneas + pagos + cortes + latido).
-- Si algo falla, no queda nada a medias en la nube. SECURITY INVOKER: corre con los permisos (y la RLS) de quien llama.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.sincronizar(
  p_negocio uuid, p_instalacion uuid,
  p_ventas jsonb default '[]', p_detalle jsonb default '[]', p_pagos jsonb default '[]', p_cortes jsonb default '[]',
  p_estado jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n_ventas int; n_cortes int;
begin
  insert into ventas (negocio_id, instalacion_id, id_local, fecha, usuario_nombre, subtotal, descuento_mayoreo, total, cambio, estado, corte_id_local, actualizado_en)
  select p_negocio, p_instalacion, x.id_local, x.fecha, x.usuario_nombre, x.subtotal, coalesce(x.descuento_mayoreo, 0), x.total, coalesce(x.cambio, 0), x.estado, x.corte_id_local, now()
  from jsonb_to_recordset(p_ventas) as x(id_local bigint, fecha timestamptz, usuario_nombre text, subtotal bigint, descuento_mayoreo bigint, total bigint, cambio bigint, estado text, corte_id_local bigint)
  on conflict (negocio_id, instalacion_id, id_local) do update set
    fecha = excluded.fecha, usuario_nombre = excluded.usuario_nombre, subtotal = excluded.subtotal, descuento_mayoreo = excluded.descuento_mayoreo,
    total = excluded.total, cambio = excluded.cambio, estado = excluded.estado, corte_id_local = excluded.corte_id_local, actualizado_en = now();
  get diagnostics n_ventas = row_count;

  insert into venta_detalle (negocio_id, instalacion_id, venta_id_local, linea, producto_id_local, producto_nombre, categoria, cantidad, precio_unitario, importe)
  select p_negocio, p_instalacion, x.venta_id_local, x.linea, x.producto_id_local, x.producto_nombre, x.categoria, x.cantidad, x.precio_unitario, x.importe
  from jsonb_to_recordset(p_detalle) as x(venta_id_local bigint, linea int, producto_id_local bigint, producto_nombre text, categoria text, cantidad int, precio_unitario bigint, importe bigint)
  on conflict (negocio_id, instalacion_id, venta_id_local, linea) do update set
    producto_id_local = excluded.producto_id_local, producto_nombre = excluded.producto_nombre, categoria = excluded.categoria,
    cantidad = excluded.cantidad, precio_unitario = excluded.precio_unitario, importe = excluded.importe;

  insert into pagos (negocio_id, instalacion_id, venta_id_local, n, metodo, monto)
  select p_negocio, p_instalacion, x.venta_id_local, x.n, x.metodo, x.monto
  from jsonb_to_recordset(p_pagos) as x(venta_id_local bigint, n int, metodo text, monto bigint)
  on conflict (negocio_id, instalacion_id, venta_id_local, n) do update set metodo = excluded.metodo, monto = excluded.monto;

  insert into cortes (negocio_id, instalacion_id, id_local, apertura, cierre, usuario_apertura, usuario_cierre, fondo_inicial, efectivo_esperado, efectivo_contado, diferencia,
                      num_ventas, total_ventas, descuentos, ventas_efectivo, ventas_tarjeta, ventas_transferencia, ingresos, retiros, notas, actualizado_en)
  select p_negocio, p_instalacion, x.id_local, x.apertura, x.cierre, x.usuario_apertura, x.usuario_cierre, coalesce(x.fondo_inicial, 0), x.efectivo_esperado, x.efectivo_contado, x.diferencia,
         x.num_ventas, x.total_ventas, x.descuentos, x.ventas_efectivo, x.ventas_tarjeta, x.ventas_transferencia, x.ingresos, x.retiros, x.notas, now()
  from jsonb_to_recordset(p_cortes) as x(id_local bigint, apertura timestamptz, cierre timestamptz, usuario_apertura text, usuario_cierre text, fondo_inicial bigint, efectivo_esperado bigint,
         efectivo_contado bigint, diferencia bigint, num_ventas bigint, total_ventas bigint, descuentos bigint, ventas_efectivo bigint, ventas_tarjeta bigint, ventas_transferencia bigint,
         ingresos bigint, retiros bigint, notas text)
  on conflict (negocio_id, instalacion_id, id_local) do update set
    apertura = excluded.apertura, cierre = excluded.cierre, usuario_apertura = excluded.usuario_apertura, usuario_cierre = excluded.usuario_cierre, fondo_inicial = excluded.fondo_inicial,
    efectivo_esperado = excluded.efectivo_esperado, efectivo_contado = excluded.efectivo_contado, diferencia = excluded.diferencia, num_ventas = excluded.num_ventas,
    total_ventas = excluded.total_ventas, descuentos = excluded.descuentos, ventas_efectivo = excluded.ventas_efectivo, ventas_tarjeta = excluded.ventas_tarjeta,
    ventas_transferencia = excluded.ventas_transferencia, ingresos = excluded.ingresos, retiros = excluded.retiros, notas = excluded.notas, actualizado_en = now();
  get diagnostics n_cortes = row_count;

  -- Latido: se guarda con la hora del servidor, así el celular sabe si la caja sigue conectada aunque no haya ventas.
  if p_estado is not null then
    insert into estado_negocio (negocio_id, instalacion_id, latido, caja, ultimo_corte, stock_bajo, version, actualizado_en)
    values (p_negocio, p_instalacion, now(), p_estado -> 'caja', p_estado -> 'ultimo_corte', p_estado -> 'stock_bajo', p_estado ->> 'version', now())
    on conflict (negocio_id) do update set instalacion_id = excluded.instalacion_id, latido = now(), caja = excluded.caja, ultimo_corte = excluded.ultimo_corte,
      stock_bajo = excluded.stock_bajo, version = excluded.version, actualizado_en = now();
  end if;

  return jsonb_build_object('ventas', n_ventas, 'cortes', n_cortes);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Estadísticas del dueño. DEBE dar lo MISMO que estadisticasService.estadoDueno() de la caja (hay una prueba que lo comprueba).
-- Definiciones: día = día LOCAL del negocio · solo ventas completadas · ticket promedio = total/ventas redondeado ·
-- por método = suma de pagos · top = por piezas o importe de línea (antes del descuento global), empate por id.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public._resumen_dia(p_negocio uuid, p_tz text, p_dia date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_ini timestamptz := p_dia::timestamp at time zone p_tz;
  v_fin timestamptz := (p_dia + 1)::timestamp at time zone p_tz;
  n bigint; t bigint; st bigint; ds bigint; pz bigint; metodos jsonb; horas jsonb;
begin
  select count(*), coalesce(sum(total), 0), coalesce(sum(subtotal), 0), coalesce(sum(descuento_mayoreo), 0) into n, t, st, ds
  from ventas v where v.negocio_id = p_negocio and v.estado = 'completada' and v.fecha >= v_ini and v.fecha < v_fin;

  select coalesce(sum(d.cantidad), 0) into pz
  from venta_detalle d join ventas v on (v.negocio_id, v.instalacion_id, v.id_local) = (d.negocio_id, d.instalacion_id, d.venta_id_local)
  where v.negocio_id = p_negocio and v.estado = 'completada' and v.fecha >= v_ini and v.fecha < v_fin;

  select jsonb_build_object(
    'efectivo', coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0),
    'tarjeta', coalesce(sum(p.monto) filter (where p.metodo = 'tarjeta'), 0),
    'transferencia', coalesce(sum(p.monto) filter (where p.metodo = 'transferencia'), 0)) into metodos
  from pagos p join ventas v on (v.negocio_id, v.instalacion_id, v.id_local) = (p.negocio_id, p.instalacion_id, p.venta_id_local)
  where v.negocio_id = p_negocio and v.estado = 'completada' and v.fecha >= v_ini and v.fecha < v_fin;

  select jsonb_agg(jsonb_build_object('hora', g.h, 'num_ventas', coalesce(a.n, 0), 'total', coalesce(a.t, 0)) order by g.h) into horas
  from generate_series(0, 23) as g(h)
  left join (select extract(hour from v.fecha at time zone p_tz)::int as hh, count(*) as n, sum(v.total) as t
             from ventas v where v.negocio_id = p_negocio and v.estado = 'completada' and v.fecha >= v_ini and v.fecha < v_fin group by 1) a on a.hh = g.h;

  return jsonb_build_object('num_ventas', n, 'total', t, 'subtotal', st, 'descuentos', ds,
    'ticket_promedio', case when n > 0 then round(t::numeric / n) else 0 end, 'piezas', pz, 'por_metodo', metodos, 'por_hora', horas);
end $$;

create or replace function public._total_dia(p_negocio uuid, p_tz text, p_dia date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('dia', to_char(p_dia, 'YYYY-MM-DD'), 'num_ventas', count(*), 'total', coalesce(sum(v.total), 0))
  from ventas v where v.negocio_id = p_negocio and v.estado = 'completada'
    and v.fecha >= (p_dia::timestamp at time zone p_tz) and v.fecha < ((p_dia + 1)::timestamp at time zone p_tz)
$$;

create or replace function public.estado_dueno(p_negocio uuid, p_dia date default null) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz text; v_dia date; v_fin timestamptz; v_serie jsonb; v_pz jsonb; v_im jsonb;
begin
  if public.rol_en(p_negocio) is distinct from 'dueno' then
    raise exception 'No tienes permiso para ver este negocio' using errcode = '42501';
  end if;
  select zona_horaria into v_tz from negocios where id = p_negocio;
  v_dia := coalesce(p_dia, (now() at time zone v_tz)::date);
  v_fin := (v_dia + 1)::timestamp at time zone v_tz;

  select jsonb_agg(jsonb_build_object('dia', to_char(g.d, 'YYYY-MM-DD'), 'num_ventas', coalesce(a.n, 0), 'total', coalesce(a.t, 0)) order by g.d) into v_serie
  from (select (v_dia - 29 + i) as d from generate_series(0, 29) as i) g
  left join (select (v.fecha at time zone v_tz)::date as dd, count(*) as n, sum(v.total) as t from ventas v
             where v.negocio_id = p_negocio and v.estado = 'completada' and v.fecha >= ((v_dia - 29)::timestamp at time zone v_tz) and v.fecha < v_fin group by 1) a on a.dd = g.d;

  with base as (
    select d.instalacion_id, d.producto_id_local, (array_agg(d.producto_nombre order by v.fecha desc, v.id_local desc))[1] as nombre, sum(d.cantidad) as piezas, sum(d.importe) as importe
    from venta_detalle d join ventas v on (v.negocio_id, v.instalacion_id, v.id_local) = (d.negocio_id, d.instalacion_id, d.venta_id_local)
    where v.negocio_id = p_negocio and v.estado = 'completada' and v.fecha >= ((v_dia - 6)::timestamp at time zone v_tz) and v.fecha < v_fin
    group by d.instalacion_id, d.producto_id_local)
  select coalesce((select jsonb_agg(jsonb_build_object('producto_id', producto_id_local, 'nombre', nombre, 'piezas', piezas, 'importe', importe) order by piezas desc, importe desc, producto_id_local)
                   from (select * from base order by piezas desc, importe desc, producto_id_local limit 10) a), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('producto_id', producto_id_local, 'nombre', nombre, 'piezas', piezas, 'importe', importe) order by importe desc, piezas desc, producto_id_local)
                   from (select * from base order by importe desc, piezas desc, producto_id_local limit 10) b), '[]'::jsonb)
  into v_pz, v_im;

  return jsonb_build_object(
    'dia', to_char(v_dia, 'YYYY-MM-DD'), 'zona_horaria', v_tz,
    'resumen', public._resumen_dia(p_negocio, v_tz, v_dia),
    'comparativo', jsonb_build_object('ayer', public._total_dia(p_negocio, v_tz, v_dia - 1), 'semana_pasada', public._total_dia(p_negocio, v_tz, v_dia - 7)),
    'serie', v_serie,
    'top', jsonb_build_object('desde', to_char(v_dia - 6, 'YYYY-MM-DD'), 'hasta', to_char(v_dia, 'YYYY-MM-DD'), 'por_piezas', v_pz, 'por_importe', v_im));
end $$;

-- Versión del esquema: la caja la consulta al conectar (`npm run sync:probar`) para detectar un esquema desactualizado.
create or replace function public.version_esquema() returns int language sql immutable as $$ select 1 $$;

-- Las funciones solo las pueden llamar usuarios con sesión (nunca el rol anónimo).
revoke all on function public.sincronizar(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb), public.estado_dueno(uuid, date), public.rol_en(uuid),
  public._resumen_dia(uuid, text, date), public._total_dia(uuid, text, date), public.version_esquema() from public, anon;
grant execute on function public.sincronizar(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb), public.estado_dueno(uuid, date), public.rol_en(uuid),
  public._resumen_dia(uuid, text, date), public._total_dia(uuid, text, date), public.version_esquema() to authenticated;
