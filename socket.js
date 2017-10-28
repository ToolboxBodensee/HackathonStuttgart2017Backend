const R = require('ramda');

// config
const WIDTH = 1280;
const HEIGHT = 768;
const PIXEL_PER_TICK = 100;

// List of userPoints { 'aaaa': [{x,y,direction},{x,y,direction},{x,y,direction}], ...}
let points = {};

// 
let lastTick = null;

//
let displaySocket = null;

function resetGame() {
  points = {};
}

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
    socket.on('displayCreated', clientHasCreatedDisplay(socket));

    // Add a new list to points object
    points[id] = [];

    // Place new player random on the map
    const position = {
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT
    }
    const direction = Math.random() * 360;
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

      // Check if this socket was the display and remove it
      if (displaySocket && displaySocket.id === id) {
        displaySocket = null;
      }

      // Notify everyone about the player who left
      someoneLeft();
    }
  }

  function clientChangedDirection(socket) {
    console.log('a user changed his direction');
    someoneChangedDirection();
  }

  function clientHasCreatedDisplay(socket) {
    return function () {
      const id = socket.id;
      console.log('display connected', id);
      displaySocket = socket;
    }
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

    R.forEachObjIndexed(function (pointList, key) {
      const lastPoint = R.last(pointList);

      // Calculate x,y vec from angle      
      const dx = Math.sin(lastPoint.direction);
      const dy = Math.sin(lastPoint.direction);

      // Translate x,y 
      const tx = lastPoint.position.x + (PIXEL_PER_TICK * dx * delta);
      const ty = lastPoint.position.y + (PIXEL_PER_TICK * dy * delta);

      // Create a new point
      const newPoint = {
        ...lastPoint
      };

      // Apply translation 
      newPoint.position.x = tx;
      newPoint.position.y = ty;

      // Add newPoint in diff object for later client update
      diffs[key] = newPoint;

      // Add this newPoint to history
      pointList.push(newPoint);
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