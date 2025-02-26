let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');
let statusDiv = document.getElementById('status');

// Audio variables
let audioContext;
let oscillator;
let gainNode;
let compressor;
let lastPositions = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 };
let isAudioInitialized = false;

// Simplified audio files (near the top of your file)
const audioFiles = {
    legs: new Audio('sounds/kick.wav'),
    arms: new Audio('sounds/clap.wav')
};

// Initialize MediaPipe Pose
const pose = new window.Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Initialize camera - simplified version
async function initCamera() {
    try {
        // First try to get camera permission
        await navigator.mediaDevices.getUserMedia({ video: true });
        
        // Then try to get the back camera
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                height: { min: 480, ideal: 720, max: 1080 },
                width: { min: 640, ideal: 1280, max: 1920 }
            }
        });

        // Set up video element
        video.srcObject = stream;
        video.setAttribute('playsinline', true); // important for iOS
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play().then(resolve);
            };
        });

        // Set up canvas with fixed dimensions
        canvas.width = 1280;
        canvas.height = 720;

        // Set up MediaPipe camera
        const camera = new window.Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            },
            width: 1280,
            height: 720
        });

        // Start camera
        camera.start();
        statusDiv.textContent = 'Camera ready';

    } catch (err) {
        console.error("Camera error:", err);
        statusDiv.textContent = 'Camera failed - please refresh and allow camera access';
    }
}

// Improved audio initialization
function initializeAudio() {
    try {
        // Pre-load the audio files
        audioFiles.legs.load();
        audioFiles.arms.load();
        
        // Set initial volumes
        audioFiles.legs.volume = 0.8;
        audioFiles.arms.volume = 0.8;
        
        statusDiv.textContent = 'Audio system ready';
        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        statusDiv.textContent = 'Audio initialization failed';
        return false;
    }
}

// New function to play audio files with velocity-based volume
function playSound(soundType, velocity) {
    const audio = audioFiles[soundType];
    if (!audio) return;

    // Set volume based on movement velocity
    audio.volume = Math.min(1.0, velocity * 3); // Increased multiplier for better response
    
    // Reset audio to start if it's already playing
    audio.currentTime = 0;
    
    // Play the sound
    audio.play().catch(e => console.log('Audio play error:', e));
}

// Adjust motion detection to be more sensitive
function detectMotions(landmarks) {
    if (!landmarks || landmarks.length === 0) return {
        leftLeg: { moving: false, velocity: 0 },
        rightLeg: { moving: false, velocity: 0 },
        leftArm: { moving: false, velocity: 0 },
        rightArm: { moving: false, velocity: 0 }
    };

    const smoothingFactor = 0.4; // Increased from 0.3
    const movementThreshold = 0.015; // Reduced from 0.03
    const visibilityThreshold = 0.5; // Reduced from 0.6

    function calculateMovement(point1, point2, lastPos, id) {
        if (!point1 || !point2 || point1.visibility < visibilityThreshold) return { moving: false, velocity: 0 };
        
        // Calculate movement based on both X and Y coordinates for better detection
        const currentPosY = Math.abs(point1.y - point2.y);
        const currentPosX = Math.abs(point1.x - point2.x);
        const movement = Math.sqrt(currentPosX * currentPosX + currentPosY * currentPosY);
        const velocity = Math.abs(movement - lastPos) * smoothingFactor;
        const moving = velocity > movementThreshold;
        
        return { moving, velocity };
    }

    const result = {
        leftLeg: calculateMovement(landmarks[27], landmarks[25], lastPositions.leftLeg, 'leftLeg'),
        rightLeg: calculateMovement(landmarks[28], landmarks[26], lastPositions.rightLeg, 'rightLeg'),
        leftArm: calculateMovement(landmarks[15], landmarks[11], lastPositions.leftArm, 'leftArm'),
        rightArm: calculateMovement(landmarks[16], landmarks[12], lastPositions.rightArm, 'rightArm')
    };

    // Update last positions
    lastPositions = {
        leftLeg: Math.abs(landmarks[27].y - landmarks[25].y),
        rightLeg: Math.abs(landmarks[28].y - landmarks[26].y),
        leftArm: Math.abs(landmarks[15].y - landmarks[11].y),
        rightArm: Math.abs(landmarks[16].y - landmarks[12].y)
    };

    return result;
}

// Update the results processing to use audio files
function onResults(results) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
        // Draw skeleton
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS,
            {color: '#00FF00', lineWidth: 2});
            
        // Draw landmarks
        results.poseLandmarks.forEach((point) => {
            if (point.visibility > 0.5) {
                ctx.beginPath();
                ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, 2 * Math.PI);
                ctx.fillStyle = "red";
                ctx.fill();
            }
        });

        // Process motion and trigger sounds
        const motions = detectMotions(results.poseLandmarks);
        
        // Combine leg movements
        if (motions.leftLeg.moving || motions.rightLeg.moving) {
            const velocity = Math.max(motions.leftLeg.velocity, motions.rightLeg.velocity);
            playSound('legs', velocity);
        }
        
        // Combine arm movements
        if (motions.leftArm.moving || motions.rightArm.moving) {
            const velocity = Math.max(motions.leftArm.velocity, motions.rightArm.velocity);
            playSound('arms', velocity);
        }
    }
}

// Set up pose detection
pose.onResults(onResults);

// Initialize everything
initCamera();

// Audio initialization on button click
startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    if (await initializeAudio()) {
        startButton.textContent = 'Audio Running';
        statusDiv.textContent = 'System ready';
    } else {
        startButton.disabled = false;
        startButton.textContent = 'Start Audio';
    }
});

