const WIDTH = 1280;
const HEIGHT = 768;

// List of userPoints { 'aaaa': [{x,y},{x,y},{x,y}], ...}
const points = {};

module.exports = function configureSocketIO(io) {
  //********************************************************************************
  // FROM CLIENT EVENTS
  //********************************************************************************
  function clientConnected(socket) {
    const id = socket.id;
    console.log('a user connected', id);

    // Add a new list to points object
    points[id] = [];

    // Place new player random on the map
    const position = {
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT
    }
    points[id].push(position);

    // Notify everyone about the new player and his position
    someoneJoined(id, position);
  }

  function clientDisconnected(socket) {
    console.log('a user disconnected');
    someoneLeft();
  }

  function clientChangedDirection(socket) {
    console.log('a user changed his direction');
    someoneChangedDirection();
  }

  //********************************************************************************
  // TO FRONTEND EVENTS
  //********************************************************************************
  function someoneJoined(id, position) {
    io.emit('joined', {
      id,
      position
    });
  }

  function someoneLeft() {
    io.emit('left');
  }

  function someoneChangedDirection() {
    io.emit('changedDirection');
  }

  function collisionOccured() {
    io.emit('collision');
  }

  function tick() {
    io.emit('tick');
  }

  //********************************************************************************
  // EVENT MAPPING
  //********************************************************************************
  io.on('connection', clientConnected);
  io.on('disconnect', clientDisconnected);
  io.on('changeDirection', clientChangedDirection);

  const tickID = setInterval(tick, 1000);
}