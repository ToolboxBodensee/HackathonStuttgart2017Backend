const R = require('ramda');
const Chance = require('chance');

// constants
const WIDTH = 1280;
const HEIGHT = 768;
const PLAYER_SPEED = 40;
const DISPLAY = 'display';
const TICK_RATE = 500;
const STARTING_AREA_HORIZONTAL = 100;
const STARTING_AREA_VERTICAL = 100;
const CENTER = {
  x: WIDTH * 0.5,
  y: HEIGHT * 0.5
};

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
function checkScreenBoundingBox(point) {
  return (point.x >= WIDTH || point.x <= 0) || (point.y >= HEIGHT || point.y <= 0);
}

/**
 * 
 */
function radToDeg(rad) {  
  return rad * 180 / Math.PI;
}

/**
 * 
 */
function degToRad(deg) {  
  return deg * Math.PI / 180;
}

/**
 * 
 */
function randomPosition() {
  const startLeft = chance.bool();
  const startTop = chance.bool();

  let x = 0;
  let y = 0;

  if (startLeft) {
    x = chance.integer({
      min: 5,
      max: STARTING_AREA_HORIZONTAL
    });
  } else {
    x = chance.integer({
      min: WIDTH - STARTING_AREA_HORIZONTAL,
      max: WIDTH - 5
    });
  }

  if (startTop) {
    y = chance.integer({
      min: 5,
      max: STARTING_AREA_VERTICAL
    });
  } else {
    y = chance.integer({
      min: HEIGHT - STARTING_AREA_VERTICAL,
      max: HEIGHT - 5
    });
  }

  return {
    x,
    y
  };
}

/**
 * Direction in radians
 */
function randomDirection(from) {
  const translatedCenter = {
    x: CENTER.x - from.x,
    y: CENTER.y - from.y
  };

  const direction = Math.atan2(translatedCenter.y, translatedCenter.x);
  return direction;

  // return chance.integer({
  //   min: 0,
  //   max: Math.PI * 2
  // });
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
    player.dead = false;
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

    console.log(type, 'connected', id);

    // Attach events to socket
    socket.on('disconnect', clientDisconnected(socket));
    socket.on('changeDirection', clientChangedDirection);
    socket.on('displayCreated', displayCreated);

    if (type === DISPLAY) {
      if (displaySocket) return;
      
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
        const direction = randomDirection(position);
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
      const direction = randomDirection(position);

      console.log('Place player', id, position, direction);

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
        if (player.dead) return;

        const lastPoint = R.last(player.points);
        if (!lastPoint) return;

        // Calculate x,y vec from angle
        const dv = vectorFromAngle(lastPoint.direction);

        // Create translation vector
        const tx = lastPoint.position.x + (PLAYER_SPEED * dv.x * delta);
        const ty = lastPoint.position.y + (PLAYER_SPEED * dv.y * delta);

        // Create a new point
        const newPoint = {
          ...lastPoint
        };

        // Apply translation 
        newPoint.position.x = tx;
        newPoint.position.y = ty;

        // Check if new point is ouf screen bounds
        const pointOutsideScreen = checkScreenBoundingBox(newPoint);
        if (pointOutsideScreen) {
          console.log(key, 'outside screen');
          player.dead = true;
          player.points = [];
          return;
        }

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