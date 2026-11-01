'use strict';
const { z } = require('zod');
const { ErrorApp } = require('../utils/errores');

// Middleware genérico: valida body/query con un esquema zod. Si falla -> 400 con el detalle por campo.
function validar(esquema, donde = 'body') {
  return (req, _res, next) => {
    const r = esquema.safeParse(req[donde]);
    if (!r.success) {
      const campos = r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));
      return next(new ErrorApp('Datos inválidos', { status: 400, codigo: 'VALIDACION', detalles: campos }));
    }
    // En Express 5 req.query es solo-lectura: se redefine la propiedad con los datos ya validados y con valores por defecto.
    Object.defineProperty(req, donde, { value: r.data, writable: true, configurable: true, enumerable: true });
    next();
  };
}

// ---- Esquemas ----
const centavos = z.number({ error: 'Debe ser un número' }).int('Debe ser entero en centavos').min(0, 'No puede ser negativo').max(100_000_000);
const textoOpcional = (max) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() || null : v), z.string().max(max).nullable().optional().default(null));
const bool01 = z.preprocess((v) => (v === true ? 1 : v === false ? 0 : v), z.union([z.literal(0), z.literal(1)]));

const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, 'Requerido').max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal, ej. #ff8800').default('#64748b'),
  activo: bool01.default(1),
});

const productoSchema = z.object({
  codigo_barras: textoOpcional(50),
  codigo_corto: textoOpcional(20),
  nombre: z.string().trim().min(1, 'Requerido').max(120),
  categoria_id: z.number().int().positive().nullable().optional().default(null),
  costo: centavos.default(0),
  precio: centavos,
  stock: z.number().int().min(-100000).max(1000000).default(0), // solo se usa al crear (stock inicial)
  stock_minimo: z.number().int().min(0).default(0),
  boton_rapido: bool01.default(0),
  activo: bool01.default(1),
});

const ventaSchema = z.object({
  items: z.array(z.object({
    producto_id: z.number().int().positive(),
    cantidad: z.number().int('Solo piezas enteras').positive('Debe ser mayor a 0').max(9999),
  })).min(1, 'La venta no tiene productos').max(200),
  pagos: z.array(z.object({
    metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']),
    monto: z.number().int().positive('El monto debe ser mayor a 0').max(100_000_000),
  })).min(1, 'Falta el pago').max(6),
  mayoreo: z.boolean().default(false),
});

const { ID_MOTIVOS } = require('../services/inventarioService');
const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato AAAA-MM-DD');
const ajusteSchema = z.object({
  producto_id: z.number().int().positive(),
  modo: z.enum(['entrada', 'salida', 'conteo']),
  cantidad: z.number({ error: 'Debe ser un número' }).int('Solo piezas enteras').min(0).max(1_000_000),
  motivo: z.enum(ID_MOTIVOS, { error: 'Motivo no válido' }),
  nota: z.preprocess((v) => (typeof v === 'string' ? v.trim() || null : v), z.string().max(300).nullable().optional().default(null)),
}).refine((a) => a.modo === 'conteo' || a.cantidad > 0, { message: 'La cantidad debe ser mayor a 0', path: ['cantidad'] });
const kardexSchema = z.object({
  producto_id: z.coerce.number().int().positive().optional(),
  tipo: z.enum(['venta', 'compra', 'ajuste', 'cancelacion']).optional(),
  desde: fechaDia.optional(),
  hasta: fechaDia.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(200).default(50),
});

const nombreUsuario = z.string().trim().min(2, 'Mínimo 2 letras').max(40);
const contrasenaCampo = z.string({ error: 'Requerida' }).min(1, 'Requerida').max(100);
const loginSchema = z.object({ usuario_id: z.number().int().positive(), contrasena: contrasenaCampo });
const setupSchema = z.object({ nombre: nombreUsuario, contrasena: contrasenaCampo });
const usuarioNuevoSchema = z.object({ nombre: nombreUsuario, rol: z.enum(['cajero', 'dueño']), contrasena: contrasenaCampo });
const usuarioEditarSchema = z.object({ nombre: nombreUsuario, rol: z.enum(['cajero', 'dueño']), activo: z.boolean() });
const restablecerSchema = z.object({ contrasena: contrasenaCampo });
const cambioContrasenaSchema = z.object({ actual: contrasenaCampo, nueva: contrasenaCampo });

const montoCero = z.number({ error: 'Debe ser un número' }).int('Debe ser entero en centavos').min(0, 'No puede ser negativo').max(100_000_000);
const abrirCajaSchema = z.object({ fondo_inicial: montoCero });
const movimientoCajaSchema = z.object({
  tipo: z.enum(['ingreso', 'retiro']),
  monto: z.number({ error: 'Debe ser un número' }).int().positive('Debe ser mayor a 0').max(100_000_000),
  motivo: z.string().trim().min(3, 'Explica el motivo').max(120),
});
const cerrarCajaSchema = z.object({
  efectivo_contado: montoCero,
  notas: z.preprocess((v) => (typeof v === 'string' ? v.trim() || null : v), z.string().max(300).nullable().optional().default(null)),
});
const listaCortesSchema = z.object({ pagina: z.coerce.number().int().min(1).default(1), por_pagina: z.coerce.number().int().min(1).max(100).default(30) });

const buscarSchema = z.object({ q: z.string().max(100).default('') });
const listaProductosSchema = z.object({
  incluir_inactivos: z.enum(['0', '1']).default('0'),
  categoria: z.coerce.number().int().positive().optional(),
});

module.exports = { validar, categoriaSchema, productoSchema, ventaSchema, buscarSchema, listaProductosSchema, ajusteSchema, kardexSchema,
  abrirCajaSchema, movimientoCajaSchema, cerrarCajaSchema, listaCortesSchema,
  loginSchema, setupSchema, usuarioNuevoSchema, usuarioEditarSchema, restablecerSchema, cambioContrasenaSchema };
