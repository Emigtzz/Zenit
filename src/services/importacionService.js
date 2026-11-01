'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ErrorApp } = require('../utils/errores');
const { normalizar } = require('../utils/texto');
const { parsearCfdi } = require('./cfdiParser');
const importacionRepository = require('../repositories/importacionRepository');
const equivalenciaRepository = require('../repositories/equivalenciaRepository');
const proveedorRepository = require('../repositories/proveedorRepository');
const productoRepository = require('../repositories/productoRepository');
const compraRepository = require('../repositories/compraRepository');

// Palabras que describen el EMPAQUE, no el producto: estorban al buscar coincidencias ("caja", "c/24", "pza"...).
const RUIDO = new Set(['caja', 'cja', 'pza', 'pzas', 'pieza', 'piezas', 'paq', 'paquete', 'bolsa', 'bto', 'pack', 'kg', 'gr', 'ml', 'lt', 'c', 'de', 'con', 'sin', 'el', 'la']);
const TAMANO_MAXIMO = 8 * 1024 * 1024;

function tipoDeArchivo(buffer) {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const inicio = buffer.subarray(0, 200).toString('utf8').replace(/^﻿/, '').trimStart();
  if (inicio.startsWith('<')) return 'xml';
  return null; // se decide por el CONTENIDO, no por la extensión ni por lo que diga el navegador
}

// Pasa un nombre de archivo cualquiera (puede venir con rutas o caracteres raros) a algo seguro para el disco.
function nombreSeguro(nombre, ext) {
  const base = path.basename(String(nombre || 'factura')).replace(/\.[^.]*$/, '').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'factura';
  return `${base}.${ext}`;
}

module.exports = function importacionService(db, { config, ia, busqueda, compras, proveedores }) {
  const importaciones = importacionRepository(db);
  const equivalencias = equivalenciaRepository(db);
  const provRepo = proveedorRepository(db);
  const productos = productoRepository(db);
  const comprasRepo = compraRepository(db);
  const carpeta = config.carpetaFacturas;

  const noEncontrada = () => new ErrorApp('Importación no encontrada', { status: 404, codigo: 'NO_ENCONTRADO' });
  const ahora = () => new Date().toISOString();

  // ---- Sugerencias para la pantalla de revisión (se recalculan al abrir: el catálogo puede haber cambiado) ----
  function sugerirProveedor(factura) {
    if (factura.emisor.rfc) {
      const p = provRepo.obtenerPorRfc(factura.emisor.rfc);
      if (p) return { id: p.id, nombre: p.nombre, coincidencia: 'rfc' };
    }
    if (factura.emisor.nombre) {
      const p = provRepo.obtenerPorNombre(factura.emisor.nombre);
      if (p && p.activo) return { id: p.id, nombre: p.nombre, coincidencia: 'nombre' };
    }
    return null;
  }

  // "REFRESCO COLA 600ML" -> ["refresco","cola","600","ml"]: separa números de letras para que "600ML" (factura) y "600 ml" (catálogo) coincidan.
  const tokens = (t) => normalizar(t).replace(/(\d)([a-zñ])/g, '$1 $2').replace(/([a-zñ])(\d)/g, '$1 $2').split(' ').filter(Boolean);

  // Busca productos parecidos a la descripción del proveedor. Las descripciones de factura son largas, así que se busca con los
  // primeros N términos (de más a menos) hasta encontrar algo, y luego se ORDENA por cuántos términos comparte cada producto con
  // la descripción, tamaños incluidos: así "600ML" gana sobre "2 L" aunque el orden alfabético diga lo contrario.
  function candidatos(descripcion) {
    const todos = tokens(descripcion);
    const palabras = todos.filter((w) => w.length >= 2 && !RUIDO.has(w) && !/^\d+$/.test(w));
    for (let n = Math.min(palabras.length, 4); n >= 1; n--) {
      const pool = busqueda.buscar(palabras.slice(0, n).join(' '), 10);
      if (!pool.length) continue;
      const deLaFactura = new Set(todos);
      const puntaje = (p) => tokens(p.nombre).filter((t) => deLaFactura.has(t)).length;
      return pool.map((p) => ({ p, pts: puntaje(p) })).sort((x, y) => y.pts - x.pts || x.p.nombre.localeCompare(y.p.nombre, 'es'))
        .slice(0, 3).map(({ p }) => ({ producto_id: p.id, nombre: p.nombre }));
    }
    return [];
  }

  function enriquecer(factura) {
    const proveedor = sugerirProveedor(factura);
    const advertencias = [...factura.advertencias];
    if (factura.uuid) {
      const previa = comprasRepo.uuidRegistrado(factura.uuid);
      if (previa) advertencias.unshift(`⛔ Esta factura ya está registrada en la compra #${previa.id}. No se puede confirmar de nuevo.`);
    }
    if (proveedor && factura.folio_factura && comprasRepo.folioRegistrado(proveedor.id, factura.folio_factura)) {
      advertencias.unshift(`⛔ La factura ${factura.folio_factura} de ${proveedor.nombre} ya está registrada. No se puede confirmar de nuevo.`);
    }
    const lineas = factura.lineas.map((l) => {
      let sugerido = null;
      if (proveedor) {
        const eq = equivalencias.obtener(proveedor.id, l.clave_proveedor);
        if (eq && eq.producto_activo) sugerido = { producto_id: eq.producto_id, nombre: eq.producto_nombre, factor: eq.factor, origen: 'equivalencia' };
      }
      return { ...l, sugerido, candidatos: sugerido ? [] : candidatos(l.descripcion) };
    });
    return { proveedor_sugerido: proveedor, lineas, advertencias };
  }

  function vista(fila) {
    const factura = JSON.parse(fila.datos);
    const extra = fila.estado === 'pendiente' ? enriquecer(factura) : { proveedor_sugerido: null, lineas: factura.lineas, advertencias: factura.advertencias };
    return {
      id: fila.id, fuente: fila.fuente, archivo_nombre: fila.archivo_nombre, estado: fila.estado, creado_en: fila.creado_en,
      usuario_nombre: fila.usuario_nombre, compra_id: fila.compra_id, resuelta_en: fila.resuelta_en,
      costo_incluye_impuestos: config.costoIncluyeImpuestos,
      factura: { ...factura, lineas: extra.lineas, advertencias: extra.advertencias }, proveedor_sugerido: extra.proveedor_sugerido,
    };
  }

  return {
    TAMANO_MAXIMO,
    iaDisponible: () => ia.disponible(),

    // Sube un archivo: lo lee, detecta duplicados y lo deja como BORRADOR. No toca inventario, costos ni caja.
    async crear({ buffer, nombre }, { usuarioId = null } = {}) {
      if (!buffer || !buffer.length) throw new ErrorApp('El archivo está vacío', { status: 400, codigo: 'ARCHIVO_VACIO' });
      if (buffer.length > TAMANO_MAXIMO) throw new ErrorApp('El archivo es demasiado grande (máximo 8 MB)', { status: 413, codigo: 'ARCHIVO_GRANDE' });
      const fuente = tipoDeArchivo(buffer);
      if (!fuente) throw new ErrorApp('Solo se aceptan facturas en XML (CFDI) o PDF', { status: 415, codigo: 'ARCHIVO_NO_SOPORTADO' });

      const sha = crypto.createHash('sha256').update(buffer).digest('hex');
      const repetido = importaciones.porHash(sha);
      if (repetido) {
        throw new ErrorApp(repetido.estado === 'confirmada'
          ? `Este archivo ya se importó y se registró como la compra #${repetido.compra_id}.`
          : `Este archivo ya está subido y pendiente de revisar (importación #${repetido.id}).`,
        { status: 409, codigo: 'ARCHIVO_REPETIDO', detalles: { importacion_id: repetido.id, compra_id: repetido.compra_id } });
      }

      const factura = fuente === 'xml' ? parsearCfdi(buffer.toString('utf8')) : await ia.extraer(buffer);

      if (factura.uuid) {
        const previa = comprasRepo.uuidRegistrado(factura.uuid);
        if (previa) {
          throw new ErrorApp(`Esta factura ya está registrada en la compra #${previa.id}.`, { status: 409, codigo: 'FACTURA_YA_REGISTRADA', detalles: { compra_id: previa.id } });
        }
      }

      const guardar = db.transaction(() => {
        const id = importaciones.insertar({ fuente, archivo_nombre: nombreSeguro(nombre, fuente), sha256: sha, uuid_cfdi: factura.uuid,
          datos: JSON.stringify(factura), usuario_id: usuarioId, creado_en: ahora() });
        const rutaRelativa = `imp-${String(id).padStart(6, '0')}-${nombreSeguro(nombre, fuente)}`;
        fs.mkdirSync(carpeta, { recursive: true });
        fs.writeFileSync(path.join(carpeta, rutaRelativa), buffer); // si falla al escribir, se deshace el borrador
        importaciones.fijarRuta(id, rutaRelativa);
        return id;
      });
      const id = guardar();
      const resultado = vista(importaciones.obtener(id));
      const gemelos = factura.uuid ? importaciones.pendientesConUuid(factura.uuid, id) : [];
      if (gemelos.length) resultado.factura.advertencias.unshift(`Ya hay otra importación pendiente de esta misma factura (#${gemelos.map((g) => g.id).join(', #')}): confirma solo una.`);
      return resultado;
    },

    listar: (estado) => importaciones.listar(estado).map((f) => {
      const d = JSON.parse(f.datos);
      return { id: f.id, fuente: f.fuente, archivo_nombre: f.archivo_nombre, estado: f.estado, creado_en: f.creado_en, usuario_nombre: f.usuario_nombre,
        compra_id: f.compra_id, proveedor: d.emisor.nombre, folio_factura: d.folio_factura, total: d.total, num_lineas: d.lineas.length };
    }),

    obtener(id) {
      const f = importaciones.obtener(id);
      if (!f) throw noEncontrada();
      return vista(f);
    },

    // Ruta del archivo original, para mostrarlo junto a la revisión.
    archivo(id) {
      const f = importaciones.obtener(id);
      if (!f || !f.archivo_ruta) throw noEncontrada();
      const ruta = path.resolve(carpeta, f.archivo_ruta);
      if (!ruta.startsWith(path.resolve(carpeta) + path.sep) || !fs.existsSync(ruta)) throw noEncontrada(); // nunca salir de la carpeta
      return { ruta, fuente: f.fuente, nombre: f.archivo_nombre };
    },

    descartar(id) {
      const f = importaciones.obtener(id);
      if (!f) throw noEncontrada();
      if (f.estado !== 'pendiente') throw new ErrorApp('Solo se pueden descartar importaciones pendientes', { status: 409, codigo: 'YA_RESUELTA' });
      importaciones.marcarDescartada(id, ahora());
      if (f.archivo_ruta) fs.rmSync(path.join(carpeta, f.archivo_ruta), { force: true });
    },

    // CONFIRMAR = la revisión humana. Entra lo que la persona dejó en pantalla (piezas y costo por pieza); del archivo solo se
    // toman datos que el usuario no puede alterar (UUID y archivo original). Todo en una transacción con la compra.
    async confirmar(id, entrada, { usuarioId = null } = {}) {
      const fila = importaciones.obtener(id);
      if (!fila) throw noEncontrada();
      if (fila.estado !== 'pendiente') throw new ErrorApp('Esta importación ya fue resuelta', { status: 409, codigo: 'YA_RESUELTA' });
      const factura = JSON.parse(fila.datos);

      // Une los renglones que terminaron en el mismo producto: suma piezas y promedia el costo ponderado.
      const porProducto = new Map();
      for (const it of entrada.items) {
        const acc = porProducto.get(it.producto_id) || { producto_id: it.producto_id, cantidad: 0, total: 0 };
        acc.cantidad += it.cantidad; acc.total += it.cantidad * it.costo_unitario;
        porProducto.set(it.producto_id, acc);
      }
      const items = [...porProducto.values()].map((a) => ({ producto_id: a.producto_id, cantidad: a.cantidad, costo_unitario: Math.max(1, Math.round(a.total / a.cantidad)) }));

      const hacer = db.transaction(() => {
        let proveedorId = entrada.proveedor_id;
        if (!proveedorId) {
          if (!entrada.nuevo_proveedor) throw new ErrorApp('Elige o crea el proveedor', { status: 422, codigo: 'PROVEEDOR_REQUERIDO' });
          proveedorId = proveedores.crear(entrada.nuevo_proveedor).id;
        }
        const resultado = compras.registrar({
          proveedor_id: proveedorId, folio_factura: entrada.folio_factura, fecha: entrada.fecha, notas: entrada.notas,
          pagar_de_caja: entrada.pagar_de_caja, items, uuid_cfdi: fila.uuid_cfdi, archivo: fila.archivo_ruta ? `facturas/${fila.archivo_ruta}` : null,
        }, { usuarioId });

        // Aprende: la próxima factura de este proveedor llegará con el producto y el factor ya sugeridos (siempre revisables).
        let aprendidas = 0;
        for (const it of entrada.items) {
          if (it.linea === undefined || it.linea === null) continue;
          const linea = factura.lineas[it.linea];
          if (!linea) throw new ErrorApp(`El renglón ${it.linea} no existe en la factura`, { status: 422, codigo: 'LINEA_INVALIDA' });
          equivalencias.guardar({ proveedor_id: proveedorId, clave_proveedor: linea.clave_proveedor, producto_id: it.producto_id,
            factor: it.factor || 1, descripcion: linea.descripcion.slice(0, 120), iso: ahora() });
          aprendidas++;
        }
        importaciones.marcarConfirmada(id, resultado.compra.id, ahora());
        return { ...resultado, equivalencias_guardadas: aprendidas };
      });
      const r = hacer();
      const totalFactura = factura.total;
      return { ...r, comparacion: { total_factura: totalFactura, total_capturado: r.compra.total,
        diferencia: totalFactura === null ? null : r.compra.total - totalFactura } };
    },

    // ---- Equivalencias (proveedor → producto) ----
    listarEquivalencias: (proveedorId) => equivalencias.listar(proveedorId),
    borrarEquivalencia(proveedorId, clave) {
      if (!equivalencias.borrar(proveedorId, clave)) throw new ErrorApp('Equivalencia no encontrada', { status: 404, codigo: 'NO_ENCONTRADO' });
    },
  };
};
