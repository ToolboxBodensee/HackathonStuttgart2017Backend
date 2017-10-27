# Wriggle

### Client > Server

* join (name, color)
* changeDirection (angle)
* leave // we could use just the disconnect event

### Server > Frontend

* joined (socketId, name, color)
* changedDirection (angle)
* left (socketId)
* collision (socketId, socketId)
* tick (newPoints[{socketId, x, y}])