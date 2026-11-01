'use strict';
module.exports = function authController({ auth, usuarios, config, mw, vidaSesionMs }) {
  const iniciar = (res, { token, usuario }) => { mw.ponerCookie(res, token, vidaSesionMs); res.json({ usuario }); };
  return {
    // Público: lo necesita la pantalla de login para saber si hay que configurar y a quién mostrar.
    estado: (req, res) => res.json({
      negocio: config.negocio.nombre,
      necesita_setup: auth.necesitaSetup(),
      usuarios: auth.necesitaSetup() ? [] : auth.usuariosParaLogin(),
      usuario: req.usuario,
    }),
    async setup(req, res) { iniciar(res, await auth.setupInicial(req.body)); },
    async login(req, res) { iniciar(res, await auth.login(req.body)); },
    logout(req, res) { auth.logout(req.token); mw.borrarCookie(res); res.status(204).end(); },
    yo: (req, res) => res.json({ usuario: req.usuario }),
    async cambiarContrasena(req, res) { await auth.cambiarContrasenaPropia(req.usuario.id, req.body, req.token); res.status(204).end(); },

    // ---- gestión (dueño) ----
    listarUsuarios: (_req, res) => res.json(usuarios.listar()),
    async crearUsuario(req, res) { res.status(201).json(await usuarios.crear(req.body)); },
    actualizarUsuario: (req, res) => res.json(usuarios.actualizar(Number(req.params.id), req.body, req.usuario.id)),
    async restablecer(req, res) { await usuarios.restablecerContrasena(Number(req.params.id), req.body.contrasena); res.status(204).end(); },
  };
};
