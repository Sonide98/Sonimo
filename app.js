let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');

// Audio context and oscillator variables
let audioContext;
let oscillator;
let gainNode;

// Declare variables for oscillators
let leftLegOsc, rightLegOsc, leftArmOsc, rightArmOsc;
let lastLeftStep = false;
let lastRightStep = false;
let lastLeftArmRaised = false;
let lastRightArmRaised = false;

// Function to get the back camera
async function getBackCamera() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    // Try to find the back camera
    const backCamera = videoDevices.find(device => 
        device.label.toLowerCase().includes('back') ||
        device.label.toLowerCase().includes('environment') ||
        device.label.toLowerCase().includes('rear'));
    
    return backCamera ? backCamera.deviceId : null;
}

// Initialize camera
async function initializeCamera() {
    try {
        const backCameraId = await getBackCamera();
        const constraints = {
            video: backCameraId ? {
                deviceId: { exact: backCameraId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: "environment"
            } : {
                facingMode: { exact: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play();
        
        // Set canvas size to match video
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;
    } catch (err) {
        console.error("Camera initialization failed:", err);
    }
}

// Call the initialization
initializeCamera();

// Initialize MediaPipe Pose
const pose = new window.Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,  // Lowered for better detection
    minTrackingConfidence: 0.5    // Lowered for better tracking
});

// Create percussion sound
function createPercussionSound() {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    filter.type = 'bandpass';
    filter.frequency.value = 200;
    filter.Q.value = 1;
    
    osc.type = 'triangle';
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    
    return { oscillator: osc, gainNode: gain };
}

// Updated function to detect walking motion
function detectWalkingMotion(landmarks) {
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
        return { leftStep: false, rightStep: false };
    }

    // Calculate leg movement relative to hip position
    const leftLegMovement = Math.abs((leftAnkle.y - leftHip.y) - (leftKnee.y - leftHip.y));
    const rightLegMovement = Math.abs((rightAnkle.y - rightHip.y) - (rightKnee.y - rightHip.y));

    // More sensitive thresholds that work at different distances
    return {
        leftStep: leftLegMovement > 0.02 && leftAnkle.visibility > 0.5,
        rightStep: rightLegMovement > 0.02 && rightAnkle.visibility > 0.5
    };
}

// Updated function for sound generation
function updateSoundBasedOnPose(landmarks) {
    if (!audioContext || !landmarks || landmarks.length === 0) return;

    const { leftStep, rightStep } = detectWalkingMotion(landmarks);
    
    // Arm detection
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    const leftArmRaised = leftWrist && leftShoulder && 
        (leftWrist.y < leftShoulder.y) && leftWrist.visibility > 0.5;
    const rightArmRaised = rightWrist && rightShoulder && 
        (rightWrist.y < rightShoulder.y) && rightWrist.visibility > 0.5;

    // Trigger sounds
    if (leftStep !== lastLeftStep && leftStep) {
        playPercussion(leftLegOsc.gainNode, 200, 0.5); // Increased volume
    }
    if (rightStep !== lastRightStep && rightStep) {
        playPercussion(rightLegOsc.gainNode, 250, 0.5); // Increased volume
    }
    if (leftArmRaised !== lastLeftArmRaised && leftArmRaised) {
        playPercussion(leftArmOsc.gainNode, 400, 0.3);
    }
    if (rightArmRaised !== lastRightArmRaised && rightArmRaised) {
        playPercussion(rightArmOsc.gainNode, 350, 0.3);
    }

    // Update states
    lastLeftStep = leftStep;
    lastRightStep = rightStep;
    lastLeftArmRaised = leftArmRaised;
    lastRightArmRaised = rightArmRaised;
}

// Updated percussion function with volume parameter
function playPercussion(gainNode, frequency, maxVolume = 0.3) {
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(maxVolume, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);
}

// Update the onResults function to draw connections between points
function onResults(results) {
    if (!canvas.width || !canvas.height) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
        // Draw landmarks and connections
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

        updateSoundBasedOnPose(results.poseLandmarks);
    }
}

// Set up pose detection
pose.onResults(onResults);

// Create camera object
const camera = new window.Camera(video, {
    onFrame: async () => {
        await pose.send({image: video});
    },
    width: 640,
    height: 480
});

camera.start();

// Initialize audio on button click with additional oscillators
startButton.addEventListener('click', () => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create percussion sounds for legs and arms
    leftLegOsc = createPercussionSound();
    rightLegOsc = createPercussionSound();
    leftArmOsc = createPercussionSound();
    rightArmOsc = createPercussionSound();
    
    // Set different frequencies for each limb
    leftLegOsc.oscillator.frequency.setValueAtTime(200, audioContext.currentTime);  // Bass drum
    rightLegOsc.oscillator.frequency.setValueAtTime(250, audioContext.currentTime); // Mid-low drum
    leftArmOsc.oscillator.frequency.setValueAtTime(400, audioContext.currentTime);  // High percussion
    rightArmOsc.oscillator.frequency.setValueAtTime(350, audioContext.currentTime); // Mid-high percussion
    
    // Start all oscillators
    leftLegOsc.oscillator.start();
    rightLegOsc.oscillator.start();
    leftArmOsc.oscillator.start();
    rightArmOsc.oscillator.start();
    
    startButton.disabled = true;
    startButton.textContent = 'Audio Running';
});

