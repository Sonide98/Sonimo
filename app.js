let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');

// Audio context and oscillator variables
let audioContext;
let oscillator;
let gainNode;

// Initialize audio on button click (to comply with browser autoplay policies)
startButton.addEventListener('click', () => {
    // Initialize audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.setValueAtTime(0, audioContext.currentTime); // Start with volume 0
    oscillator.start();
    startButton.disabled = true;
    startButton.textContent = 'Audio Running';
});

// Initialize camera with front camera
navigator.mediaDevices.getUserMedia({
    video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
    }
})
.then(function(stream) {
    video.srcObject = stream;
    video.play();
})
.catch(function(err) {
    console.error("Error accessing camera: ", err);
});

// Initialize MediaPipe Pose
const pose = new window.Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

// Updated function to use full body movement
function updateSoundBasedOnPose(landmarks) {
    if (!audioContext || !landmarks || landmarks.length === 0) return;

    // Use hip points for height reference
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    if (leftHip && rightHip && leftAnkle && rightAnkle) {
        // Calculate overall body height (distance from hips to ankles)
        const leftHeight = Math.abs(leftAnkle.y - leftHip.y);
        const rightHeight = Math.abs(rightAnkle.y - rightHip.y);
        const avgHeight = (leftHeight + rightHeight) / 2;

        // Calculate lateral movement using hip positions
        const hipMovement = Math.abs(leftHip.x - rightHip.x);

        // Map vertical position to frequency (200-800 Hz - lower range)
        let frequency = 200 + (avgHeight * 600);
        
        // Map lateral movement to volume (with reduced sensitivity)
        let volume = Math.min(0.3, hipMovement * 0.5);

        // Smooth the audio changes
        oscillator.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.1);
        gainNode.gain.setTargetAtTime(volume, audioContext.currentTime, 0.1);
    }
}

// Update the onResults function to draw connections between points
function onResults(results) {
    if (!canvas.width || !canvas.height) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
        // Draw landmarks and connections
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS,
            {color: '#00FF00', lineWidth: 2});
        results.poseLandmarks.forEach((point) => {
            if (point.visibility > 0.5) {
                ctx.beginPath();
                ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, 2 * Math.PI);
                ctx.fillStyle = "red";
                ctx.fill();
            }
        });

        updateSoundBasedOnPose(results.poseLandmarks);
    }
}

// Set up pose detection
pose.onResults(onResults);

// Create camera object
const camera = new window.Camera(video, {
    onFrame: async () => {
        await pose.send({image: video});
    },
    width: 640,
    height: 480
});

camera.start();

