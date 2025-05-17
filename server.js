const express = require('express');
const session = require('express-session');
const socketio = require('socket.io');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// تهيئة الجلسات
app.use(session({
    secret: 'codenames-secret',
    resave: false,
    saveUninitialized: true
}));

// ضبط محرك العرض
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ملفات ثابتة
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// كلمات اللعبة
const arabicWords = require('./words-arabic.json');

// تخزين الغرف
const rooms = {};

// المسارات
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/create-room', (req, res) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
        players: [],
        gameState: null,
        spymasters: []
    };
    res.redirect(`/lobby?room=${roomId}`);
});

app.get('/lobby', (req, res) => {
    const roomId = req.query.room;
    if (!roomId || !rooms[roomId]) {
        return res.redirect('/');
    }
    res.render('lobby', { roomId });
});

app.get('/game', (req, res) => {
    const roomId = req.query.room;
    const username = req.query.username;
    const team = req.query.team;
    
    if (!roomId || !rooms[roomId] || !username) {
        return res.redirect('/');
    }
    
    res.render('game', { roomId, username, team });
});

// بدء الخادم
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// تهيئة Socket.io
const io = socketio(server);

io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('join-room', (data) => {
        const { roomId, username, team } = data;

        if (!rooms[roomId]) {
            console.warn(`Room ${roomId} does not exist.`);
            return;
        }

        socket.join(roomId);

        if (!rooms[roomId].players.some(p => p.id === socket.id)) {
            rooms[roomId].players.push({
                id: socket.id,
                username,
                team,
                isSpymaster: false
            });
        }

        io.to(roomId).emit('update-players', rooms[roomId].players);
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('update-players', rooms[roomId].players);

            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted due to empty.`);
            }
        }
    });

    console.log('New user connected');
    
    socket.on('join-room', (data) => {
        const { roomId, username, team } = data;
        socket.join(roomId);
        
        if (!rooms[roomId].players.some(p => p.id === socket.id)) {
            rooms[roomId].players.push({
                id: socket.id,
                username,
                team,
                isSpymaster: false
            });
        }
        
        io.to(roomId).emit('update-players', rooms[roomId].players);
    });
    
    socket.on('start-game', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].gameState = initializeGame();
            io.to(roomId).emit('game-started', rooms[roomId].gameState);
        }
    });
    
    socket.on('card-clicked', (data) => {
        const { roomId, cardIndex } = data;
        const room = rooms[roomId];
        
        if (room && room.gameState && !room.gameState.cards[cardIndex].revealed) {
            room.gameState.cards[cardIndex].revealed = true;
            
            // تحديث النقاط ونقل الدور حسب الحاجة
            updateGameState(room.gameState, cardIndex);
            
            io.to(roomId).emit('update-game', room.gameState);
            
            // التحقق من نهاية اللعبة
            if (checkGameEnd(room.gameState)) {
                io.to(roomId).emit('game-ended', { winner: room.gameState.winner });
            }
        }
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected');
        // إزالة اللاعب من الغرف عند الانفصال
        Object.keys(rooms).forEach(roomId => {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('update-players', rooms[roomId].players);
        });
    });
});

// وظائف مساعدة
function generateRoomId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function initializeGame() {
    const shuffledWords = [...arabicWords].sort(() => 0.5 - Math.random()).slice(0, 25);
    const keyCard = createKeyCard();
    
    const cards = shuffledWords.map((word, index) => ({
        word,
        role: keyCard[Math.floor(index / 5)][index % 5],
        revealed: false
    }));
    
    return {
        cards,
        currentTeam: 'red',
        redScore: 0,
        blueScore: 0,
        currentClue: null,
        remainingGuesses: 0,
        winner: null
    };
}

function createKeyCard() {
    const roles = [
        ...Array(8).fill('red'),
        ...Array(8).fill('blue'),
        ...Array(7).fill('neutral'),
        'black'
    ].sort(() => 0.5 - Math.random());
    
    // التأكد من أن الفريق الأول لديه بطاقة إضافية
    const redCount = roles.filter(r => r === 'red').length;
    const blueCount = roles.filter(r => r === 'blue').length;
    
    if (redCount === 9 && blueCount === 8) {
        // كل شيء صحيح
    } else if (redCount === 8 && blueCount === 9) {
        // تبديل الأدوار لجعل الأحمر لديه 9
        for (let i = 0; i < roles.length; i++) {
            if (roles[i] === 'red') roles[i] = 'blue';
            else if (roles[i] === 'blue') roles[i] = 'red';
        }
    }
    
    // تحويل إلى مصفوفة 5x5
    const keyCard = [];
    for (let i = 0; i < 5; i++) {
        keyCard.push(roles.slice(i * 5, (i + 1) * 5));
    }
    
    return keyCard;
}

function updateGameState(gameState, cardIndex) {
    const card = gameState.cards[cardIndex];
    
    if (card.role === 'black') {
        gameState.winner = gameState.currentTeam === 'red' ? 'blue' : 'red';
    } else if (card.role === gameState.currentTeam) {
        if (gameState.currentTeam === 'red') {
            gameState.redScore++;
        } else {
            gameState.blueScore++;
        }
        
        // تقليل عدد التخمينات المتبقية
        if (gameState.remainingGuesses > 0) {
            gameState.remainingGuesses--;
        }
        
        // التحقق من الفوز
        if ((gameState.currentTeam === 'red' && gameState.redScore >= 9) ||
            (gameState.currentTeam === 'blue' && gameState.blueScore >= 8)) {
            gameState.winner = gameState.currentTeam;
        }
    } else {
        // تبديل الدور
        gameState.currentTeam = gameState.currentTeam === 'red' ? 'blue' : 'red';
        gameState.remainingGuesses = 0;
    }
}

function checkGameEnd(gameState) {
    return gameState.winner !== null;
}