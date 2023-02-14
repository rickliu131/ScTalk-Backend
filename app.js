'use strict';

// HELPERS
const helpers = require('./helpers');
const genDigits = helpers.genDigits;
const extractRoomID = helpers.extractRoomID;
const reportNoRoomJoinedError = helpers.reportNoRoomJoinedError;

// TLS FILENAMES
const tls = require('./tls');
const keyName = tls.key;
const certName = tls.cert

// MODULES
const express = require("express");
const { createServer } = require("https");
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { key } = require('./tls');

// LOCAL VARIABLES INIT
// rooms
/*
(Map)
{
  room_id (string): (Object)
  {
    name: (string),
    status: (int),
    members: (Map) 
    {
      socket_id (string): nickname (string),
      ...
    }
  }, ...
}
*/
var rooms = new Map();
rooms.set('0', { name: "Room 0", status: 1, members: new Map() }); // room 0 is reserved
// paths
const pathPublic = path.join(__dirname, 'public');
const pathFiles = path.join(__dirname, 'files');
const pathTLS = path.join(__dirname, 'tls');
const pathTLSKey = path.join(pathTLS, keyName);
const pathTLSCert = path.join(pathTLS, certName);
// port
const PORT = 443;
// number of room id digits
const DIGITS = 6;

// APP INIT
// express
const app = express();
app.use(cors());
app.use(express.static(pathPublic));
app.use(express.json());
// Socket.IO
const httpsServer = createServer({
  key: fs.readFileSync(pathTLSKey),
  cert: fs.readFileSync(pathTLSCert)
}, app);
const io = new Server(httpsServer, {
  cors: {
    origin: '*'
  },
  maxHttpBufferSize: 5e9, // 5000MB max per message (set for file uploads)
  pingTimeout: 15000 // 15 seconds timeout
});

// ## Socket.IO Methods START ##
// # Socket.IO, 'connection'
io.on('connection', (socket) => {
  socket.on('join sv', (roomID, nickname) => {
    // room id exists AND room is open
    if (rooms.has(roomID) && rooms.get(roomID).status == 1) {
      socket.emit('permit cl', 1); // accept

      rooms.get(roomID).members.set(socket.id, nickname); // local update, members in the room

      socket.join(roomID);
      socket.in(roomID).emit('member cl', '+', nickname); // emit to everyone in the room, except the member just joined

      // (room name, room status, members), emit in order
      socket.emit('init cl', rooms.get(roomID).name, 
                             rooms.get(roomID).status,
                             Array.from(rooms.get(roomID).members.values()));
    } else {
      socket.emit('permit cl', 0); // reject
    }
  });

  // # Socket.IO, 'msg sv', text message sent to the server received
  socket.on('msg sv', (msg) => {
    const roomID = extractRoomID(socket.rooms);
    if (roomID) {
      const author = rooms.get(roomID).members.get(socket.id); //nickname
      const time = new Date().toJSON();

      io.in(roomID).emit('msg cl', msg, author, time);
    } else {
      reportNoRoomJoinedError();
    }
  });

  // # Socket.IO, 'msg-files sv', files sent to the server received
  // save files internally, and emit file message to the client
  // internal files path: ./files/<Room ID>/<File Name>
  // public urls: <Base Domain>/files/<Room ID>/<File Name>
  socket.on('msg-files sv', (files) => {
    const roomID = extractRoomID(socket.rooms);
    if (roomID) {
      const author = rooms.get(roomID).members.get(socket.id); //nickname
      const time = new Date().toJSON();

      let fileNames = [];
      for (const file of files) {
        fileNames.push(file.name);

        const pathFilesRoom = path.join(pathFiles, roomID);
        const pathFilesRoomTarget = path.join(pathFilesRoom, file.name);

        if (!fs.existsSync(pathFilesRoom)) {
          fs.mkdirSync(pathFilesRoom, { recursive: true });
        }

        fs.writeFile(pathFilesRoomTarget, file.data, (err) => {
          if (err) {
            console.log('Cannot write user uploaded file to the file system.');
          }
        });
      }

      io.in(roomID).emit('msg-files cl', fileNames, author, time);
    } else {
      reportNoRoomJoinedError();
    }
  });

  // # Socket.IO, 'status sv', status change sent to the server received
  // status: -1 (delete), 0 (close), or 1 (open)
  socket.on('status sv', (status) => {
    const roomID = extractRoomID(socket.rooms);
    if (roomID) {
      if (status == -1) {
        rooms.delete(roomID); // no need to update local data, delete key/value right away

        // delete stored files
        const pathFilesRoom = path.join(pathFiles, roomID);
        if (fs.existsSync(pathFilesRoom)) {
          fs.rmSync(pathFilesRoom, { recursive: true });
        }

        io.in(roomID).disconnectSockets(); // heads to 'disconnecting' event
        // io.in(roomID).socketsLeave(roomID);
      } else {
        rooms.get(roomID).status = status; //local update, room's status

        io.in(roomID).emit('status cl', status);
      }
    } else {
      reportNoRoomJoinedError();
    }
  });

  // # Socket.IO, 'disconnecting'
  // EITHER 'status sv' (delete room) -> 'disconnecting', (local room variable has been deleted)
  // OR (user closes the tab) 'disconnecting' (local room variable exists)
  // use 'disconnecting' rather than 'disconnect', since at this time 'socket.rooms' hasn't been cleaned yet
  socket.on('disconnecting', () => {
    const roomID = extractRoomID(socket.rooms);
    if (roomID) {
      // if the socket joined the room
      if (rooms.has(roomID)) {
        // if the room exists
        const currentMembers = rooms.get(roomID).members;
        if (currentMembers.has(socket.id)) {
          const deletedMember = currentMembers.get(socket.id);
          currentMembers.delete(socket.id);
          io.in(roomID).emit('member cl', '-', deletedMember);
        } else {
          // error
          // if socket.rooms contains the room, currentMembers must contain socket.id
        }
      } else {
        // if the room is deleted, do nothing
      }
    }
  });
});
// ## Socket.IO Methods END ##

// ## HTTP Methods START ##
// launch server
httpsServer.listen(PORT, () => {
  console.log(`Listening on port ${PORT}...`);
});

// # POST, create room
app.post('/createRoom', (req, res) => {
  console.log('POST /createRoom');
  console.log('Recieved Data: ');
  console.log(req.body);

  let id = genDigits(DIGITS); // string
  while (rooms.has(id)) {
    id = genDigits(DIGITS);
  }

  rooms.set(id, {
    name: req.body.roomName,
    status: 1, //open to join
    members: new Map()
  });

  res.json({'roomID': id});

  console.log('Current Rooms: ');
  console.log(rooms);
})

// # GET, entry
app.get('/', (req, res) => {
  console.log('GET /');

  const entry = 'index.html';
  res.sendFile(path.join(pathPublic, entry));
});

// # GET, '<Base Domain>/files/...'
app.get('/files/:roomID/:fileName', (req, res) => {
  const roomID = req.params.roomID;
  const fileName = req.params.fileName;

  console.log('GET /<Room ID>/<File Name>');
  console.log('Room ID: ' + roomID);
  console.log('File Name: ' + fileName);

  const pathFilesRoomTarget = path.join(pathFiles, roomID, fileName);
  if (fs.existsSync(pathFilesRoomTarget)) {
    res.download(path.join(pathFiles, roomID, fileName));
  } else {
    res.sendStatus(404); // target file not found
  }
});
// ## HTTP Methods END ##