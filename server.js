let app = require("express")();
let http = require("http").Server(app);
let io = require("socket.io")(http);

io.on("connection", socket => {
  socket.on('join', function(room) { 
    console.log('joining room', room);
    socket.join(room); 
  })

  socket.on('leave', function(room) {  
      console.log('leaving quiz', room);
      socket.leave(room); 
  })

  socket.on('send', function(data) {
      console.log("user " + data.username + " has joined quiz " + data.quizId);
      socket.join(data.quizId);
      io.sockets.in(data.quizId).emit('send', data.username);
  });
});

// Initialize our websocket server on port 5000
http.listen(5000, () => {
  console.log("started on port 5000");
});