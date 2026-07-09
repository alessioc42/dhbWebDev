const startPage = document.querySelector("#startPage"); //html Seiten
const gamePage = document.querySelector("#gamePage");
const gameOverPage = document.querySelector("#gameOverPage");

const nameInput = document.querySelector("#nameInput"); //Startseitenelemente
const startBtn = document.querySelector("#startBtn");

const nameSpan = document.querySelector("#nameSpan");   //Scoreboardelemente
const scoreSpan = document.querySelector("#pointsSpan");

const newTaskBtn = document.querySelector("#newTaskBtn");   //Aufgaben-/Formularelemente
const checkBtn = document.querySelector("#checkBtn");
const num1Span = document.querySelector("#num1Span");
const num2Span = document.querySelector("#num2Span");
const solutionField = document.querySelector("#solutionInput");
const form = document.querySelector("#form");

const restartBtn = document.querySelector("#restartBtn");

let num1, num2, gameTimer, score = 0, solutionChecked = false; //Variablen und Daten
let username = String(localStorage.getItem("username")) || "";
let highScore = Number(localStorage.getItem("highScore")) || 0;

/*
    Funktionen
*/

function genNewTask() { //generiert neue Zahlen und zeigt diese an
    solutionChecked = false;    //wichtig für checkSolution()
    num1 = Math.floor(Math.random()*100)+1;
    num2 = Math.floor(Math.random()*(10 - genZehnerUebergang(num1) + 1)) + genZehnerUebergang(num1);

    num1Span.textContent = num1;
    num2Span.textContent = num2;

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
        !solutionChecked ? changeScoreBy(1) : null; //verhindert mehrfaches vergeben von Punkten pro Aufgabe
    }else{
        solutionField.style.backgroundColor = 'red';
        solutionField.focus();
        !solutionChecked ? changeScoreBy(-1) : null;  //verhindert mehrfaches abziehen von Punkten pro Aufgabe
    }
    solutionChecked = true;
}

function solutionCorrect() {
    return Number(num1) + Number(num2) == solutionField.value;
}

function changeScoreBy(x) { //score um x ändern und auf dem Screen aktualisieren
    score = score+x;
    sessionStorage.setItem("score", score);
    scoreSpan.textContent = score;
}

function gameOver() {
    newTaskBtn.disabled = true;
    checkBtn.disabled = true;
    solutionField.disabled = true;

    if (highScore < score) {
        localStorage.setItem("highScore", score);
        highScore = score;
        //New Highscore (implement)
    }

    document.querySelector("#finalName").textContent = username; //Username und Spielscore anzeigen
    document.querySelector("#finalScore").textContent = score;
    document.querySelector("#highScore").textContent = highScore;

    location.hash = "#ende";    //auf gameOver Seite wechseln
}

function startGame() {
    score = 0;
    location.hash = "#spiel";

    newTaskBtn.disabled = false;
    checkBtn.disabled = false;
    solutionField.disabled = false;

    nameSpan.textContent = username;
    genNewTask();
    startTimer();
}

function startTimer() {
    clearTimeout(gameTimer);
    gameTimer = setTimeout(gameOver,60000);
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
    username = String(nameInput.value.trim()) || "Anonym";
    localStorage.setItem("username", username);
    location.hash = "#spiel";
    genNewTask();   //erste Aufgabe generieren
    startTimer();
}); //bei Start den Username speichern

restartBtn.addEventListener("click", startGame);