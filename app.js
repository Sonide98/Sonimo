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
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const backCamera = videoDevices.find(device => 
            device.label.toLowerCase().includes('back') ||
            device.label.toLowerCase().includes('rear'));

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: backCamera ? { exact: backCamera.deviceId } : undefined,
                facingMode: { exact: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            }
        });

        video.srcObject = stream;
        await video.play();

        // Set canvas size to match video
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;
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

// Updated sound creation with more musical characteristics
function createSound() {
    try {
        oscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();
        
        // Create a filter for more musical tone
        const filter = audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 400;
        filter.Q.value = 1;
        
        // Use sine wave for cleaner tone
        oscillator.type = 'sine';
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

// Musical note frequencies (pentatonic scale)
const NOTES = {
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    G4: 392.00,
    A4: 440.00
};

// Improved percussion sound with shorter envelope
function triggerSound(frequency = NOTES.C4, volume = 0.3) {
    if (!audioContext || !oscillator || !gainNode) {
        console.log('Audio system not ready');
        return;
    }
    
    try {
        const now = audioContext.currentTime;
        oscillator.frequency.setValueAtTime(frequency, now);
        gainNode.gain.cancelScheduledValues(now);
        
        // Very quick attack
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        
        // Short decay
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.15);
    } catch (error) {
        console.error('Error triggering sound:', error);
    }
}

// Improved motion detection with different body parts
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
    
    // Detect leg movements
    const leftLegMovement = Math.abs(leftAnkle.y - leftKnee.y);
    const rightLegMovement = Math.abs(rightAnkle.y - rightKnee.y);
    
    // Detect arm movements
    const leftArmMovement = Math.abs(leftWrist.y - leftShoulder.y);
    const rightArmMovement = Math.abs(rightWrist.y - rightShoulder.y);
    
    return {
        leftLeg: leftLegMovement > 0.05 && leftAnkle.visibility > 0.5,
        rightLeg: rightLegMovement > 0.05 && rightAnkle.visibility > 0.5,
        leftArm: leftArmMovement > 0.1 && leftWrist.visibility > 0.5,
        rightArm: rightArmMovement > 0.1 && rightWrist.visibility > 0.5
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

// Initialize camera
const camera = new window.Camera(video, {
    onFrame: async () => {
        await pose.send({image: video});
    },
    width: 1920,
    height: 1080
});

// Start everything
initializeCamera().then(() => camera.start());

// Updated audio initialization with error handling
startButton.addEventListener('click', async () => {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
        createSound();
        console.log('Audio initialized successfully');
        startButton.disabled = true;
        startButton.textContent = 'Audio Running';
    } catch (error) {
        console.error('Audio initialization failed:', error);
        startButton.textContent = 'Start Audio';
        startButton.disabled = false;
    }
});

