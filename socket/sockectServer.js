import Game from '../models/gameModel.js';
import { Server } from "socket.io";
import { calculateAmounts as calcAmounts, getCurrentGame } from '../controllers/cardController.js';

let mainTime = 120;

let timer = {
    remainingTime: mainTime,
    isRunning: false
};

const CALCULATION_START_TIME = 9;

let timerInterval;
// Start and manage the timer

const startTimer = (socket) => {
    if (!timer.isRunning) {
        timer.isRunning = true;
        timer.remainingTime = mainTime;
        let calculatedAmounts = null;
        let gameID = null;
        let previousGameID = null;

        broadcastTimerUpdate(socket);

        timerInterval = setInterval(async () => {
            try {
                if (timer.remainingTime > 0) {
                    timer.remainingTime -= 1;
                    console.log(timer.remainingTime);

                    // Calculate amounts when we reach CALCULATION_START_TIME seconds
                    if (timer.remainingTime === CALCULATION_START_TIME) {
                        console.log('Calculating amounts...');
                        calculatedAmounts = await calcAmounts(timer.remainingTime);
                        console.log(calculatedAmounts);
                    }


                    if (timer.remainingTime === mainTime - 2) {
                        const result = await getCurrentGame();
                        if (result.success) {
                            gameID = result.data.gameId;

                            // Check if the new gameID is the same as the previous one
                            if (gameID === previousGameID) {
                                console.log('GameID unchanged, retrieving data again...');
                                0// Call getCurrentGame again to fetch fresh data
                                const refreshedResult = await getCurrentGame();
                                if (refreshedResult.success) {
                                    gameID = refreshedResult.data.gameId;
                                } else {
                                    console.error('Failed to refresh game data:', refreshedResult.message);
                                }
                            }
                            // Update previousGameID for the next comparison
                            previousGameID = gameID;

                        } else {
                            console.error('Failed to get current game:', result.message);
                        }
                    }


                    // Broadcast calculated amounts for the last CALCULATION_START_TIME seconds
                    if (timer.remainingTime <= CALCULATION_START_TIME && timer.remainingTime > 0) {
                        broadcastTimerUpdate(socket, gameID, calculatedAmounts);
                    } else {
                        broadcastTimerUpdate(socket, gameID);  // Just update the timer without amounts
                    }

                } else {
                    // Timer hit zero, stop the timer
                    clearInterval(timerInterval);
                    timer.isRunning = false;

                    // Create a new GameId when the timer hits zero
                    const newGameId = await createNewGame();

                    // Emit timer stop event and the new GameId
                    broadcastTimerUpdate(socket, newGameId);

                    // Reset and restart the timer after a short delay
                    setTimeout(() => {
                        resetAndRestartTimer(socket);
                    }, 1000); // Wait 1 second before restarting
                }
            } catch (error) {
                console.error('Error during timer tick:', error);
                clearInterval(timerInterval);
                timer.isRunning = false;
            }
        }, 1000);  // The timer ticks every second
    }
};

// const startTimer = (socket) => {
//     if (!timer.isRunning) {
//         timer.isRunning = true;
//         timer.remainingTime = mainTime;
//         broadcastTimerUpdate(socket);

//         timerInterval = setInterval(async () => {
//             try {
//                 if (timer.remainingTime > 0) {
//                     timer.remainingTime -= 1;
//                     console.log(timer.remainingTime);

//                     // Check if calculations should start
//                     if (timer.remainingTime == CALCULATION_START_TIME) {
//                         console.log('Calculating amounts...');

//                         const calculatedAmounts = await calcAmounts(timer.remainingTime);
//                         console.log(calculatedAmounts);


//                         broadcastTimerUpdate(socket, null, calculatedAmounts);
//                     } else {
//                         broadcastTimerUpdate(socket);  // Just update the timer without amounts
//                     }

//                 } else {
//                     // Timer hit zero, stop the timer
//                     clearInterval(timerInterval);
//                     timer.isRunning = false;

//                     // Create a new GameId when the timer hits zero
//                     const newGameId = await createNewGame();

//                     // Emit timer stop event and the new GameId
//                     broadcastTimerUpdate(socket, newGameId);

//                     // Reset and restart the timer after a short delay
//                     setTimeout(() => {
//                         resetAndRestartTimer(socket);
//                     }, 1000); // Wait 1 second before restarting
//                 }
//             } catch (error) {
//                 console.error('Error during timer tick:', error);
//                 clearInterval(timerInterval);
//                 timer.isRunning = false;
//             }
//         }, 1000);  // The timer ticks every second
//     }
// };


// Helper to reset and restart the timer
const resetAndRestartTimer = (socket) => {
    timer.remainingTime = mainTime;
    timer.isRunning = false;
    broadcastTimerUpdate(socket);
    startTimer(socket);
};

const broadcastTimerUpdate = (socket, newGameId = null, calculatedAmounts = null) => {
    const updateData = {
        remainingTime: timer.remainingTime,
        isRunning: timer.isRunning
    };
    if (newGameId !== null) {
        updateData.newGameId = newGameId;
    }
    if (calculatedAmounts !== null) {
        updateData.calculatedAmounts = calculatedAmounts;
    }
    socket.emit('timerUpdate', updateData);
    socket.broadcast.emit('timerUpdate', updateData);
};

const createNewGame = async () => {
    // Implement the logic to create a new game ID
    const lastGame = await Game.findOne().sort({ createdAt: -1 }); // Get the last game

    const newGame = new Game({
        Bets: []  // Initialize an empty array for the bets
    });
    await newGame.save();

    // This is a placeholder function
    return newGame._id.toString();
};

const startSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: '*'
        }
    });
    io.on('connection', (socket) => {
        console.log('A user connected');
        // Send current timer state to newly connected client
        socket.emit('timerUpdate', { remainingTime: timer.remainingTime, isRunning: timer.isRunning });

        socket.on('startTimer', () => {
            startTimer(socket);
        });

        socket.on('disconnect', () => {
            console.log('User disconnected');
        });
    });
};

export { startSocket };
