let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');
let statusDiv = document.getElementById('status');

// Track last positions for movement detection
let lastPositions = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 };

// Audio setup
let audioContext = null;
let oscillators = [];  // Array for multiple oscillators
let gainNode = null;
let noiseNode = null;
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

// Add the button reference
let switchCameraButton = document.getElementById('switchCameraButton');

// Camera initialization
async function initCamera() {
    try {
        // Stop any existing camera stream
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        
        // Stop existing camera utility if it exists
        if (cameraUtils) {
            await cameraUtils.stop();
        }

        // Try to get camera with current facing mode
        let stream = null;
        try {
            // For iOS, we need to be more specific with constraints
            const constraints = {
                video: {
                    facingMode: currentFacingMode,
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            };

            // If we specifically want back camera, use 'environment'
            if (currentFacingMode === 'environment') {
                constraints.video.facingMode = { exact: 'environment' };
            }

            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.log('Specific camera failed, trying fallback:', err);
            // Fallback to any available camera
            stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
        }

        // Set up new video stream
        video.srcObject = stream;
        video.setAttribute('playsinline', ''); // Required for iOS
        await video.play();

        // Get actual video dimensions
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        const containerWidth = canvas.parentElement.clientWidth;
        const containerHeight = (containerWidth * videoHeight) / videoWidth;
        
        canvas.width = containerWidth;
        canvas.height = containerHeight;

        // Create new camera utility
        cameraUtils = new Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            }
        });

        await cameraUtils.start();
        statusDiv.textContent = 'Camera ready - click Start Audio';
        startButton.disabled = false;
        switchCameraButton.disabled = false;

    } catch (err) {
        console.error("Camera error:", err);
        statusDiv.textContent = 'Camera failed - please refresh and allow camera access';
        switchCameraButton.disabled = false; // Re-enable the button on error
    }
}

// Audio initialization
function initializeAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create noise generator for texture
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
        filterNode.Q.value = 1;
        
        // Create multiple oscillators for harmony
        const harmonicFreqs = [220, 330, 440, 550]; // A3, E4, A4, C#5
        oscillators = harmonicFreqs.map(freq => {
            const osc = audioContext.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            return osc;
        });
        
        // Create gain node
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0;
        
        // Connect everything
        noiseNode.connect(filterNode);
        filterNode.connect(gainNode);
        oscillators.forEach(osc => osc.connect(gainNode));
        gainNode.connect(audioContext.destination);
        
        // Start audio nodes
        noiseNode.start();
        oscillators.forEach(osc => osc.start());

        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        return false;
    }
}

// Update sound generation for more melodic sounds
function playSound(soundType, velocity) {
    if (!audioContext || !gainNode) return;

    const now = audioContext.currentTime;
    
    // Reduced debounce time
    if (now - lastSoundTime < 0.08) return;
    lastSoundTime = now;

    // Different harmonics for arms and legs
    if (soundType === 'legs') {
        // Lower frequencies for legs
        oscillators.forEach((osc, i) => {
            const baseFreq = 110; // A2
            const harmonics = [1, 1.5, 2, 2.5]; // Harmonic series
            osc.frequency.setValueAtTime(baseFreq * harmonics[i], now);
        });
        filterNode.frequency.setValueAtTime(400, now);
        
        // Percussive envelope for legs
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        const scaledVelocity = Math.min(velocity * 0.5, 0.7);
        gainNode.gain.linearRampToValueAtTime(scaledVelocity, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
    } else {
        // Higher frequencies for arms
        oscillators.forEach((osc, i) => {
            const baseFreq = 220; // A3
            const harmonics = [1, 1.5, 2, 2.5]; // Harmonic series
            osc.frequency.setValueAtTime(baseFreq * harmonics[i], now);
        });
        filterNode.frequency.setValueAtTime(800, now);
        
        // Smoother envelope for arms
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        const scaledVelocity = Math.min(velocity * 0.4, 0.6);
        gainNode.gain.linearRampToValueAtTime(scaledVelocity, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    }

    // Modulate filter based on velocity
    filterNode.Q.setValueAtTime(velocity * 5 + 1, now);
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

        // Process movements with increased velocity scaling
        const motions = detectMotions(results.poseLandmarks);
        
        if (motions.leftLeg.moving || motions.rightLeg.moving) {
            const velocity = Math.max(motions.leftLeg.velocity, motions.rightLeg.velocity) * 1.5;
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
    switchCameraButton.disabled = true;
    statusDiv.textContent = 'Initializing...';
    
    pose.onResults(onResults);
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

// Add camera switch handler
switchCameraButton.addEventListener('click', async () => {
    try {
        switchCameraButton.disabled = true;
        statusDiv.textContent = 'Switching camera...';
        
        // Toggle facing mode
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        
        // Wait a brief moment before reinitializing camera
        await new Promise(resolve => setTimeout(resolve, 100));
        await initCamera();
        
    } catch (error) {
        console.error('Error switching camera:', error);
        statusDiv.textContent = 'Failed to switch camera';
        switchCameraButton.disabled = false;
    }
});
