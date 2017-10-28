const R = require('ramda');

// config
const WIDTH = 1280;
const HEIGHT = 768;
const PIXEL_PER_TICK = 100;

// List of userPoints { 'aaaa': [{x,y,direction},{x,y,direction},{x,y,direction}], ...}
let points = {};

// 
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
    const direction = Math.random() * 360;
    points[id] = {
      position,
      direction
    };

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
    let delta = 0;
    if (lastTick) {
      delta = (Date.now() - lastTick) / 1000.0;
    }

    const diffs = {};

    R.forEachObjIndexed(function (element, key) {
      // Calculate x,y vec from angle      
      const dx = Math.sin(element.direction);
      const dy = Math.sin(element.direction);

      // Translate x,y 
      const tx = element.position.x + (PIXEL_PER_TICK * dx * delta);
      const ty = element.position.y + (PIXEL_PER_TICK * dy * delta);

      // Apply translation 
      element.position.x = tx;
      element.position.y = ty;

      // Add element in diff object for later client update
      diffs[key] = element;

    }, points);

    io.emit('tick', {
      lastTick,
      delta,
      diffs
    });
    lastTick = Date.now()
  }

  //********************************************************************************
  // EVENT MAPPING
  //********************************************************************************
  io.on('connection', clientConnected);

  const tickID = setInterval(tick, 1000);
}