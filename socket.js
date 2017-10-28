const R = require('ramda');

// config
const WIDTH = 1280;
const HEIGHT = 768;
const PIXEL_PER_TICK = 100;

// List of userPoints { 'aaaa': [{x,y,direction},{x,y,direction},{x,y,direction}], ...}
let players = {};

// 
let lastTick = null;

//
let displaySocket = null;

//
let gameRunning = false;

function resetGame() {
  // Reset history for every player
  R.forEachObjIndexed(function (player, id) {
    player.points = [];

    // Place player random on the map
    const position = {
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT
    }
    const direction = Math.random() * 360;
    player.position = position;
    player.direction = direction;

  }, players);
}

module.exports = function configureSocketIO(io) {
  //********************************************************************************
  // FROM CLIENT EVENTS
  //********************************************************************************
  function clientConnected(socket) {
    const id = socket.id;
    const type = socket.handshake.query.type || 'player';
    socket.type = type;

    console.log(type + ' connected', id);

    // Attach events to socket
    socket.on('disconnect', clientDisconnected(socket));
    socket.on('changeDirection', clientChangedDirection);
    socket.on('displayCreated', displayCreated);

    if (type === 'display') {
      resetGame();

      displaySocket = socket;
      displaySocket.on('startGame', displayStartedGame);
      displaySocket.on('stopGame', displayStoppedGame);

      displaySocket.emit('playerList', players);
    } else {
      // Add a new player to players object
      players[id] = {
        name: '',
        color: '#FFFFFF',
        points: []
      };

      if (gameRunning) {
        // Place player random on the map
        const position = {
          x: Math.random() * WIDTH,
          y: Math.random() * HEIGHT
        }
        const direction = Math.random() * 360;
        players[id].position = position;
        players[id].direction = direction;
      }

      // Notify everyone about the new player and his position
      someoneJoined(id);
    }
  }

  function clientDisconnected(socket) {
    return function () {
      const id = socket.id;
      console.log(socket.type + 'disconnected', id);

      // Remove user from players list
      players = R.pickBy(function (value, key) {
        return key !== id;
      }, players);

      // If display disconnects reset everything
      if (socket.type === 'display') {
        displaySocket = null;
        resetGame();
      }

      // Notify everyone about the player who left
      someoneLeft();
    }
  }

  function clientChangedDirection(socket) {
    console.log('a user changed his direction');
    someoneChangedDirection();
  }

  function displayCreated(socket) {
    console.log('Display is initialized');
  }

  function displayStartedGame() {
    console.log('Display started game');
    gameRunning = true;
    resetGame();
  }

  function displayStoppedGame() {
    console.log('Display stopped game');    
    gameRunning = false;
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

    if (gameRunning) {

      const diffs = {};

      R.forEachObjIndexed(function (player, key) {
        const lastPoint = R.last(player.points);

        if (!lastPoint) return;

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
        player.points.push(newPoint);
      }, players);

      // Send tick
      io.emit('tick', {
        lastTick,
        delta,
        diffs
      });
    }

    lastTick = Date.now()
  }

  //********************************************************************************
  // EVENT MAPPING
  //********************************************************************************
  io.on('connection', clientConnected);

  const tickID = setInterval(tick, 1000);
}