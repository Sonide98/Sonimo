let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');

// Audio variables
let audioContext;
let oscillator;
let gainNode;

// Add velocity tracking
let lastPositions = {
    leftLeg: 0,
    rightLeg: 0,
    leftArm: 0,
    rightArm: 0
};

// Initialize camera with high quality back camera
async function initializeCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { exact: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            // Set canvas size to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        };
        
        console.log('Camera initialized successfully');
    } catch (err) {
        console.error("Camera error:", err);
        // Fallback to any available camera
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            };
        } catch (fallbackErr) {
            console.error("Fallback camera error:", fallbackErr);
        }
    }
}

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

// Improved sound creation with multiple oscillators for richer sound
function createSound() {
    try {
        oscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();
        
        // Add filter for warmer sound
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        
        oscillator.type = 'triangle';
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        oscillator.start();
        
        console.log('Sound created successfully');
    } catch (error) {
        console.error('Error creating sound:', error);
    }
}

// Dynamic sound trigger based on movement velocity
function triggerSound(frequency, velocity) {
    if (!audioContext || !oscillator || !gainNode) {
        console.log('Audio system not ready');
        return;
    }
    
    try {
        const now = audioContext.currentTime;
        oscillator.frequency.setValueAtTime(frequency, now);
        
        // Calculate envelope parameters based on velocity
        const volume = Math.min(0.7, velocity * 2); // Scale velocity to volume
        const decayTime = Math.max(0.1, 0.5 - velocity); // Faster movement = shorter decay
        
        // Dynamic envelope
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        
        if (velocity > 0.3) {
            // Quick percussion for fast movements
            gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.15);
        } else {
            // Longer decay for slower movements
            gainNode.gain.linearRampToValueAtTime(volume * 0.7, now + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + decayTime);
            gainNode.gain.linearRampToValueAtTime(0, now + decayTime + 0.1);
        }
    } catch (error) {
        console.error('Error triggering sound:', error);
    }
}

// Calculate movement velocity
function calculateVelocity(currentPos, lastPos) {
    return Math.abs(currentPos - lastPos);
}

// Updated motion detection with velocity
function detectMotions(landmarks) {
    if (!landmarks || landmarks.length === 0) return {
        leftLeg: { moving: false, velocity: 0 },
        rightLeg: { moving: false, velocity: 0 },
        leftArm: { moving: false, velocity: 0 },
        rightArm: { moving: false, velocity: 0 }
    };
    
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    
    // Calculate current positions
    const leftLegPos = Math.abs(leftAnkle.y - leftKnee.y);
    const rightLegPos = Math.abs(rightAnkle.y - rightKnee.y);
    const leftArmPos = Math.abs(leftWrist.y - leftShoulder.y);
    const rightArmPos = Math.abs(rightWrist.y - rightShoulder.y);
    
    // Calculate velocities
    const result = {
        leftLeg: {
            moving: leftLegPos > 0.03 && leftAnkle.visibility > 0.5,
            velocity: calculateVelocity(leftLegPos, lastPositions.leftLeg)
        },
        rightLeg: {
            moving: rightLegPos > 0.03 && rightAnkle.visibility > 0.5,
            velocity: calculateVelocity(rightLegPos, lastPositions.rightLeg)
        },
        leftArm: {
            moving: leftArmPos > 0.05 && leftWrist.visibility > 0.5,
            velocity: calculateVelocity(leftArmPos, lastPositions.leftArm)
        },
        rightArm: {
            moving: rightArmPos > 0.05 && rightWrist.visibility > 0.5,
            velocity: calculateVelocity(rightArmPos, lastPositions.rightArm)
        }
    };
    
    // Update last positions
    lastPositions = {
        leftLeg: leftLegPos,
        rightLeg: rightLegPos,
        leftArm: leftArmPos,
        rightArm: rightArmPos
    };
    
    return result;
}

// Updated results processing with velocity-based sounds
function onResults(results) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
        // Draw connections
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

        const motions = detectMotions(results.poseLandmarks);
        
        // Trigger sounds based on movement and velocity
        if (motions.leftLeg.moving) {
            triggerSound(200, motions.leftLeg.velocity);
        }
        if (motions.rightLeg.moving) {
            triggerSound(250, motions.rightLeg.velocity);
        }
        if (motions.leftArm.moving) {
            triggerSound(300, motions.leftArm.velocity);
        }
        if (motions.rightArm.moving) {
            triggerSound(350, motions.rightArm.velocity);
        }
    }
}

// Set up pose detection
pose.onResults(onResults);

// Start everything in the correct order
async function startApp() {
    await initializeCamera();
    
    // Initialize camera after pose is ready
    const camera = new window.Camera(video, {
        onFrame: async () => {
            await pose.send({image: video});
        },
        width: 1280,
        height: 720
    });

    camera.start();
}

// Start the application
startApp();

// More robust audio initialization
startButton.addEventListener('click', async () => {
    try {
        // Create and resume audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
        
        // Create sound after small delay
        setTimeout(() => {
            createSound();
            console.log('Audio initialized successfully');
            startButton.disabled = true;
            startButton.textContent = 'Audio Running';
        }, 100);
    } catch (error) {
        console.error('Audio initialization failed:', error);
        startButton.textContent = 'Start Audio';
        startButton.disabled = false;
    }
});

