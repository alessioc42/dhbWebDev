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
const finalNameSpan = document.querySelector("#finalName");
const finalScoreSpan = document.querySelector("#finalScore");
const highScoreSpan = document.querySelector("#highScore");

const HIGHSCORE_KEY = "zehnerUebergang_highScore";
const USERNAME_KEY = "zehnerUebergang_userName";
const MAX_TIME = 60;

const successAudio = new Audio("./sounds/pling.mp3");
successAudio.preload = "auto";
successAudio.volume = 0.5;

const game = {
    num1: 0,
    num2: 0,
    timer: null,
    score: 0,
    solutionChecked: false,
    userName: String(localStorage.getItem(USERNAME_KEY)) || "",
    highScore: JSON.parse(localStorage.getItem(HIGHSCORE_KEY) || '{"score":0}').score
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
    game.solutionChecked = false;
}

function genZehnerUebergang(number) {   //generiert eine zweite Zahl mit der number addiert einen Zehnerübergang erzeugt
    return (10 - (number % 10));
}

function checkSolution() {
    if (solutionCorrect()) {
        game.score++;
        genNewTask();
        audio.volume = 0.5;
        audio.play();
    }else{
        solutionField.style.backgroundColor = "#fd4a4a91";
        if (!game.solutionChecked) game.score--;
        game.solutionChecked = true;
    }
    scoreSpan.textContent = game.score;
    solutionField.value = "";
    solutionField.focus();
}

function solutionCorrect() {
    return game.num1 + game.num2 === Number(solutionField.value);
}

function gameOver() {
    newTaskBtn.disabled = true;
    checkBtn.disabled = true;
    solutionField.disabled = true;
    let highScoreName = game.userName;

    if (game.highScore < game.score) {
        const highScorePair = {
            score: game.score,
            userName: game.userName
        };
        localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(highScorePair));
        game.highScore = game.score;
        //eventuell new Highscore Animation
    }else{
        highScoreName = JSON.parse(localStorage.getItem(HIGHSCORE_KEY)).userName;
    }
    finalNameSpan.textContent = game.userName; //Username und Scores anzeigen
    finalScoreSpan.textContent = game.score;
    highScoreSpan.textContent = game.highScore + " von " + highScoreName;

    location.hash = "#ende";    //auf gameOver Seite wechseln
}

function startGame() {
    game.score = 0;
    location.hash = "#spiel";

    newTaskBtn.disabled = false;
    checkBtn.disabled = false;
    solutionField.disabled = false;

    nameSpan.textContent = game.userName;
    genNewTask();
    startTimer();
}

function startTimer() {
    clearInterval(game.timer);
    let timeLeft = MAX_TIME;
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
            if (!localStorage.getItem(USERNAME_KEY)) {
                nameInput.focus();
            }else{
                nameInput.value = localStorage.getItem(USERNAME_KEY);
                startBtn.focus();
            }
            break;
        case "#spiel":
            startPage.style.display = "none";
            gamePage.style.display = "block";
            gameOverPage.style.display = "none";
            nameSpan.textContent = localStorage.getItem(USERNAME_KEY) || "";
            scoreSpan.textContent = 0;
            solutionInput.focus();
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

addEventListener("DOMContentLoaded", (event) => {   //erst wenn html geladen und skript ausgeführt wurde
    window.addEventListener("hashchange", renderPage);
    window.addEventListener("load", () => {
        renderPage,
        location.hash = "#start";
    });

    newTaskBtn.addEventListener("click", genNewTask);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        checkSolution();
    });   //verhindert das direkte löschen der antwort nach dem kontrollieren/abgeben

    startBtn.addEventListener("click", () => {
        game.userName = String(nameInput.value.trim()) || "Anonym";
        localStorage.setItem(USERNAME_KEY, game.userName);
        location.hash = "#spiel";
        genNewTask();   //erste Aufgabe generieren
        startTimer();
    }); //bei Start: Username speichern, routehash setzen, neue Aufgabe generieren und Timer starten

    restartBtn.addEventListener("click", startGame);
});