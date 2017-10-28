const R = require('ramda');
const Chance = require('chance');

// constants
const WIDTH = 1280;
const HEIGHT = 768;
const PIXEL_PER_TICK = 40;
const DISPLAY = 'display';
const TICK_RATE = 100;

//
const chance = new Chance();

// List of userPoints { 'aaaa': [{x,y,direction},{x,y,direction},{x,y,direction}], ...}
let players = {};

// 
let lastTick = null;

//
let displaySocket = null;

//
let gameRunning = false;


//********************************************************************************
// HELPER
//********************************************************************************
/**
 * 
 */
function radToDeg(rad) {
  return 0;
}

/**
 * 
 */
function degToRad(deg) {
  return 0;
}

/**
 * 
 */
function randomPosition() {
  return {
    x: chance.integer({
      min: 0,
      max: WIDTH
    }),
    y: chance.integer({
      min: 0,
      max: HEIGHT
    }),
  };
}

/**
 * Direction in radians
 */
function randomDirection() {
  return chance.integer({
    min: 0,
    max: Math.PI * 2
  });
}

function vectorFromAngle(rad) {
  return {
    x: Math.cos(rad),
    y: Math.sin(rad)
  }
}

/**
 * 
 */
function resetGame() {
  // Reset history for every player
  R.forEachObjIndexed(function (player, id) {
    player.points = [];
  }, players);
}

module.exports = function configureSocketIO(io) {
  //********************************************************************************
  // FROM CLIENT EVENTS
  //********************************************************************************
  /**
   * 
   */
  function clientConnected(socket) {
    const id = socket.id;
    const type = socket.handshake.query.type || 'player';
    socket.type = type;

    console.log(type + ' connected', id);

    // Attach events to socket
    socket.on('disconnect', clientDisconnected(socket));
    socket.on('changeDirection', clientChangedDirection);
    socket.on('displayCreated', displayCreated);

    if (type === DISPLAY) {
      resetGame();

      displaySocket = socket;
      displaySocket.on('startGame', displayStartedGame);
      displaySocket.on('stopGame', displayStoppedGame);

      displaySocket.emit('playerList', players);
    } else {
      // Add a new player to players object
      players[id] = {
        name: chance.name(),
        color: chance.color({
          format: 'hex'
        }),
        points: []
      };

      if (gameRunning) {
        // Place player random on the map
        const position = randomPosition();
        const direction = randomDirection();
        players[id].position = position;
        players[id].direction = direction;
      }

      // Notify everyone about the new player and his position
      someoneJoined(id);
    }
  }

  /**
   * 
   */
  function clientDisconnected(socket) {
    return function () {
      const id = socket.id;
      console.log(socket.type, 'disconnected', id);

      // Remove user from players list
      players = R.pickBy(function (value, key) {
        return key !== id;
      }, players);

      // If display disconnects reset everything
      if (socket.type === 'display') {
        displaySocket = null;
        gameRunning = false;
        resetGame();
      }

      // Notify everyone about the player who left
      someoneLeft();
    }
  }

  /**
   * 
   */
  function clientChangedDirection(socket) {
    console.log('a user changed his direction');
    someoneChangedDirection();
  }

  /**
   * 
   */
  function displayCreated(socket) {
    console.log('Display is initialized');
  }

  /**
   * 
   */
  function displayStartedGame() {
    if (gameRunning) return;
    console.log('Display started game');
    gameRunning = true;
    resetGame();

    // Set initial position for every player
    R.forEachObjIndexed(function (player, id) {
      // Place player random on the map
      const position = randomPosition();
      const direction = randomDirection();

      const point = {
        position,
        direction
      };

      player.points.push(point);
    }, players);

    console.log(players);
  }

  /**
   * 
   */
  function displayStoppedGame() {
    if (!gameRunning) return;
    console.log('Display stopped game');
    gameRunning = false;
  }

  //********************************************************************************
  // TO FRONTEND EVENTS
  //********************************************************************************
  /**
   * 
   */
  function someoneJoined(id, position, direction) {
    io.emit('joined', {
      id,
      position,
      direction
    });
  }

  /**
   * 
   */
  function someoneLeft() {
    io.emit('left');
  }

  /**
   * 
   */
  function someoneChangedDirection() {
    io.emit('changedDirection');
  }

  /**
   * 
   */
  function collisionOccured() {
    io.emit('collision');
  }

  /**
   * 
   */
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
        const dv = vectorFromAngle(lastPoint.direction);
        

        // Translate x,y 
        const tx = lastPoint.position.x + (PIXEL_PER_TICK * dv.x * delta);
        const ty = lastPoint.position.y + (PIXEL_PER_TICK * dv.y * delta);

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
  const tickID = setInterval(tick, TICK_RATE);
}