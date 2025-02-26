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

// Initialize camera specifically for iPhone rear camera
async function initCamera() {
    try {
        // For iPhone, we need these specific constraints
        const constraints = {
            video: {
                facingMode: { exact: "environment" },
                height: { min: 720, ideal: 1280 },
                width: { min: 480, ideal: 720 }
            }
        };

        // Stop any existing streams
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        // Get the video stream with iPhone-specific constraints
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;

        // Wait for video to be ready
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        // Get track settings
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();

        // Set canvas size
        canvas.width = settings.height;  // Swap width and height for proper orientation
        canvas.height = settings.width;

        // Initialize MediaPipe camera with swapped dimensions
        const camera = new window.Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            },
            width: settings.height,  // Swap width and height here too
            height: settings.width
        });

        camera.start();
        statusDiv.textContent = 'Camera ready';
        console.log('Camera initialized with settings:', settings);

    } catch (err) {
        console.error("Camera error:", err);
        
        // Try fallback method for iPhone
        try {
            const fallbackConstraints = {
                video: {
                    facingMode: "environment",  // Remove exact to be more permissive
                    height: { ideal: 1280 },
                    width: { ideal: 720 }
                }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            video.srcObject = stream;
            video.play();
            
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            
            canvas.width = settings.height;
            canvas.height = settings.width;
            
            const camera = new window.Camera(video, {
                onFrame: async () => {
                    await pose.send({image: video});
                },
                width: settings.height,
                height: settings.width
            });
            
            camera.start();
            statusDiv.textContent = 'Camera ready (fallback mode)';
            
        } catch (fallbackErr) {
            console.error("Fallback camera error:", fallbackErr);
            statusDiv.textContent = 'Camera failed. Please refresh and try again.';
        }
    }
}

// Improved audio initialization
async function initializeAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // Create audio nodes
        oscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();
        compressor = audioContext.createDynamicsCompressor();

        // Configure compressor
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // Configure oscillator
        oscillator.type = 'triangle';
        oscillator.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(audioContext.destination);

        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        oscillator.start();
        
        isAudioInitialized = true;
        statusDiv.textContent = 'Audio system ready';
        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        statusDiv.textContent = 'Audio initialization failed';
        return false;
    }
}

// Improved sound triggering
function triggerSound(frequency, velocity) {
    if (!isAudioInitialized) return;
    
    try {
        const now = audioContext.currentTime;
        
        // Smooth frequency transition
        oscillator.frequency.setTargetAtTime(frequency, now, 0.03);
        
        // Dynamic volume based on velocity
        const volume = Math.min(0.4, velocity * 1.5);
        
        // Quick attack, natural decay
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
    } catch (error) {
        console.error('Sound trigger error:', error);
    }
}

// Improved motion detection
function detectMotions(landmarks) {
    if (!landmarks || landmarks.length === 0) return {
        leftLeg: { moving: false, velocity: 0 },
        rightLeg: { moving: false, velocity: 0 },
        leftArm: { moving: false, velocity: 0 },
        rightArm: { moving: false, velocity: 0 }
    };

    const smoothingFactor = 0.3;
    const movementThreshold = 0.03;
    const visibilityThreshold = 0.6;

    function calculateMovement(point1, point2, lastPos, id) {
        if (!point1 || !point2 || point1.visibility < visibilityThreshold) return { moving: false, velocity: 0 };
        
        const currentPos = Math.abs(point1.y - point2.y);
        const velocity = Math.abs(currentPos - lastPos) * smoothingFactor;
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

// Process results
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
        
        if (motions.leftLeg.moving) {
            triggerSound(196.00, motions.leftLeg.velocity);  // G3
        }
        if (motions.rightLeg.moving) {
            triggerSound(246.94, motions.rightLeg.velocity); // B3
        }
        if (motions.leftArm.moving) {
            triggerSound(293.66, motions.leftArm.velocity);  // D4
        }
        if (motions.rightArm.moving) {
            triggerSound(349.23, motions.rightArm.velocity); // F4
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

