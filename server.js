const { connected } = require("process");

let app = require("express")();
let http = require("http").Server(app);
let io = require("socket.io")(http);

const connectedUsers = new Map();

io.on("connection", socket => {
  // socket.on('join', function(room) { 
  //   console.log('joining room', room);
  //   socket.join(room); 
  // })

  socket.on('disconnect', function(room) {  
      //socket.leaveAll();

      // var emitData = {
      //   username: socket.username,
      //   action: 'leave'
      // }
      
      // io.sockets.in(socket.quizId).emit('send', emitData);

      // console.log("user has disconnected")

      var users = connectedUsers.get(socket.quizId)

      if(users) {
        users = users.filter(u => u !== socket.username);
        connectedUsers.set(socket.quizId, users)
      }

      if(!users) {
        connectedUsers.delete(socket.quizId);
      }
      
      socket.leaveAll();
      var emitData = {
        username: socket.username,
        quizId: socket.quizId,
        action: 'leave',
        partyList: users
      }

      io.sockets.in(socket.quizId).emit('send', emitData);

      socket.username = "";
      socket.quizId = "";

      // delete socket.username;
      // delete socket.quizId;
  })

  socket.on('send', function(data) {

    if (data.action === 'join') 
    {
      socket.username = data.username;
      socket.quizId = data.quizId;
  
      socket.join(data.quizId);
      if(!connectedUsers.has(data.quizId))
      {
        connectedUsers.set(data.quizId, [])
      }
      
      var users = connectedUsers.get(data.quizId);
      users.push(data.username)
      connectedUsers.set(data.quizId, users);

      var emitData = {
        username: data.username,
        action: 'join',
        partyList: connectedUsers.get(data.quizId)
      }

      console.log(socket.username + " has joined quiz " + socket.quizId + ".")
      console.log(socket.quizId + " contains: " + connectedUsers.get(data.quizId))
        
      io.sockets.in(data.quizId).emit('send', emitData);
    }
    else if (data.action === 'leave') 
    {
      var users = connectedUsers.get(socket.quizId)

      if(users) {
        users = users.filter(u => u !== data.username);
        connectedUsers.set(socket.quizId, users)
      }

      if(!users) {
        connectedUsers.delete(socket.quizId);
      }

      console.log(socket.username + " has left quiz " + socket.quizId + ".")
      console.log(socket.quizId + " contains: " + connectedUsers.get(data.quizId))
      
      socket.leaveAll();
      var emitData = {
        username: socket.username,
        quizId: socket.quizId,
        action: 'leave',
        partyList: users
      }

      io.sockets.in(socket.quizId).emit('send', emitData);

      socket.username = "";
      socket.quizId = "";
    }
    else 
    {
      console.log("Unspecified action");
    }
    
  });
});

// Initialize our websocket server on port 5000
http.listen(5000, () => {
  console.log("started on port 5000");
});

app.get("/isAlive", (req, res) => {
  return res.send("Alive!");
});