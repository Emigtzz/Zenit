'use strict';
const { ErrorApp } = require('../utils/errores');
const proveedorRepository = require('../repositories/proveedorRepository');

module.exports = function proveedorService(db) {
  const proveedores = proveedorRepository(db);
  function nombreLibre(nombre, idActual = -1) {
    const otro = proveedores.obtenerPorNombre(nombre);
    if (otro && otro.id !== idActual) throw new ErrorApp(`Ya existe el proveedor "${otro.nombre}"`, { status: 409, codigo: 'NOMBRE_DUPLICADO' });
  }
  return {
    listar: (op) => proveedores.listar(op),
    crear(datos) { nombreLibre(datos.nombre); return proveedores.crear(datos); },
    actualizar(id, datos) {
      if (!proveedores.obtener(id)) throw new ErrorApp('Proveedor no encontrado', { status: 404, codigo: 'NO_ENCONTRADO' });
      nombreLibre(datos.nombre, id);
      return proveedores.actualizar(id, { ...datos, activo: datos.activo ? 1 : 0 });
    },
  };
};
