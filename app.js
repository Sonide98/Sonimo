let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');

// Vraag toegang tot de camera (werkt zowel voor desktop als mobiel)
navigator.mediaDevices.getUserMedia({ video: true })
  .then(function (stream) {
    video.srcObject = stream;
  }).catch(function (err) {
    console.error("Error accessing webcam/camera: " + err);
  });

// Web Audio API voor geluid genereren
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let oscillator = audioContext.createOscillator();
let gainNode = audioContext.createGain();

// Verbind oscillator en gain
oscillator.connect(gainNode);
gainNode.connect(audioContext.destination);

// Start de oscillator (een eenvoudige toon)
oscillator.start();

// Functie om geluid te wijzigen op basis van beweging
function updateSoundBasedOnMotion(motionMat) {
  let nonZeroCount = cv.countNonZero(motionMat); // Aantal witte pixels in de beweging
  let frequency = Math.min(500 + (nonZeroCount / 100), 2000);  // Frequentie gebaseerd op de hoeveelheid beweging
  let volume = Math.min(nonZeroCount / 1000, 1); // Volume afhankelijk van beweging

  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
}

// Start motion tracking
function startTracking() {
  let mat = cv.imread(video);  // Converteer video-frame naar OpenCV matrix
  let gray = new cv.Mat();
  let motion = new cv.Mat();
  
  // Zet het beeld om naar grijswaarden
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  
  // Bereken het verschil tussen frames voor beweging
  cv.absdiff(gray, prevGray, motion);
  
  // Detecteer beweging (drempelwaarde voor beweging)
  cv.threshold(motion, motion, 25, 255, cv.THRESH_BINARY);
  
  // Teken het resultaat
  cv.imshow('canvasOutput', motion);
  
  // Update vorige frame
  prevGray = gray.clone();
  
  // Update geluid op basis van beweging
  updateSoundBasedOnMotion(motion);
  
  // Vraag de functie opnieuw aan
  requestAnimationFrame(startTracking);
}

// Initialiseer variabelen en start tracking
let prevGray = new cv.Mat();
startTracking();
