let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');
let statusDiv = document.getElementById('status');

// Track last positions for movement detection
let lastPositions = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 };

// Audio setup
let audioContext = null;
let oscillator = null;
let gainNode = null;

// Initialize MediaPipe Pose
const pose = new window.Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

// Configure pose detection
pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Camera initialization
async function initCamera() {
    try {
        // Request camera access with more specific constraints
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        video.srcObject = stream;
        video.play();

        // Adjust canvas size based on video dimensions
        const videoAspectRatio = 16/9;
        const containerWidth = canvas.parentElement.clientWidth;
        const containerHeight = containerWidth * videoAspectRatio;
        
        canvas.width = containerWidth;
        canvas.height = containerHeight;

        // Initialize MediaPipe camera with correct dimensions
        const camera = new window.Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            },
            width: containerWidth,
            height: containerHeight
        });

        camera.start();
        statusDiv.textContent = 'Camera ready - click Start Audio';
        startButton.disabled = false;

    } catch (err) {
        console.error("Camera error:", err);
        statusDiv.textContent = 'Camera failed - please refresh and allow camera access';
    }
}

// Audio initialization
function initializeAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        oscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        gainNode.gain.value = 0;
        oscillator.start();

        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        return false;
    }
}

// Sound generation
function playSound(soundType, velocity) {
    if (!audioContext || !oscillator || !gainNode) return;

    const now = audioContext.currentTime;
    const frequency = soundType === 'legs' ? 200 : 400;

    oscillator.frequency.setValueAtTime(frequency, now);
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(velocity * 0.5, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
}

// Motion detection
function detectMotions(landmarks) {
    if (!landmarks || landmarks.length === 0) return {
        leftLeg: { moving: false, velocity: 0 },
        rightLeg: { moving: false, velocity: 0 },
        leftArm: { moving: false, velocity: 0 },
        rightArm: { moving: false, velocity: 0 }
    };

    const smoothingFactor = 0.6;
    const movementThreshold = 0.008;
    const visibilityThreshold = 0.2;

    function calculateMovement(point1, point2, lastPos) {
        if (!point1 || !point2 || point1.visibility < visibilityThreshold) {
            return { moving: false, velocity: 0 };
        }
        
        const currentPosY = Math.abs(point1.y - point2.y);
        const currentPosX = Math.abs(point1.x - point2.x);
        const movement = Math.sqrt(currentPosX * currentPosX + currentPosY * currentPosY);
        const velocity = Math.abs(movement - lastPos) * smoothingFactor;
        
        return { 
            moving: velocity > movementThreshold,
            velocity: velocity * 1.5
        };
    }

    const result = {
        leftLeg: calculateMovement(landmarks[27], landmarks[25], lastPositions.leftLeg),
        rightLeg: calculateMovement(landmarks[28], landmarks[26], lastPositions.rightLeg),
        leftArm: calculateMovement(landmarks[15], landmarks[11], lastPositions.leftArm),
        rightArm: calculateMovement(landmarks[16], landmarks[12], lastPositions.rightArm)
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

// Process pose detection results
function onResults(results) {
    // Ensure canvas context is in the correct state
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the camera feed
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
        // Draw skeleton with more visible colors
        window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS,
            {color: '#00FF00', lineWidth: 4});
            
        // Draw landmarks with larger, more visible points
        results.poseLandmarks.forEach((point) => {
            if (point.visibility > 0.5) {
                ctx.beginPath();
                ctx.arc(
                    point.x * canvas.width, 
                    point.y * canvas.height, 
                    6, // Increased point size
                    0, 
                    2 * Math.PI
                );
                ctx.fillStyle = "#FF0000";
                ctx.fill();
            }
        });

        // Process movements
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
    
    ctx.restore();
}

// Initialize everything
async function init() {
    startButton.disabled = true;
    statusDiv.textContent = 'Initializing...';
    
    // Set up pose detection
    pose.onResults(onResults);
    
    // Initialize camera
    await initCamera();
}

// Start initialization
init();

// Handle audio start button
startButton.addEventListener('click', async () => {
    try {
        startButton.disabled = true;
        
        if (initializeAudio()) {
            startButton.textContent = 'Audio Running';
            statusDiv.textContent = 'System ready - try moving!';
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
