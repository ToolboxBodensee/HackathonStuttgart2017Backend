const R = require('ramda');

const WIDTH = 1280;
const HEIGHT = 768;

// List of userPoints { 'aaaa': [{x,y,direction},{x,y,direction},{x,y,direction}], ...}
let points = {};

// last tick
let lastTick = null;

module.exports = function configureSocketIO(io) {
  //********************************************************************************
  // FROM CLIENT EVENTS
  //********************************************************************************
  function clientConnected(socket) {
    const id = socket.id;
    console.log('a user connected', id);
    // Attach events to socket
    socket.on('disconnect', clientDisconnected(socket));
    socket.on('changeDirection', clientChangedDirection);

    // Add a new list to points object
    points[id] = [];

    // Place new player random on the map
    const position = {
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT
    }
    const direction = 0;
    points[id].push({
      position,
      direction
    });

    // Notify everyone about the new player and his position
    someoneJoined(id, position, direction);
  }

  function clientDisconnected(socket) {
    return function () {
      const id = socket.id;
      console.log('a user disconnected', id);

      // Remove user from points list
      points = R.pickBy(function (value, key) {
        return key !== id;
      }, points);

      // Notify everyone about the player who left
      someoneLeft();
    }
  }

  function clientChangedDirection(socket) {
    console.log('a user changed his direction');
    someoneChangedDirection();
  }

  //********************************************************************************
  // TO FRONTEND EVENTS
  //********************************************************************************
  function someoneJoined(id, position, direction) {
    io.emit('joined', {
      id,
      position,
      direction
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
    // 

    let delta = 0;
    if (lastTick) {
      delta = Date.now() - lastTick;
    }
    lastTick = Date.now()

    io.emit('tick', {lastTick, delta});
  }

  //********************************************************************************
  // EVENT MAPPING
  //********************************************************************************
  io.on('connection', clientConnected);

  const tickID = setInterval(tick, 1000);
}