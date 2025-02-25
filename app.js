let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');

// Audio variables
let audioContext;
let oscillator;
let gainNode;

// Initialize camera with high quality back camera
async function initializeCamera() {
    try {
        // Force back camera selection
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { exact: "environment" }, // This forces back camera
                width: { ideal: 1280 },  // Reduced for better performance
                height: { ideal: 720 }
            }
        });

        video.srcObject = stream;
        await video.play();

        // Set canvas size to match video
        canvas.width = 1280;
        canvas.height = 720;
        
        console.log('Camera initialized successfully');
    } catch (err) {
        console.error("Camera error:", err);
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

// Simplified sound creation for more reliability
function createSound() {
    try {
        oscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();
        
        oscillator.type = 'triangle';  // Changed to triangle for better percussion
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        oscillator.start();
        
        console.log('Sound created successfully');
    } catch (error) {
        console.error('Error creating sound:', error);
    }
}

// Simplified trigger sound function
function triggerSound(frequency = 200, volume = 0.5) {
    if (!audioContext || !oscillator || !gainNode) {
        console.log('Audio system not ready');
        return;
    }
    
    try {
        const now = audioContext.currentTime;
        oscillator.frequency.setValueAtTime(frequency, now);
        
        // Percussion envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
        
        console.log('Sound triggered:', frequency);
    } catch (error) {
        console.error('Error triggering sound:', error);
    }
}

// Make motion detection more sensitive
function detectMotions(landmarks) {
    if (!landmarks || landmarks.length === 0) return {
        leftLeg: false,
        rightLeg: false,
        leftArm: false,
        rightArm: false
    };
    
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    
    return {
        leftLeg: Math.abs(leftAnkle.y - leftKnee.y) > 0.03 && leftAnkle.visibility > 0.5,
        rightLeg: Math.abs(rightAnkle.y - rightKnee.y) > 0.03 && rightAnkle.visibility > 0.5,
        leftArm: Math.abs(leftWrist.y - leftShoulder.y) > 0.05 && leftWrist.visibility > 0.5,
        rightArm: Math.abs(rightWrist.y - rightShoulder.y) > 0.05 && rightWrist.visibility > 0.5
    };
}

// Updated results processing with musical notes
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

        // Check all movements and trigger musical notes
        const motions = detectMotions(results.poseLandmarks);
        
        if (motions.leftLeg) {
            triggerSound(NOTES.C4, 0.4);  // Root note
        }
        if (motions.rightLeg) {
            triggerSound(NOTES.E4, 0.4);  // Major third
        }
        if (motions.leftArm) {
            triggerSound(NOTES.G4, 0.3);  // Perfect fifth
        }
        if (motions.rightArm) {
            triggerSound(NOTES.A4, 0.3);  // Major sixth
        }
    }
}

// Set up pose detection
pose.onResults(onResults);

// Initialize camera with lower resolution for better performance
const camera = new window.Camera(video, {
    onFrame: async () => {
        await pose.send({image: video});
    },
    width: 1280,
    height: 720
});

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

