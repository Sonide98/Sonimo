let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');
let statusDiv = document.getElementById('status');

// Track last positions for movement detection
let lastPositions = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 };

// Audio files setup
const audioFiles = {
    legs: null,  // Initialize as null
    arms: null   // Initialize as null
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

// Add this function to load audio files
async function loadAudioFiles() {
    try {
        // Create and load audio elements
        audioFiles.legs = new Audio();
        audioFiles.arms = new Audio();

        // Set the sources using the full GitHub Pages URL structure
        const repoPath = window.location.pathname.split('/')[1];  // Gets repository name
        const basePath = repoPath ? `/${repoPath}` : '';
        
        audioFiles.legs.src = `${basePath}/sounds/Kick.wav`;
        audioFiles.arms.src = `${basePath}/sounds/Clap.wav`;

        // Wait for both files to load
        await Promise.all([
            new Promise((resolve, reject) => {
                audioFiles.legs.addEventListener('canplaythrough', resolve);
                audioFiles.legs.addEventListener('error', reject);
            }),
            new Promise((resolve, reject) => {
                audioFiles.arms.addEventListener('canplaythrough', resolve);
                audioFiles.arms.addEventListener('error', reject);
            })
        ]);

        console.log('Audio files loaded successfully');
        return true;
    } catch (error) {
        console.error('Failed to load audio files:', error);
        return false;
    }
}

// Update the playSound function
function playSound(soundType, velocity) {
    const audio = audioFiles[soundType];
    if (!audio) {
        console.error('Audio not found for:', soundType);
        return;
    }

    try {
        // Create a new audio context on first play (needed for Safari)
        if (!window.audioContext) {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Use a simpler playback method without cloning
        if (audio.paused || audio.ended) {
            audio.volume = Math.min(1.0, velocity * 5);
            audio.currentTime = 0;
            const playPromise = audio.play();
            
            if (playPromise) {
                playPromise.catch(error => {
                    if (error.name !== 'NotAllowedError') {
                        console.error('Play error:', error);
                    }
                });
            }
        }
    } catch (error) {
        console.error('Playback error:', error);
    }
}

// Update the initializeAudio function
async function initializeAudio() {
    try {
        console.log('Starting audio initialization...');
        
        // Create audio context first (needed for Safari)
        window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Load the audio files
        if (!await loadAudioFiles()) {
            throw new Error('Failed to load audio files');
        }

        // Set initial volumes
        audioFiles.legs.volume = 0.8;
        audioFiles.arms.volume = 0.8;

        // For iOS, we need a user gesture to start audio
        await window.audioContext.resume();

        console.log('Audio system initialized successfully');
        statusDiv.textContent = 'Audio ready - try moving!';
        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        statusDiv.textContent = 'Audio failed - check console';
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

// Audio initialization on button click
startButton.addEventListener('click', async () => {
    try {
        startButton.disabled = true;
        console.log('Initializing audio...');
        
        // Resume audio context on click (needed for Safari/iOS)
        if (window.audioContext) {
            await window.audioContext.resume();
        }
        
        if (await initializeAudio()) {
            startButton.textContent = 'Audio Running';
            statusDiv.textContent = 'System ready - try moving!';
            console.log('Audio initialization successful');
            
            // Play a silent sound to unlock audio on iOS
            const silentSound = new Audio("data:audio/mp3;base64,//MkxAAHiAICWABElBeKPL/RANb2w+yiT1g/gTok//lP/W/l3h8QO/OCdCqCW2Cw//MkxAQHkAIWUAhEmAQXWUOFW2dxPu//9mr60ElY5sseQ+xxesmHKtZr7bsqqX2L//MkxAgFwAYiQAhEAC2hq22d3///9FTV6tA36JdgBJoOGgc+7qvqej5Zu7/7uI9l//MkxBQHAAYi8AhEAO193vt9KGOq+6qcT7hhfN5FTInmwk8RkqKImTM55pRQHQSq//MkxBsGkgoIAABHhTACIJLf99nVI///yuW1uBqWfEu7CgNPWGpUadBmZ////4sL//MkxCMHMAH9iABEmAsKioqKigsLCwtVTEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVV//MkxCkECAUYCAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV");
            silentSound.play().catch(() => {});
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
