const R = require('ramda');
const Chance = require('chance');
const kld = require('kld-intersections');
const logger = require('./log');


// constants
const WIDTH = 1280;
const HEIGHT = 768;
const PLAYER_SPEED = 120;
const MAX_SEGMENTS = 22;
const DISPLAY = 'display';
const TICK_RATE = 140;
const STEERING_SPEED = 1.2;
const STARTING_AREA_HORIZONTAL = 30;
const STARTING_AREA_VERTICAL = 30;
const CENTER = {
  x: WIDTH * 0.5,
  y: HEIGHT * 0.5
};

const COLORS = ['#EF476F',
  '#06D6A0',
  '#FFD166',
  '#00C0FF',
  '#FFFFFF'
  //'#003559'
];

//
const chance = new Chance();

// List of userPoints { 'aaaa': [{x,y,direction},{x,y,direction},{x,y,direction}], ...}
let players = {};

//
let unpickedColors = [];

// 
let lastTick = null;

//
let displaySocket = null;

//
let gameRunning = true;

//
let delta = 0;

//********************************************************************************
// HELPER
//********************************************************************************
/**
 *
 */
function checkScreenBoundingBox(point) {
  const outsideHorizontal = point.x > WIDTH || point.x < 0;
  const outsideVertical = point.y > HEIGHT || point.y < 0;
  return outsideHorizontal || outsideVertical;
}

function checkPlayerCollision(id, playerToCheck) {

  for (const otherId in players) {
    if (otherId === id) continue;

    const leftLine = playerToCheck.points;
    const rightLine = players[otherId].points;

    const collide = linesCollide(leftLine, rightLine);

    if (collide) {
      return {
        deadPlayer  : id,
        collide     : true,
        collidedWith: otherId
      };
    }
  }

  return null;
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

function linesCollide(lineA, lineB) {
  const reduceLine = R.map(function (e) {
    return new kld.Point2D(e.position.x, e.position.y);
  });

  let convertedLineA = reduceLine(lineA);
  convertedLineA = R.slice(-2, R.Infinity, convertedLineA);
  const convertedLineB = reduceLine(lineB);

  let result = kld.Intersection.intersectPolylinePolyline(convertedLineA, convertedLineB);

  return result.status === 'Intersection';
}

/**
 *
 */
function randomPosition() {
  const startLeft = chance.bool();
  const startTop = chance.bool();

  let position = {};

  const startSector = chance.pickone(['left', 'right', 'top', 'bottom']);

  switch (startSector) {
    case 'left':
      position = {
        x: 0,
        y: chance.integer({
          min: STARTING_AREA_VERTICAL,
          max: HEIGHT - STARTING_AREA_VERTICAL
        })
      };
      break;
    case 'right':
      position = {
        x: WIDTH,
        y: chance.integer({
          min: STARTING_AREA_VERTICAL,
          max: HEIGHT - STARTING_AREA_VERTICAL
        })
      };
      break;
    case 'top':
      position = {
        x: chance.integer({
          min: STARTING_AREA_HORIZONTAL,
          max: WIDTH - STARTING_AREA_HORIZONTAL
        }),
        y: 0
      };
      break;
    case 'bottom':
      position = {
        x: chance.integer({
          min: STARTING_AREA_HORIZONTAL,
          max: WIDTH - STARTING_AREA_HORIZONTAL
        }),
        y: HEIGHT
      };
      break;
  }

  return position;
}

/**
 * Direction in radians
 */
function randomDirection(from) {
  const translatedCenter = {
    x: CENTER.x - from.x,
    y: CENTER.y - from.y
  };

  return Math.atan2(translatedCenter.y, translatedCenter.x);
}

function vectorFromAngle(rad) {
  return {
    x: Math.cos(rad),
    y: Math.sin(rad)
  };
}

function getColor() {
  if (unpickedColors.length > 0) {
    const color = chance.pickone(unpickedColors);
    unpickedColors = R.without(color, unpickedColors);
    return color;
  } else {
    return chance.color({
      format: 'hex'
    });
  }
}

/**
 *
 */
function resetGame() {
  unpickedColors = COLORS;

  // Reset history for every player
  R.forEachObjIndexed(function (player) {
    player.points = [];
    player.dead = false;
    player.color = getColor();
  }, players);
}

module.exports = function configureSocketIO(io, app) {
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

    if (type === DISPLAY) {
      //resetGame(); TODO UNCOMMENT THIS AGAIN

      displaySocket = socket;
      displaySocket.on('disconnect', displayDisconnected);
      displaySocket.on('displayCreated', displayCreated);
      displaySocket.on('startGame', displayStartedGame);
      displaySocket.on('stopGame', displayStoppedGame);

      displaySocket.emit('playerList', players);
    } else {
      let name = socket.handshake.query.name || chance.name();
      logger.info(`${type} connected ${id} ${name}`);

      if (type === 'bot') {
        name = '(BOT)' + name;
      }

      // Attach events to socket
      socket.on('disconnect', clientDisconnected(socket));
      socket.on('changeDirection', clientChangedDirection(socket));

      // Add a new player to players object
      players[id] = {
        name  : name,
        color : getColor(),
        points: [],
        isBot : type === 'bot'
      };

      socket.emit('connectionSuccess', players[id]);

      if (gameRunning) {
        // Place player random on the map
        const position = randomPosition();
        const direction = randomDirection(position);

        players[id].direction = direction;
        players[id].points = [{position, direction}];
      }

      // Notify everyone about the new player and his position
      someoneJoined(id, players[id]);
    }
  }

  /**
   *
   */
  function clientDisconnected(socket) {
    return function () {
      const id = socket.id;
      logger.info(`${socket.type} disconnected ${id}`);

      // Remove user from players list
      players = R.pickBy(function (value, key) {
        return key !== id;
      }, players);

      //// If display disconnects reset everything
      //if (socket.type === 'display') {
      //  displaySocket = null;
      //  gameRunning = false;
      //  resetGame();
      //}

      // Notify everyone about the player who left
      someoneLeft(id);
    };
  }

  /**
   *
   */
  function clientChangedDirection(socket) {
    return function (rad) {
      const id = socket.id;
      const last = players[id].direction || 0;
      players[id].direction = last + (rad * delta * STEERING_SPEED);
    };
  }

  function displayDisconnected() {
    logger.info('Display disconnected');
    gameRunning = false;
    resetGame();

    // Reset history for every player
    R.forEachObjIndexed(function (player, id) {
      io.to(id).emit('changeColor', player.color);
    }, players);
  }

  /**
   *
   */
  function displayCreated(socket) {
    logger.info('Display is initialized');
  }

  /**
   *
   */
  function displayStartedGame() {
    if (gameRunning) return;
    logger.info('Display started game');
    gameRunning = true;
    resetGame();

    // Set initial position for every player
    R.forEachObjIndexed(function (player, id) {
      // Place player random on the map
      const position = randomPosition();
      const direction = randomDirection(position);

      logger.info(`Place player ${id} ${position} ${direction}`);

      const point = {
        position,
        direction
      };

      player.direction = direction;
      player.points.push(point);
    }, players);

    logger.info(players);
  }

  /**
   *
   */
  function displayStoppedGame() {
    if (!gameRunning) return;
    logger.info('Display stopped game');
    gameRunning = false;
  }

  //********************************************************************************
  // TO FRONTEND EVENTS
  //********************************************************************************
  /**
   *
   */
  function someoneJoined(id, player) {
    io.emit('joined', {
      id,
      player
    });
  }

  /**
   *
   */
  function someoneLeft(id) {
    io.emit('left', {
      id
    });
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

    if (lastTick) {
      delta = (Date.now() - lastTick) / 1000.0;
    }

    if (gameRunning) {
      const diffs = {};

      R.forEachObjIndexed(function (player, key) {
        if (player.dead) return;

        const lastPoint = R.last(player.points);
        if (!lastPoint) return;

        if (player.isBot) {
          const last = player.direction || 0;
          const direction = chance.bool() ? -1 : 1;
          player.direction = last + (direction * delta * STEERING_SPEED);
        }

        // Calculate x,y vec from angle
        const dv = vectorFromAngle(player.direction);

        // Create translation vector
        const tx = lastPoint.position.x + (PLAYER_SPEED * dv.x * delta);
        const ty = lastPoint.position.y + (PLAYER_SPEED * dv.y * delta);

        // Create a new point
        const newPoint = {
          position : {x: tx, y: ty},
          direction: player.direction
        };

        // Check if new point is ouf screen bounds
        const pointOutsideScreen = checkScreenBoundingBox(newPoint.position);
        if (pointOutsideScreen) {
          logger.info(`${key} outside screen`);
          player.dead = true;
          player.points = [];
          if (displaySocket) displaySocket.emit('collision', {deadPlayer: key});
          return;
        }

        // Check for player collision
        const collision = checkPlayerCollision(key, player);
        if (collision) {
          console.log(`${key} collision`);
          player.dead = true;
          player.points = [];
          if (displaySocket) displaySocket.emit('collision', {deadPlayer: key});
          return;
        }

        // Add newPoint in diff object for later client update
        diffs[key] = newPoint;

        // Add this newPoint to history
        player.points.push(newPoint);
        if (player.points.length > MAX_SEGMENTS) {
          player.points.splice(0, 1);
        }
      }, players);

      // Send tick
      io.emit('tick', {
        lastTick,
        delta,
        diffs
      });
    }

    lastTick = Date.now();
  }

  //********************************************************************************
  // EVENT MAPPING
  //********************************************************************************
  io.on('connection', clientConnected);
  const tickID = setInterval(tick, TICK_RATE);

  app.get('/', function (req, res) {
    const playerList = R.values(R.map((value) => {
      return {
        name: value.name, dead: value.dead
      };
    }, players));

    const result = {players: playerList, count: playerList.length};

    res.json(result);
  });
};