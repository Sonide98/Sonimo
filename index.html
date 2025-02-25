let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');

// Simplified audio variables
let audioContext;
let oscillator;
let gainNode;

// Initialize camera with simpler settings
navigator.mediaDevices.getUserMedia({
    video: {
        facingMode: { exact: "environment" },
        width: { ideal: 720 },
        height: { ideal: 1280 }
    }
})
.then(function(stream) {
    video.srcObject = stream;
    video.play();
})
.catch(function(err) {
    console.error("Camera error:", err);
});

// Initialize MediaPipe Pose with simpler settings
const pose = new window.Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 0,  // Reduced complexity
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Simplified sound creation
function createSound() {
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    
    oscillator.type = 'triangle';
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    oscillator.start();
}

// Simplified sound trigger
function triggerSound(frequency = 200, volume = 0.3) {
    if (!audioContext) return;
    
    const now = audioContext.currentTime;
    oscillator.frequency.setValueAtTime(frequency, now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
}

// Simplified motion detection
function detectMotion(landmarks) {
    if (!landmarks || landmarks.length === 0) return false;
    
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    return (leftAnkle.y > 0.7 || rightAnkle.y > 0.7) && 
           (leftAnkle.visibility > 0.5 || rightAnkle.visibility > 0.5);
}

// Process results
function onResults(results) {
    // Draw video
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
        // Draw landmarks
        results.poseLandmarks.forEach((point) => {
            if (point.visibility > 0.5) {
                ctx.beginPath();
                ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, 2 * Math.PI);
                ctx.fillStyle = "red";
                ctx.fill();
            }
        });

        // Trigger sound if motion detected
        if (detectMotion(results.poseLandmarks)) {
            triggerSound(200, 0.3);
        }
    }
}

// Set up pose detection
pose.onResults(onResults);

// Initialize camera
const camera = new window.Camera(video, {
    onFrame: async () => {
        await pose.send({image: video});
    },
    width: 720,
    height: 1280
});

camera.start();

// Simplified audio initialization
startButton.addEventListener('click', () => {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        createSound();
        startButton.disabled = true;
        startButton.textContent = 'Audio Running';
    } catch (error) {
        console.error('Audio initialization failed:', error);
        startButton.textContent = 'Start Audio';
        startButton.disabled = false;
    }
});

