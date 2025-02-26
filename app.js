let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');
let statusDiv = document.getElementById('status');

// Track last positions for movement detection
let lastPositions = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 };

// Audio files setup
const audioFiles = {
    legs: new Audio('./sounds/Kick.wav'),
    arms: new Audio('./sounds/Clap.wav')
};

// Test audio file paths on load
window.addEventListener('load', () => {
    fetch('./sounds/Kick.wav')
        .then(response => {
            if (!response.ok) throw new Error('Kick.wav not found');
            console.log('Kick.wav found');
        })
        .catch(error => console.error('Audio file error:', error));

    fetch('./sounds/Clap.wav')
        .then(response => {
            if (!response.ok) throw new Error('Clap.wav not found');
            console.log('Clap.wav found');
        })
        .catch(error => console.error('Audio file error:', error));
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
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Initialize camera
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                height: { min: 480, ideal: 720, max: 1080 },
                width: { min: 640, ideal: 1280, max: 1920 }
            }
        });

        video.srcObject = stream;
        video.setAttribute('playsinline', true);
        
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play().then(resolve);
            };
        });

        canvas.width = 1280;
        canvas.height = 720;

        const camera = new window.Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            },
            width: 1280,
            height: 720
        });

        camera.start();
        statusDiv.textContent = 'Camera ready';

    } catch (err) {
        console.error("Camera error:", err);
        statusDiv.textContent = 'Camera failed - please refresh and allow camera access';
    }
}

// Update the audio initialization function
async function initializeAudio() {
    try {
        console.log('Starting audio initialization...');
        
        // Check if files exist first with updated paths
        const kickResponse = await fetch('./sounds/Kick.wav');
        const clapResponse = await fetch('./sounds/Clap.wav');
        
        if (!kickResponse.ok) {
            throw new Error(`Kick.wav not found (${kickResponse.status})`);
        }
        if (!clapResponse.ok) {
            throw new Error(`Clap.wav not found (${clapResponse.status})`);
        }
        
        console.log('Audio files found, loading...');

        // Pre-load and test both audio files
        for (const [key, audio] of Object.entries(audioFiles)) {
            console.log(`Loading ${key} audio...`);
            audio.volume = 0.8;
            try {
                await audio.play();
                audio.pause();
                audio.currentTime = 0;
                console.log(`${key} audio loaded and tested successfully`);
            } catch (e) {
                throw new Error(`Failed to load ${key} audio: ${e.message}`);
            }
        }
        
        statusDiv.textContent = 'Audio ready - try moving!';
        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        statusDiv.textContent = `Audio failed: ${error.message}`;
        return false;
    }
}

// Improved sound playback
function playSound(soundType, velocity) {
    const audio = audioFiles[soundType];
    if (!audio) return;

    try {
        // Clone the audio for overlapping sounds
        const sound = audio.cloneNode();
        sound.volume = Math.min(1.0, velocity * 5); // Increased volume multiplier
        sound.play().catch(e => console.error('Play error:', e));
    } catch (error) {
        console.error('Playback error:', error);
    }
}

// Motion detection with increased sensitivity
function detectMotions(landmarks) {
    if (!landmarks || landmarks.length === 0) return {
        leftLeg: { moving: false, velocity: 0 },
        rightLeg: { moving: false, velocity: 0 },
        leftArm: { moving: false, velocity: 0 },
        rightArm: { moving: false, velocity: 0 }
    };

    const smoothingFactor = 0.6;    // Increased for more responsiveness
    const movementThreshold = 0.008; // Decreased for easier triggering
    const visibilityThreshold = 0.2; // Decreased for better detection

    function calculateMovement(point1, point2, lastPos, id) {
        if (!point1 || !point2 || point1.visibility < visibilityThreshold) return { moving: false, velocity: 0 };
        
        const currentPosY = Math.abs(point1.y - point2.y);
        const currentPosX = Math.abs(point1.x - point2.x);
        const movement = Math.sqrt(currentPosX * currentPosX + currentPosY * currentPosY);
        const velocity = Math.abs(movement - lastPos) * smoothingFactor;
        const moving = velocity > movementThreshold;
        
        return { moving, velocity: velocity * 1.5 }; // Increased velocity scaling
    }

    const result = {
        leftLeg: calculateMovement(landmarks[27], landmarks[25], lastPositions.leftLeg, 'leftLeg'),
        rightLeg: calculateMovement(landmarks[28], landmarks[26], lastPositions.rightLeg, 'rightLeg'),
        leftArm: calculateMovement(landmarks[15], landmarks[11], lastPositions.leftArm, 'leftArm'),
        rightArm: calculateMovement(landmarks[16], landmarks[12], lastPositions.rightArm, 'rightArm')
    };

    lastPositions = {
        leftLeg: Math.abs(landmarks[27].y - landmarks[25].y),
        rightLeg: Math.abs(landmarks[28].y - landmarks[26].y),
        leftArm: Math.abs(landmarks[15].y - landmarks[11].y),
        rightArm: Math.abs(landmarks[16].y - landmarks[12].y)
    };

    return result;
}

// Process results and trigger sounds
function onResults(results) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
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

        const motions = detectMotions(results.poseLandmarks);
        
        if (motions.leftLeg.moving || motions.rightLeg.moving) {
            const velocity = Math.max(motions.leftLeg.velocity, motions.rightLeg.velocity) * 1.2;
            playSound('legs', velocity);
        }
        
        if (motions.leftArm.moving || motions.rightArm.moving) {
            const velocity = Math.max(motions.leftArm.velocity, motions.rightArm.velocity) * 1.2;
            playSound('arms', velocity);
        }
    }
}

// Set up pose detection
pose.onResults(onResults);

// Initialize camera
initCamera();

// Audio initialization on button click
startButton.addEventListener('click', async () => {
    try {
        startButton.disabled = true;
        console.log('Initializing audio...');
        
        if (await initializeAudio()) {
            startButton.textContent = 'Audio Running';
            statusDiv.textContent = 'System ready - try moving!';
            console.log('Audio initialization successful');
        } else {
            throw new Error('Audio initialization failed');
        }
    } catch (error) {
        console.error('Error in button click:', error);
        startButton.disabled = false;
        startButton.textContent = 'Retry Audio';
        statusDiv.textContent = 'Audio failed - click to retry';
    }
});
