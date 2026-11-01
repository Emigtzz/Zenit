# Conectar la caja con el celular del dueño (Supabase)

Esta guía es para hacerla **una sola vez**, en unos 30 minutos. Al terminar: cada venta de la caja se sube sola a internet y el dueño la ve en su celular. **La caja sigue cobrando igual aunque no haya internet**; lo pendiente se sube cuando vuelva.

> Los nombres exactos de los botones de Supabase pueden cambiar con el tiempo. Guíate por lo que ves en pantalla; lo importante son los pasos y los datos.

## Qué vas a necesitar

- Una cuenta de **Supabase** (gratis para empezar; revisa en su página de precios los límites del plan gratuito).
- Dos correos: el del **dueño** (el real, con el que entrará a su celular) y uno para la **caja** (puede ser inventado, como `caja@tutienda.com`; no tiene que existir).
- Una contraseña fuerte para cada uno. Anótalas en un lugar seguro.
- Un lugar donde publicar la carpeta `pwa` (paso 7). Hay opciones gratis.

## 1 · Crear el proyecto

1. Entra a <https://supabase.com> y crea tu cuenta.
2. **New project**. Ponle un nombre (ej. `luna-de-precios`), elige una **contraseña de la base de datos** (guárdala, no la vamos a usar aquí) y la región más cercana a México.
3. Espera a que termine de crearse (un par de minutos).

## 2 · Instalar las tablas y los permisos

1. En el menú izquierdo abre **SQL Editor** → **New query**.
2. Abre el archivo `supabase/schema.sql` de este proyecto, copia **todo** su contenido, pégalo y presiona **Run**.
3. Debe decir `Success`. Si lo vuelves a ejecutar no pasa nada malo.

Esto crea las tablas y deja la seguridad así: la **caja** solo puede subir y leer los datos de *su* negocio y nunca borrar; el **dueño** solo puede leer; **nadie sin sesión** puede ver nada.

## 3 · Crear los dos usuarios

1. Menú **Authentication** → **Users** → **Add user** → *Create new user*.
2. Crea el del **dueño** (su correo y contraseña). Marca *Auto Confirm User* si te lo ofrece.
3. Crea el de la **caja** (su correo y contraseña). Igual, *Auto Confirm User*.

## 4 · Dar de alta el negocio

1. **SQL Editor** → **New query**.
2. Abre `supabase/configurar-negocio.sql`, cópialo y pégalo.
3. Cambia **solo** las 4 líneas marcadas con ✏️: el correo del dueño, el correo de la caja, el nombre del negocio y la zona horaria.
   - Zona horaria: casi todo México es `America/Mexico_City`; Quintana Roo `America/Cancun`; Sonora `America/Hermosillo`; Baja California `America/Tijuana`; Chihuahua `America/Chihuahua`; Sinaloa y Nayarit `America/Mazatlan`.
   - **Debe ser la misma** que `NEGOCIO_ZONA_HORARIA` en el archivo `.env` de la caja (define dónde empieza "hoy").
4. **Run**. Debe mostrar un aviso: `Listo. Negocio "…" creado`. Si dice que no encuentra a un usuario, revisa que el correo esté escrito igual que en el paso 3.

## 5 · Conectar la caja

1. En Supabase: **Project Settings** → **API**. Copia dos datos:
   - **Project URL** (algo como `https://abcd1234.supabase.co`)
   - La clave **anon** o **publishable** (la pública).
2. Abre el archivo `.env` de la caja (en la carpeta del proyecto) y llena:

```
SUPABASE_URL=https://abcd1234.supabase.co
SUPABASE_ANON_KEY=la_clave_anon_o_publishable
SYNC_EMAIL=el_correo_de_la_caja
SYNC_PASSWORD=la_contraseña_de_la_caja
```

> ⛔ **Nunca** pongas aquí la clave `service_role` (administrador total) ni la contraseña de la base de datos. La caja no las necesita y, si la computadora se perdiera o la revisara alguien, serían un riesgo enorme.

3. Reinicia la caja y verifica la conexión:

```bash
npm run sync:probar
```

Debe mostrar todo con ✔: usuario de la caja, negocio, esquema instalado, zona horaria igual y *"Sin iniciar sesión no se puede leer nada"*. Si algo sale con ✖ o ⚠, el mensaje dice qué corregir (ver *Problemas frecuentes*).

4. (Opcional) `npm run sync:probar -- --subir` sube de inmediato lo que haya pendiente, para comprobarlo.

Desde ese momento la caja sube sola cada minuto. En la pantalla de venta verás arriba un indicador: **☁ Sincronizado hace X min**, **☁ 3 por subir** o **☁ Sin conexión · 5 por subir**. Con el último, no pasa nada: las ventas están guardadas en la caja.

## 6 · Preparar la app del celular

En la caja, en la carpeta del proyecto:

```bash
npm run pwa:configurar
```

Copia la URL y la clave pública del `.env` al archivo `pwa/config.js` (y se niega a hacerlo si le diste por error la clave de administrador).

## 7 · Publicar la app

La app es una carpeta de archivos estáticos (`pwa`). Necesita una dirección con **https** para poder instalarse en el celular. Elige una opción gratuita:

- **Netlify** (la más fácil): entra a su página *Netlify Drop*, arrastra la carpeta `pwa` completa y te da una dirección `https://algo.netlify.app`.
- **Cloudflare Pages** o **GitHub Pages**: sirven igual. (En GitHub Pages, los repositorios privados pueden requerir un plan de pago.)

Cada vez que cambies `pwa/config.js` (o actualices la app), vuelve a publicar la carpeta.

> La app **no contiene datos del negocio ni contraseñas**: solo código. Los datos están en Supabase y solo se ven al iniciar sesión como dueño. Aun así, no compartas la dirección con quien no deba verla.

## 8 · Instalarla en el celular del dueño

1. Abre la dirección en el navegador del celular.
2. Inicia sesión con el correo y la contraseña **del dueño**.
3. Instálala:
   - **Android (Chrome):** menú ⋮ → *Instalar app* (o *Agregar a la pantalla principal*).
   - **iPhone (Safari):** botón Compartir → *Agregar a inicio*.

Qué verá el dueño: ventas de hoy (con comparación contra ayer y la semana pasada), por hora y por método de pago, los 30 últimos días, los productos más vendidos, el estado de la caja y el último corte (con su diferencia), y el stock bajo. Arriba hay un aviso que dice si **la caja está conectada** o desde cuándo no lo está. Sin internet en el celular, la app abre con lo último que vio y lo avisa.

---

## Problemas frecuentes

| Mensaje | Qué pasa y qué hacer |
|---|---|
| *Supabase rechazó el usuario de la caja* | `SYNC_EMAIL` o `SYNC_PASSWORD` mal escritos, o el usuario no está confirmado. Revísalos en Authentication → Users. |
| *El usuario de la caja no pertenece a ningún negocio* | Falta el paso 4 (o se ejecutó con otro correo). |
| *Falta ejecutar (o actualizar) supabase/schema.sql* | Repite el paso 2. |
| *Zona horaria DISTINTA* | La caja y la nube definen "hoy" distinto. Pon la misma en `NEGOCIO_ZONA_HORARIA` y en la tabla `negocios`. |
| *El usuario es "dueño", no "caja"* | Pusiste en `SYNC_EMAIL` el correo del dueño. La caja debe usar el suyo. |
| En el celular: *Esta cuenta no es de dueño* | Entraste con el usuario de la caja. Usa el del dueño. |
| En el celular: *La caja no se conecta desde las…* | La caja está apagada, sin internet o con un problema de sincronización. Revisa el indicador ☁ en la pantalla de venta. Mientras tanto no se pierde nada: se sube al volver. |
| El proyecto gratuito "se pausó" | Los proyectos sin actividad pueden pausarse según el plan. La caja lo mantiene activo al sincronizarse a diario; si se pausó, reactívalo desde el panel de Supabase. |

## Seguridad: lo que conviene saber

- **Si roban o pierden la computadora de la caja:** entra a Supabase → Authentication → Users y cambia la contraseña del usuario de la caja (o elimínalo y crea otro). Ese usuario solo podía subir y leer *su* negocio; no podía borrar nada ni ver a otros negocios.
- **Si pierdes el celular del dueño:** cambia la contraseña del dueño en Supabase y, en la app, usa *Salir* cuando lo recuperes.
- **Contraseñas:** la del dueño debe ser larga y única. No la reutilices en otros sitios.
- **Qué se sube a internet:** ventas con sus productos y pagos, cortes de caja, el estado de la caja y el stock bajo. **No** se suben contraseñas, costos, proveedores, facturas, ni datos de clientes (no se guardan).
- **Si cambias de computadora o reinstalas la caja** con la base vacía, la caja se identifica con un código nuevo: sus ventas nuevas **se suman** al historial de la nube, no lo pisan.
