let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');

// Vraag toegang tot de camera en gebruik de achtercamera op mobiel
navigator.mediaDevices.getUserMedia({
  video: { facingMode: { exact: "environment" } }  // Achtercamera op mobiel
})
  .then(function (stream) {
    video.srcObject = stream;
    
    // Wacht totdat de video geladen is en stel de canvas afmetingen in
    video.onloadedmetadata = function () {
      // Stel de canvas afmetingen in op de video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
  }).catch(function (err) {
    console.error("Error accessing webcam/camera: " + err);
  });

// Laad MediaPipe Pose
const pose = new window.mediapipe.pose.Pose({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.3/${file}`;
  }
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: true,
  smoothSegmentation: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

// Audio context voor geluid genereren
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let oscillator = audioContext.createOscillator();
let gainNode = audioContext.createGain();

oscillator.connect(gainNode);
gainNode.connect(audioContext.destination);
oscillator.start();

// Functie om geluid te wijzigen op basis van lichaamsbeweging
function updateSoundBasedOnPose(landmarks) {
  if (landmarks && landmarks.length > 0) {
    const nose = landmarks[0]; // We gebruiken de neus als referentiepunt (of kies een ander belangrijk punt)
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    // Stel de frequentie in op basis van de y-positie van de neus
    let frequency = 500 + nose.y * 0.5;
    let volume = Math.min(1, Math.abs(leftShoulder.y - rightShoulder.y) / 300); // Volume aanpassen op basis van schouderbeweging

    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  }
}

// Verwerken van de pose
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  // Teken de keypoints (lichamelijke posities) op het canvas
  if (results.poseLandmarks) {
    results.poseLandmarks.forEach((point) => {
      if (point.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "red";
        ctx.fill();
      }
    });

    // Update het geluid op basis van de lichaamsbewegingen
    updateSoundBasedOnPose(results.poseLandmarks);
  }
}

// Start de pose-detectie
pose.onResults(onResults);

// Start de detectie in een loop
async function detectPose() {
  await pose.send({image: video});
  requestAnimationFrame(detectPose);
}

detectPose();  // Start detecteren

