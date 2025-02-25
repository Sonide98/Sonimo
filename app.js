let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');

// Audio context and oscillator variables
let audioContext;
let oscillator;
let gainNode;

// Declare variables for oscillators
let leftLegOsc, rightLegOsc;
let lastLeftStep = false;
let lastRightStep = false;

// Initialize camera with back camera (forcing environment camera)
navigator.mediaDevices.getUserMedia({
    video: {
        facingMode: { exact: "environment" }, // Force back camera
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
    // Fallback to any available camera if back camera fails
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            width: { ideal: 640 },
            height: { ideal: 480 }
        } 
    })
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

// Create percussion sound
function createPercussionSound() {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    filter.type = 'bandpass';
    filter.frequency.value = 200;
    filter.Q.value = 1;
    
    osc.type = 'triangle';
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    
    return { oscillator: osc, gainNode: gain };
}

// Play a percussion hit
function playPercussion(gainNode, frequency) {
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);
}

// Initialize audio on button click
startButton.addEventListener('click', () => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create percussion sounds for each leg
    leftLegOsc = createPercussionSound();
    rightLegOsc = createPercussionSound();
    
    leftLegOsc.oscillator.frequency.setValueAtTime(200, audioContext.currentTime);  // Lower drum sound
    rightLegOsc.oscillator.frequency.setValueAtTime(300, audioContext.currentTime); // Higher drum sound
    
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
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];

    if (leftAnkle && rightAnkle && leftKnee && rightKnee && leftHip && rightHip) {
        // Calculate relative positions
        const leftLegExtension = (leftAnkle.y - leftHip.y) / (leftKnee.y - leftHip.y);
        const rightLegExtension = (rightAnkle.y - rightHip.y) / (rightKnee.y - rightHip.y);

        // Detect stepping motion with more sensitive thresholds
        const leftStep = leftLegExtension > 1.05 && leftAnkle.visibility > 0.5;
        const rightStep = rightLegExtension > 1.05 && rightAnkle.visibility > 0.5;

        // Trigger sounds only on step transitions
        if (leftStep !== lastLeftStep && leftStep) {
            playPercussion(leftLegOsc.gainNode, 200);
        }
        if (rightStep !== lastRightStep && rightStep) {
            playPercussion(rightLegOsc.gainNode, 300);
        }

        // Update step states
        lastLeftStep = leftStep;
        lastRightStep = rightStep;
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

