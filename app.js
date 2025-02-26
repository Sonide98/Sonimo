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
let noiseNode = null; // For percussive sounds

// Initialize MediaPipe Pose
const pose = new Pose({
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

// Add this at the top with other global variables
let lastSoundTime = 0;

// Camera initialization
async function initCamera() {
    try {
        // First try to get the back camera
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { exact: 'environment' },
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
        } catch (err) {
            // If back camera fails, try any available camera
            console.log('Back camera failed, trying any camera');
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
        }

        video.srcObject = stream;
        video.setAttribute('playsinline', ''); // Important for iOS
        await video.play();

        // Get actual video dimensions
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        // Calculate container dimensions while maintaining aspect ratio
        const containerWidth = canvas.parentElement.clientWidth;
        const containerHeight = (containerWidth * videoHeight) / videoWidth;
        
        canvas.width = containerWidth;
        canvas.height = containerHeight;

        // Set up the camera utility
        const cameraUtils = new Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            }
        });

        await cameraUtils.start();
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
        
        // Create noise generator for more percussive sounds
        const bufferSize = 2 * audioContext.sampleRate;
        const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        noiseNode = audioContext.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;
        
        // Create oscillator
        oscillator = audioContext.createOscillator();
        oscillator.type = 'triangle'; // Changed from 'sine' for more character
        
        // Create gain nodes
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0;
        
        // Connect nodes
        oscillator.connect(gainNode);
        noiseNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Start audio nodes
        oscillator.start();
        noiseNode.start();

        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        return false;
    }
}

// Adjust sound generation
function playSound(soundType, velocity) {
    if (!audioContext || !oscillator || !gainNode) return;

    const now = audioContext.currentTime;
    
    // Add debouncing
    if (now - lastSoundTime < 0.1) return;
    lastSoundTime = now;

    // Different frequencies for arms and legs
    const frequency = soundType === 'legs' ? 150 : 300;
    oscillator.frequency.setValueAtTime(frequency, now);

    // Create percussive envelope
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    
    // Quick attack, short decay
    const scaledVelocity = Math.min(velocity * 0.4, 0.7);
    gainNode.gain.linearRampToValueAtTime(scaledVelocity, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
}

// Adjust motion detection parameters
function detectMotions(landmarks) {
    if (!landmarks || landmarks.length === 0) return {
        leftLeg: { moving: false, velocity: 0 },
        rightLeg: { moving: false, velocity: 0 },
        leftArm: { moving: false, velocity: 0 },
        rightArm: { moving: false, velocity: 0 }
    };

    // Adjusted parameters for smoother detection
    const smoothingFactor = 0.3;  // Reduced from 0.6
    const movementThreshold = 0.012;  // Increased from 0.008
    const visibilityThreshold = 0.3;  // Increased from 0.2

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
            velocity: Math.min(velocity, 1.0) // Cap the velocity
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
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
        // Draw skeleton with more visible colors
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS,
            {color: '#00FF00', lineWidth: 4});
            
        // Draw landmarks with larger, more visible points
        results.poseLandmarks.forEach((point) => {
            if (point.visibility > 0.5) {
                ctx.beginPath();
                ctx.arc(
                    point.x * canvas.width, 
                    point.y * canvas.height, 
                    6,
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
