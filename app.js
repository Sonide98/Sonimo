let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');

// Vraag toegang tot de camera en gebruik de achtercamera op mobiel
navigator.mediaDevices.getUserMedia({
  video: { facingMode: { exact: "environment" } }  // Achtercamera op mobiel
})
  .then(function (stream) {
    video.srcObject = stream;
  }).catch(function (err) {
    console.error("Error accessing webcam/camera: " + err);
  });

// Laad het pose model van TensorFlow.js
let detector;
(async () => {
  detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet);
  detectPose();
})();

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
function updateSoundBasedOnPose(pose) {
  if (pose.keypoints && pose.keypoints.length > 0) {
    // Neem de positie van de rechterhand (index 10)
    const rightWrist = pose.keypoints.find(point => point.name === "rightWrist");
    
    if (rightWrist && rightWrist.score > 0.5) {
      // Stel de frequentie en het volume in op basis van de afstand van de rechterhand
      let frequency = 500 + rightWrist.position.y * 0.5;  // Stel de frequentie in op basis van de Y-positie van de hand
      let volume = Math.min(1, rightWrist.position.y / 300); // Stel het volume in op basis van de Y-positie van de hand

      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    }
  }
}

// Functie voor pose-detectie
async function detectPose() {
  const poses = await detector.estimatePoses(video);
  
  if (poses.length > 0) {
    const keypoints = poses[0].keypoints;
    
    // Teken de pose op het canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Teken de keypoints (lichamelijke posities) op het canvas
    keypoints.forEach(point => {
      if (point.score > 0.5) {
        ctx.beginPath();
        ctx.arc(point.position.x, point.position.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "red";
        ctx.fill();
      }
    });
    
    // Update geluid op basis van pose
    updateSoundBasedOnPose(poses[0]);
  }
  
  requestAnimationFrame(detectPose);
}
