const sockets = new Map();

module.exports = {
  get: (id) => sockets.get(id),
  set: (id, socket) => sockets.set(id, socket),
  remove: (id) => sockets.delete(id)
};
