const express = require('express');
const path = require('path');

var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

//********************************************************************************
// EXPRESS MIDDLEWARE
//********************************************************************************
const publicPath = path.join(__dirname, 'node_modules', 'socket.io-client', 'dist');
app.use('/public', express.static(publicPath));
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

//********************************************************************************
// CONFIGURE SOCKET IO
//********************************************************************************
const configureSocketIO = require('./socket');
configureSocketIO(io);

//********************************************************************************
// INIT SERVER
//********************************************************************************
const port = process.env.PORT || 3000;
http.listen(port, function () {
  console.log('listening on *:' + port);
});

