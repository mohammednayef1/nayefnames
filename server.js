const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const path = require('path');

const PORT = process.env.PORT || 10000;

const rooms = {};

app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('create-room', (roomId) => {
        rooms[roomId] = {
            players: [],
            words: [],
            revealedWords: [],
            turn: 'red',
            gameStarted: false
        };
        socket.join(roomId);
    });

    socket.on('join-room', (data) => {
        const { roomId, username, team } = data;

        // تحقق أولاً من وجود الغرفة
        if (!rooms[roomId]) {
            console.warn(`Room ${roomId} does not exist.`);
            return;
        }

        socket.join(roomId);

        // تأكد من أن مصفوفة اللاعبين موجودة
        if (rooms[roomId] && Array.isArray(rooms[roomId].players)) {
            // تحقق من عدم وجود اللاعب مسبقًا
            if (!rooms[roomId].players.some(p => p.id === socket.id)) {
                rooms[roomId].players.push({
                    id: socket.id,
                    username,
                    team,
                    isSpymaster: false
                });
            }

            // تحديث اللاعبين في الغرفة
            io.to(roomId).emit('update-players', rooms[roomId].players);
        } else {
            console.warn(`Room ${roomId} is missing players array.`);
        }
    });

    socket.on('start-game', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].gameStarted = true;
            io.to(roomId).emit('game-started');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('update-players', rooms[roomId].players);
        }
    });
});

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
