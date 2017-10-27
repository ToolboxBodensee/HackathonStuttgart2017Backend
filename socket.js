const WIDTH = 1280;
const HEIGHT = 768;

module.exports = function configureSocketIO(io) {
  //********************************************************************************
  // FROM CLIENT EVENTS
  //********************************************************************************
  function clientConnected(socket) {
    console.log('a user connected', socket.id);

    // Place new player random on the map



    // Notify everyone about the new player
    someoneJoined(socket);
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
  function someoneJoined(socket) {
    io.emit('joined', {
      id: socket.id
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