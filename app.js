let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');

// Audio context and oscillator variables
let audioContext;
let oscillator;
let gainNode;

// Initialize camera with back camera
navigator.mediaDevices.getUserMedia({
    video: {
        facingMode: { exact: "environment" }, // This will force the back camera
        width: { ideal: 640 },
        height: { ideal: 480 }
    }
})
.then(function(stream) {
    video.srcObject = stream;
    video.play();
})
.catch(function(err) {
    console.error("Error accessing back camera: ", err);
    // Fallback to any available camera
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(function(stream) {
            video.srcObject = stream;
            video.play();
        });
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

// Create multiple oscillators for different sounds
function createOscillator(type, frequency) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    return { oscillator: osc, gainNode: gain };
}

// Initialize audio on button click with multiple oscillators
startButton.addEventListener('click', () => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create different oscillators for different leg movements
    leftLegOsc = createOscillator('sine', 220);  // A3 note
    rightLegOsc = createOscillator('sine', 277.18);  // C#4 note
    
    leftLegOsc.oscillator.start();
    rightLegOsc.oscillator.start();
    
    startButton.disabled = true;
    startButton.textContent = 'Audio Running';
});

// Updated function to create rhythmic sounds from leg movement
function updateSoundBasedOnPose(landmarks) {
    if (!audioContext || !landmarks || landmarks.length === 0) return;

    // Leg points
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    if (leftHip && leftKnee && leftAnkle && rightHip && rightKnee && rightAnkle) {
        // Calculate leg movements
        const leftLegMovement = Math.abs(leftAnkle.y - leftKnee.y) / Math.abs(leftKnee.y - leftHip.y);
        const rightLegMovement = Math.abs(rightAnkle.y - rightKnee.y) / Math.abs(rightKnee.y - rightHip.y);

        // Threshold for triggering sounds
        const threshold = 1.2; // Adjust this value to change sensitivity

        // Left leg sound
        if (leftLegMovement > threshold) {
            // Play a short note
            leftLegOsc.gainNode.gain.setTargetAtTime(0.3, audioContext.currentTime, 0.01);
            leftLegOsc.gainNode.gain.setTargetAtTime(0, audioContext.currentTime + 0.1, 0.05);
        }

        // Right leg sound
        if (rightLegMovement > threshold) {
            // Play a short note
            rightLegOsc.gainNode.gain.setTargetAtTime(0.3, audioContext.currentTime, 0.01);
            rightLegOsc.gainNode.gain.setTargetAtTime(0, audioContext.currentTime + 0.1, 0.05);
        }

        // Update frequencies based on leg position
        const leftFreq = 220 + (leftLegMovement * 50);  // Base A3 note
        const rightFreq = 277.18 + (rightLegMovement * 50);  // Base C#4 note
        
        leftLegOsc.oscillator.frequency.setTargetAtTime(leftFreq, audioContext.currentTime, 0.1);
        rightLegOsc.oscillator.frequency.setTargetAtTime(rightFreq, audioContext.currentTime, 0.1);
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

