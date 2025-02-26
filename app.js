let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');
let statusDiv = document.getElementById('status');

// Track last positions for movement detection
let lastPositions = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 };

// Audio files setup
const audioFiles = {
    legs: null,
    arms: null
};

let audioContext = null;
let oscillator = null;
let gainNode = null;

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

// Update the loadAudioFiles function
async function loadAudioFiles() {
    try {
        // Create audio elements
        audioFiles.legs = new Audio();
        audioFiles.arms = new Audio();

        // Set sources with absolute paths
        const fullPath = window.location.href.split('index.html')[0];
        audioFiles.legs.src = `${fullPath}sounds/Kick.wav`;
        audioFiles.arms.src = `${fullPath}sounds/Clap.wav`;

        // Preload the audio
        audioFiles.legs.preload = 'auto';
        audioFiles.arms.preload = 'auto';

        await Promise.all([
            new Promise((resolve) => {
                audioFiles.legs.addEventListener('canplaythrough', resolve, { once: true });
                audioFiles.legs.load();
            }),
            new Promise((resolve) => {
                audioFiles.arms.addEventListener('canplaythrough', resolve, { once: true });
                audioFiles.arms.load();
            })
        ]);

        return true;
    } catch (error) {
        console.error('Failed to load audio files:', error);
        return false;
    }
}

// Add this function to load audio buffers
async function loadAudioBuffers() {
    try {
        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Fetch and decode audio files
        const [kickResponse, clapResponse] = await Promise.all([
            fetch('./sounds/Kick.wav'),
            fetch('./sounds/Clap.wav')
        ]);

        const [kickData, clapData] = await Promise.all([
            kickResponse.arrayBuffer(),
            clapResponse.arrayBuffer()
        ]);

        [kickBuffer, clapBuffer] = await Promise.all([
            audioContext.decodeAudioData(kickData),
            audioContext.decodeAudioData(clapData)
        ]);

        return true;
    } catch (error) {
        console.error('Error loading audio:', error);
        return false;
    }
}

// Update the playSound function
function playSound(soundType, velocity) {
    if (!audioContext || !oscillator || !gainNode) return;

    const now = audioContext.currentTime;
    const frequency = soundType === 'legs' ? 200 : 400; // Different frequencies for legs/arms

    oscillator.frequency.setValueAtTime(frequency, now);
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(velocity * 0.5, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
}

// Update the initializeAudio function
async function initializeAudio() {
    try {
        if (!await loadAudioBuffers()) {
            throw new Error('Failed to load audio buffers');
        }

        // Resume audio context
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        console.log('Audio system initialized');
        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        return false;
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

// Update the button click handler
startButton.addEventListener('click', async () => {
    try {
        startButton.disabled = true;
        
        if (await initializeAudio()) {
            startButton.textContent = 'Audio Running';
            statusDiv.textContent = 'System ready - try moving!';
        } else {
            throw new Error('Audio initialization failed');
        }
    } catch (error) {
        console.error('Error initializing audio:', error);
        startButton.disabled = false;
        startButton.textContent = 'Retry Audio';
        statusDiv.textContent = 'Audio failed - tap to retry';
    }
});
