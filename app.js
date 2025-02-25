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

// Sound creation
function createSound() {
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    
    oscillator.type = 'triangle';
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    oscillator.start();
}

// Trigger sound with smoother envelope
function triggerSound(frequency = 200, volume = 0.3) {
    if (!audioContext) return;
    
    const now = audioContext.currentTime;
    oscillator.frequency.setValueAtTime(frequency, now);
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
}

// Detect motion
function detectMotion(landmarks) {
    if (!landmarks || landmarks.length === 0) return false;
    
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    
    // More sophisticated motion detection
    const leftLegMovement = Math.abs(leftAnkle.y - leftKnee.y);
    const rightLegMovement = Math.abs(rightAnkle.y - rightKnee.y);
    
    return (leftLegMovement > 0.1 || rightLegMovement > 0.1) && 
           (leftAnkle.visibility > 0.5 || rightAnkle.visibility > 0.5);
}

// Process results with connections
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

        if (detectMotion(results.poseLandmarks)) {
            triggerSound(200, 0.3);
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

// Audio initialization
startButton.addEventListener('click', () => {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        createSound();
        startButton.disabled = true;
        startButton.textContent = 'Audio Running';
    } catch (error) {
        console.error('Audio initialization failed:', error);
        startButton.textContent = 'Start Audio';
        startButton.disabled = false;
    }
});

