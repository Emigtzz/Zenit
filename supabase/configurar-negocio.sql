-- =====================================================================================================================
-- Zenit POS · alta del negocio. Se ejecuta UNA vez, DESPUÉS de schema.sql y de crear los dos usuarios en
-- Supabase → Authentication → Users (el del dueño y el de la caja).
--
-- Cambia SOLO las 4 líneas marcadas con ✏️ (deja las comillas simples).
-- =====================================================================================================================
do $$
declare
  v_correo_dueno text := 'CORREO_DEL_DUENO';      -- ✏️ el correo con el que entra el dueño al celular
  v_correo_caja  text := 'CORREO_DE_LA_CAJA';     -- ✏️ el correo del usuario de la caja (el que va en SYNC_EMAIL)
  v_nombre       text := 'Luna de precios';       -- ✏️ nombre del negocio
  v_zona         text := 'America/Mexico_City';   -- ✏️ zona horaria (la MISMA que NEGOCIO_ZONA_HORARIA en el .env de la caja)
  v_dueno uuid; v_caja uuid; v_negocio uuid;
begin
  select id into v_dueno from auth.users where lower(email) = lower(v_correo_dueno);
  select id into v_caja  from auth.users where lower(email) = lower(v_correo_caja);
  if v_dueno is null then raise exception 'No encuentro al usuario "%". Revisa que esté creado en Authentication → Users y escrito igual.', v_correo_dueno; end if;
  if v_caja  is null then raise exception 'No encuentro al usuario "%". Revisa que esté creado en Authentication → Users y escrito igual.', v_correo_caja; end if;
  if v_dueno = v_caja then raise exception 'El dueño y la caja deben ser DOS usuarios distintos.'; end if;
  if exists (select 1 from public.miembros where user_id in (v_dueno, v_caja)) then
    raise exception 'Alguno de estos usuarios ya pertenece a un negocio. No se hizo ningún cambio (así no se duplica nada).';
  end if;
  perform now() at time zone v_zona;   -- si la zona está mal escrita, falla aquí con un error claro

  insert into public.negocios (nombre, zona_horaria) values (v_nombre, v_zona) returning id into v_negocio;
  insert into public.miembros (user_id, negocio_id, rol) values (v_dueno, v_negocio, 'dueno'), (v_caja, v_negocio, 'caja');
  raise notice 'Listo. Negocio "%" creado (id %). Dueño: % · Caja: %', v_nombre, v_negocio, v_correo_dueno, v_correo_caja;
end $$;
