let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');
let statusDiv = document.getElementById('status');

// Track last positions for movement detection
let lastPositions = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 };

// Audio setup
let audioContext = null;
let oscillator = null;  // Single oscillator for subtle harmony
let noiseNode = null;
let gainNode = null;
let noiseGainNode = null;  // Separate gain for noise
let filterNode = null;

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

// Add at the top with other global variables
let currentFacingMode = 'environment';
let cameraUtils = null;

// Camera initialization
async function initCamera() {
    try {
        // First try without exact constraint
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',  // Removed 'exact' constraint
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
        } catch (err) {
            console.log('Failed with environment camera, trying any camera:', err);
            stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
        }

        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        await video.play();

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        const containerWidth = canvas.parentElement.clientWidth;
        const containerHeight = (containerWidth * videoHeight) / videoWidth;
        
        canvas.width = containerWidth;
        canvas.height = containerHeight;

        // Make sure pose is properly initialized before creating camera utility
        await pose.initialize();

        // Create camera utility
        const camera = new Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            }
        });

        await camera.start();
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
        
        // Create noise generator for main percussive sound
        const bufferSize = 2 * audioContext.sampleRate;
        const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        noiseNode = audioContext.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;

        // Create filter for the noise
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 800;
        filterNode.Q.value = 2;
        
        // Create single oscillator for subtle harmony
        oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        
        // Create separate gain nodes for noise and harmony
        noiseGainNode = audioContext.createGain();
        gainNode = audioContext.createGain();
        
        noiseGainNode.gain.value = 0;
        gainNode.gain.value = 0;
        
        // Connect everything
        noiseNode.connect(filterNode);
        filterNode.connect(noiseGainNode);
        oscillator.connect(gainNode);
        
        noiseGainNode.connect(audioContext.destination);
        gainNode.connect(audioContext.destination);
        
        // Start audio nodes
        noiseNode.start();
        oscillator.start();

        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        return false;
    }
}

// Update sound generation to be more percussive with subtle harmony
function playSound(soundType, velocity) {
    if (!audioContext || !gainNode) return;

    const now = audioContext.currentTime;
    
    if (now - lastSoundTime < 0.08) return;
    lastSoundTime = now;

    // Set base frequency based on movement type
    const baseFreq = soundType === 'legs' ? 150 : 350;  // Increased both frequencies
    oscillator.frequency.setValueAtTime(baseFreq, now);
    
    // Adjust filter for noise based on movement type
    filterNode.frequency.setValueAtTime(
        soundType === 'legs' ? 600 : 1000,  // Increased filter frequencies
        now
    );
    filterNode.Q.setValueAtTime(velocity * 4 + 1, now);  // Increased resonance

    // Percussive envelope for noise (main sound)
    noiseGainNode.gain.cancelScheduledValues(now);
    noiseGainNode.gain.setValueAtTime(0, now);
    
    if (soundType === 'legs') {
        // Stronger noise for legs
        const noiseVelocity = Math.min(velocity * 1.2, 1.0);  // Increased leg volume
        noiseGainNode.gain.linearRampToValueAtTime(noiseVelocity, now + 0.01);
        noiseGainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    } else {
        // Original noise for arms
        const noiseVelocity = Math.min(velocity * 0.8, 0.9);
        noiseGainNode.gain.linearRampToValueAtTime(noiseVelocity, now + 0.01);
        noiseGainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    }

    // Subtle harmonic envelope (background sound)
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    const harmonyVelocity = Math.min(velocity * 0.2, 0.25);  // Slightly increased harmony
    gainNode.gain.linearRampToValueAtTime(harmonyVelocity, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
}

// Adjust motion detection parameters
function detectMotions(landmarks) {
    if (!landmarks || landmarks.length === 0) return {
        leftLeg: { moving: false, velocity: 0 },
        rightLeg: { moving: false, velocity: 0 },
        leftArm: { moving: false, velocity: 0 },
        rightArm: { moving: false, velocity: 0 }
    };

    // More sensitive parameters for both arms and legs
    const smoothingFactor = 0.4;  // Increased for more immediate response
    const movementThreshold = 0.008;  // Reduced for better sensitivity
    const visibilityThreshold = 0.3;

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
            velocity: Math.min(velocity * 1.5, 1.0) // Increased scaling for more dynamic response
        };
    }

    // Use ankle and knee points for legs instead of hip points
    const result = {
        leftLeg: calculateMovement(landmarks[27], landmarks[25], lastPositions.leftLeg),   // Left ankle to knee
        rightLeg: calculateMovement(landmarks[28], landmarks[26], lastPositions.rightLeg),  // Right ankle to knee
        leftArm: calculateMovement(landmarks[15], landmarks[11], lastPositions.leftArm),    // Left wrist to shoulder
        rightArm: calculateMovement(landmarks[16], landmarks[12], lastPositions.rightArm)   // Right wrist to shoulder
    };

    // Update last positions
    lastPositions = {
        leftLeg: Math.abs(landmarks[27].y - landmarks[25].y),   // Left ankle to knee
        rightLeg: Math.abs(landmarks[28].y - landmarks[26].y),  // Right ankle to knee
        leftArm: Math.abs(landmarks[15].y - landmarks[11].y),   // Left wrist to shoulder
        rightArm: Math.abs(landmarks[16].y - landmarks[12].y)   // Right wrist to shoulder
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

        // Process movements with adjusted velocity scaling
        const motions = detectMotions(results.poseLandmarks);
        
        if (motions.leftLeg.moving || motions.rightLeg.moving) {
            const velocity = Math.max(motions.leftLeg.velocity, motions.rightLeg.velocity) * 2.0; // Increased from 1.5
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
    try {
        startButton.disabled = true;
        statusDiv.textContent = 'Initializing...';
        
        // Set up pose detection
        pose.onResults(onResults);
        
        // Initialize camera
        await initCamera();
    } catch (error) {
        console.error("Initialization error:", error);
        statusDiv.textContent = 'Failed to initialize - please refresh';
    }
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
