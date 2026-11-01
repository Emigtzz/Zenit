'use strict';
// Carga categorías y ~30 productos de ejemplo. Uso: npm run seed   (o: npm run seed -- --force para reemplazar)
const config = require('../src/config');
const { abrirBase } = require('../src/db/connection');
const { migrar } = require('../src/db/migrate');
const { pesosACentavos } = require('../src/utils/dinero');

// EAN-13 válido (dígito verificador) para que los códigos de ejemplo se vean reales.
function ean13(base12) {
  const suma = [...base12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return base12 + ((10 - (suma % 10)) % 10);
}

const categorias = [
  ['Abarrotes', '#f59e0b'], ['Bebidas', '#0ea5e9'], ['Botanas y dulces', '#ec4899'],
  ['Lácteos y fríos', '#14b8a6'], ['Limpieza', '#8b5cf6'], ['Panadería y fruta', '#84cc16'],
];

// [nombre, categoría, costo $, precio $, stock, stock mín., ¿trae código de barras?, código corto, ¿botón rápido?]
const productos = [
  ['Arroz 1 kg', 'Abarrotes', 18, 25, 24, 6, true, '101', false],
  ['Frijol negro 1 kg', 'Abarrotes', 24, 32, 20, 6, true, '102', false],
  ['Aceite vegetal 1 L', 'Abarrotes', 35, 46, 15, 4, true, '103', false],
  ['Azúcar 1 kg', 'Abarrotes', 22, 29, 18, 5, true, '104', false],
  ['Sal de mesa 1 kg', 'Abarrotes', 9, 14, 12, 3, true, '105', false],
  ['Huevo (pieza)', 'Abarrotes', 3, 4.5, 90, 30, false, '110', true],
  ['Tortillas (paquete)', 'Abarrotes', 14, 20, 15, 5, false, '111', true],
  ['Refresco cola 600 ml', 'Bebidas', 11, 18, 48, 12, true, '201', true],
  ['Refresco cola 2 L', 'Bebidas', 24, 35, 24, 6, true, '202', false],
  ['Agua natural 1 L', 'Bebidas', 6, 12, 36, 12, true, '203', false],
  ['Jugo de naranja 500 ml', 'Bebidas', 12, 19, 20, 6, true, '204', false],
  ['Cerveza lata 355 ml', 'Bebidas', 17, 28, 40, 12, true, '205', false],
  ['Hielo (bolsa)', 'Bebidas', 8, 20, 10, 3, false, '210', true],
  ['Papas fritas 45 g', 'Botanas y dulces', 9, 15, 30, 10, true, '301', false],
  ['Galletas Marías', 'Botanas y dulces', 10, 16, 25, 8, true, '302', false],
  ['Chocolate en barra', 'Botanas y dulces', 8, 14, 30, 10, true, '303', false],
  ['Cacahuates japoneses', 'Botanas y dulces', 7, 12, 22, 8, true, '304', false],
  ['Chicle (pieza)', 'Botanas y dulces', 0.8, 2, 100, 30, false, '310', true],
  ['Paleta de dulce', 'Botanas y dulces', 1.5, 3, 80, 20, false, '311', true],
  ['Leche entera 1 L', 'Lácteos y fríos', 19, 26, 24, 8, true, '401', false],
  ['Yogurt natural 1 kg', 'Lácteos y fríos', 28, 39, 10, 4, true, '402', false],
  ['Queso fresco (porción)', 'Lácteos y fríos', 25, 38, 8, 3, false, '410', true],
  ['Crema 200 ml', 'Lácteos y fríos', 14, 22, 12, 4, true, '403', false],
  ['Detergente en polvo 1 kg', 'Limpieza', 28, 42, 14, 4, true, '501', false],
  ['Jabón de barra', 'Limpieza', 8, 14, 20, 6, true, '502', false],
  ['Cloro 1 L', 'Limpieza', 10, 17, 16, 5, true, '503', false],
  ['Papel higiénico 4 rollos', 'Limpieza', 22, 34, 18, 6, true, '504', false],
  ['Bolillo (pieza)', 'Panadería y fruta', 2, 4, 60, 20, false, '601', true],
  ['Pan dulce (pieza)', 'Panadería y fruta', 4, 9, 40, 10, false, '602', true],
  ['Plátano (pieza)', 'Panadería y fruta', 2, 4, 30, 10, false, '603', true],
];

const db = abrirBase(config.dbPath);
migrar(db);
const hay = db.prepare('SELECT COUNT(*) n FROM productos').get().n;
if (hay > 0 && !process.argv.includes('--force')) {
  console.log(`La base ya tiene ${hay} productos. Usa "npm run seed -- --force" para borrar el catálogo y volver a cargar.`);
  process.exit(0);
}

db.transaction(() => {
  if (hay > 0) {
    for (const t of ['pagos', 'venta_detalle', 'ventas', 'movimientos_inventario', 'productos', 'categorias']) db.exec(`DELETE FROM ${t}`);
  }
  const catId = new Map();
  const insCat = db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)');
  for (const [n, c] of categorias) catId.set(n, insCat.run(n, c).lastInsertRowid);

  const insProd = db.prepare(`INSERT INTO productos (codigo_barras, codigo_corto, nombre, categoria_id, costo, precio, stock, stock_minimo, boton_rapido)
                              VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`);
  const insMov = db.prepare(`INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, referencia, fecha) VALUES (?, 'ajuste', ?, 'stock inicial (seed)', ?)`);
  const ahora = new Date().toISOString();
  productos.forEach(([nombre, cat, costo, precio, stock, minimo, conCodigo, corto, boton], i) => {
    const barras = conCodigo ? ean13(`750100${String(i + 1).padStart(6, '0')}`) : null;
    const id = insProd.run(barras, corto, nombre, catId.get(cat), pesosACentavos(costo), pesosACentavos(precio), minimo, boton ? 1 : 0).lastInsertRowid;
    // El stock inicial entra por el kárdex, como en el resto del sistema.
    insMov.run(id, stock, ahora);
    db.prepare('UPDATE productos SET stock = ? WHERE id = ?').run(stock, id);
  });
})();

const sinCodigo = productos.filter((p) => !p[6]).length;
console.log(`Listo: ${categorias.length} categorías y ${productos.length} productos (${sinCodigo} sin código de barras).`);
console.log('Códigos de barras de ejemplo para probar:');
db.prepare('SELECT nombre, codigo_barras, codigo_corto FROM productos WHERE codigo_barras IS NOT NULL LIMIT 3').all()
  .forEach((p) => console.log(`  ${p.codigo_barras}  (corto ${p.codigo_corto})  ${p.nombre}`));
