const startPage = document.querySelector("#startPage"); //html Seiten
const gamePage = document.querySelector("#gamePage");
const gameOverPage = document.querySelector("#gameOverPage");

const nameInput = document.querySelector("#nameInput"); //Startseitenelemente
const startBtn = document.querySelector("#startBtn");

const nameSpan = document.querySelector("#nameSpan");   //Scoreboardelemente
const scoreSpan = document.querySelector("#pointsSpan");
const timeSpan = document.querySelector("#timeSpan");

const newTaskBtn = document.querySelector("#newTaskBtn");   //Aufgaben-/Formularelemente
const checkBtn = document.querySelector("#checkBtn");
const num1Span = document.querySelector("#num1Span");
const num2Span = document.querySelector("#num2Span");
const solutionField = document.querySelector("#solutionInput");
const form = document.querySelector("#form");

const restartBtn = document.querySelector("#restartBtn");

const game = {
    num1: 0,
    num2: 0,
    timer: null,
    score: 0,
    solutionChecked: false,
    username: String(localStorage.getItem("username")) || "",
    highScore: Number(localStorage.getItem("highScore")) || 0
};  //Variablen und Daten

/*
    Funktionen
*/

function genNewTask() { //generiert neue Zahlen und zeigt diese an
    game.solutionChecked = false;    //wichtig für checkSolution()
    game.num1 = Math.floor(Math.random()*100)+1;
    game.num2 = Math.floor(Math.random()*(10 - genZehnerUebergang(game.num1) + 1)) + genZehnerUebergang(game.num1);

    num1Span.textContent = game.num1;
    num2Span.textContent = game.num2;

    solutionField.style.backgroundColor = 'white';   //Antwortfeld wird wieder weiß gestellt
    solutionField.value = "";
    solutionField.focus();
}

function genZehnerUebergang(number) {   //generiert eine zweite Zahl mit der number addiert einen Zehnerübergang erzeugt
    return (10 - (number % 10));
}

function checkSolution() {  //überprüft die Lösung
    if (solutionCorrect()) {
        solutionField.style.backgroundColor = 'green';
        newTaskBtn.focus();
        if (!game.solutionChecked) changeScoreBy(1);   //verhindert mehrfaches vergeben von Punkten pro Aufgabe
    }else{
        solutionField.style.backgroundColor = 'red';
        solutionField.focus();
        if (!game.solutionChecked) changeScoreBy(-1);  //verhindert mehrfaches abziehen von Punkten pro Aufgabe
    }
    game.solutionChecked = true;
}

function solutionCorrect() {
    return game.num1 + game.num2 === Number(solutionField.value);
}

function changeScoreBy(x) { //score um x ändern und auf dem Screen aktualisieren
    game.score += x;
    sessionStorage.setItem("score", game.score);
    scoreSpan.textContent = game.score;
}

function gameOver() {
    newTaskBtn.disabled = true;
    checkBtn.disabled = true;
    solutionField.disabled = true;

    if (game.highScore < game.score) {
        localStorage.setItem("highScore", game.score);
        game.highScore = game.score;
        //New Highscore (implement)
    }

    document.querySelector("#finalName").textContent = game.username; //Username und Spielscore anzeigen
    document.querySelector("#finalScore").textContent = game.score;
    document.querySelector("#highScore").textContent = game.highScore;

    location.hash = "#ende";    //auf gameOver Seite wechseln
}

function startGame() {
    game.score = 0;
    location.hash = "#spiel";

    newTaskBtn.disabled = false;
    checkBtn.disabled = false;
    solutionField.disabled = false;

    nameSpan.textContent = game.username;
    genNewTask();
    startTimer();
}

function startTimer() {
    clearInterval(game.timer);
    let timeLeft = 60;
    timeSpan.textContent = timeLeft;

    game.timer = setInterval(() => {   //Sekundenweise Zeit ausgeben
       timeLeft--;
       timeSpan.textContent = timeLeft;
       
       if(timeLeft==0) {    //wenn Timer 0 erreicht clearen und Spiel beenden
        clearInterval(game.timer);
        gameOver();
       }
    }, 1000);
}

function renderPage(){  //routing
    if (!location.hash) {
        location.hash = "#start";
    }

    let hash = location.hash;
    switch (hash) {
        case "#start":
            startPage.style.display = "block";
            gamePage.style.display = "none";
            gameOverPage.style.display = "none";
            break;
        case "#spiel":
            startPage.style.display = "none";
            gamePage.style.display = "block";
            gameOverPage.style.display = "none";
            nameSpan.textContent = localStorage.getItem("username") || "";
            scoreSpan.textContent = 0;
            break;
        case "#ende":
            startPage.style.display = "none";
            gamePage.style.display = "none";
            gameOverPage.style.display = "block";
            break;
        default:
            console.error(`Route "${hash}" existiert nicht`);   //Fehler ausgeben und auf Startseite wechseln
            location.hash = "#start";
            break;
    }
}

/*
    Event-Listener und Startcode
*/

window.addEventListener("hashchange", renderPage);
window.addEventListener("load", renderPage);

newTaskBtn.addEventListener("click", genNewTask);

form.addEventListener("submit", (event) => {
    event.preventDefault();
    checkSolution();
});   //verhindert das direkte löschen der antwort nach dem kontrollieren/abgeben

startBtn.addEventListener("click", () => {
    game.username = String(nameInput.value.trim()) || "Anonym";
    localStorage.setItem("username", game.username);
    location.hash = "#spiel";
    genNewTask();   //erste Aufgabe generieren
    startTimer();
}); //bei Start den Username speichern

restartBtn.addEventListener("click", startGame);