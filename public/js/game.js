document.addEventListener('DOMContentLoaded', () => {
    const roomId = '<%= roomId %>';
    const username = '<%= username %>';
    const team = '<%= team %>';
    const isSpymaster = team.includes('spymaster');
    
    const socket = io();
    const gameBoard = document.getElementById('game-board');
    const redScoreElement = document.getElementById('red-score');
    const blueScoreElement = document.getElementById('blue-score');
    const gameStatus = document.getElementById('game-status');
    const clueDisplay = document.getElementById('clue-display');
    const clueInput = document.getElementById('clue-input');
    const numberInput = document.getElementById('number-input');
    const submitClueButton = document.getElementById('submit-clue');
    const endTurnButton = document.getElementById('end-turn');
    const endgameModal = document.getElementById('endgame-modal');
    const endgameTitle = document.getElementById('endgame-title');
    const endgameMessage = document.getElementById('endgame-message');
    const newGameButton = document.getElementById('new-game');
    const closeEndgameButton = document.getElementById('close-endgame');
    
    let gameState = null;
    
    // الانضمام إلى الغرفة
    socket.emit('join-room', { 
        roomId, 
        username, 
        team: team.replace('-spymaster', ''), 
        isSpymaster 
    });
    
    // استقبال تحديثات اللعبة
    socket.on('update-game', (updatedGameState) => {
        gameState = updatedGameState;
        renderGame();
    });
    
    // نهاية اللعبة
    socket.on('game-ended', (data) => {
        endgameTitle.textContent = "انتهت اللعبة!";
        endgameMessage.textContent = `الفريق ${data.winner === 'red' ? 'الأحمر' : 'الأزرق'} فاز!`;
        endgameModal.style.display = 'flex';
    });
    
    // عرض اللعبة
    function renderGame() {
        if (!gameState) return;
        
        // تحديث النقاط
        redScoreElement.textContent = gameState.redScore;
        blueScoreElement.textContent = gameState.blueScore;
        
        // تحديث حالة اللعبة
        if (gameState.currentClue) {
            gameStatus.textContent = `الفريق ${gameState.currentTeam === 'red' ? 'الأحمر' : 'الأزرق'} - الدليل: ${gameState.currentClue.word} (${gameState.currentClue.number}) - التخمينات المتبقية: ${gameState.remainingGuesses}`;
            clueDisplay.textContent = `${gameState.currentClue.word} - ${gameState.currentClue.number}`;
        } else {
            gameStatus.textContent = `دور الفريق ${gameState.currentTeam === 'red' ? 'الأحمر' : 'الأزرق'} - قائد الفريق، أعطِ دليلاً!`;
            clueDisplay.textContent = "";
        }
        
        // تحديث لوحة اللعب
        gameBoard.innerHTML = '';
        gameState.cards.forEach((card, index) => {
            const cardElement = document.createElement('div');
            cardElement.className = `card ${card.revealed ? card.role + ' revealed' : ''}`;
            cardElement.textContent = card.word;
            
            if (isSpymaster && !card.revealed) {
                cardElement.classList.add(card.role);
            }
            
            if (!card.revealed) {
                cardElement.addEventListener('click', () => {
                    if (!isSpymaster && gameState.currentClue && gameState.remainingGuesses > 0) {
                        socket.emit('card-clicked', { roomId, cardIndex: index });
                    }
                });
            }
            
            gameBoard.appendChild(cardElement);
        });
        
        // تطبيق عرض السباي ماستر إذا كان مفعلاً
        if (isSpymaster) {
            gameBoard.classList.add('spymaster-view');
        } else {
            gameBoard.classList.remove('spymaster-view');
        }
    }
    
    // إرسال دليل جديد (للسباي ماستر فقط)
    if (isSpymaster && submitClueButton) {
        submitClueButton.addEventListener('click', () => {
            const clue = clueInput.value.trim();
            const number = parseInt(numberInput.value);
            
            if (clue && !isNaN(number) && number >= 1 && number <= 5) {
                socket.emit('submit-clue', { 
                    roomId, 
                    clue: { word: clue, number } 
                });
                
                clueInput.value = '';
                numberInput.value = '';
            }
        });
    }
    
    // إنهاء الدور
    if (endTurnButton) {
        endTurnButton.addEventListener('click', () => {
            socket.emit('end-turn', { roomId });
        });
    }
    
    // أزرار نافذة النهاية
    newGameButton.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    closeEndgameButton.addEventListener('click', () => {
        endgameModal.style.display = 'none';
    });
    
    // بدء اللعبة عند تحميل الصفحة
    socket.emit('request-game-state', { roomId });
});