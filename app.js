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

// Initialize camera with back camera (with multiple fallback options)
navigator.mediaDevices.getUserMedia({
    video: {
        facingMode: { exact: "environment" },
        width: { ideal: 640 },
        height: { ideal: 480 }
    }
})
.then(function(stream) {
    video.srcObject = stream;
    video.play();
})
.catch(function(err) {
    console.error("First camera attempt failed, trying alternate method:", err);
    // Try second method
    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const backCamera = devices.find(device => 
                device.kind === 'videoinput' && 
                !device.label.toLowerCase().includes('front'));
            
            if (backCamera) {
                return navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: { exact: backCamera.deviceId },
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    }
                });
            } else {
                throw new Error('No back camera found');
            }
        })
        .then(stream => {
            video.srcObject = stream;
            video.play();
        })
        .catch(err => {
            console.error("All camera attempts failed:", err);
        });
});

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
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
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

// Play a percussion hit
function playPercussion(gainNode, frequency) {
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);
}

// Updated function to create rhythmic sounds from body movement
function updateSoundBasedOnPose(landmarks) {
    if (!audioContext || !landmarks || landmarks.length === 0) return;

    // Body points
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    if (leftAnkle && rightAnkle && leftKnee && rightKnee && leftHip && rightHip) {
        // Calculate relative positions for legs
        const leftLegExtension = (leftAnkle.y - leftHip.y) / (leftKnee.y - leftHip.y);
        const rightLegExtension = (rightAnkle.y - rightHip.y) / (rightKnee.y - rightHip.y);

        // More sensitive thresholds for leg movement
        const leftStep = leftLegExtension > 1.02 && leftAnkle.visibility > 0.5;
        const rightStep = rightLegExtension > 1.02 && rightAnkle.visibility > 0.5;

        // Arm movements
        const leftArmRaised = leftWrist && leftShoulder && 
            (leftWrist.y < leftShoulder.y) && leftWrist.visibility > 0.5;
        const rightArmRaised = rightWrist && rightShoulder && 
            (rightWrist.y < rightShoulder.y) && rightWrist.visibility > 0.5;

        // Trigger leg sounds
        if (leftStep !== lastLeftStep && leftStep) {
            playPercussion(leftLegOsc.gainNode, 200); // Bass drum sound
        }
        if (rightStep !== lastRightStep && rightStep) {
            playPercussion(rightLegOsc.gainNode, 250); // Slightly higher drum
        }

        // Trigger arm sounds
        if (leftArmRaised !== lastLeftArmRaised && leftArmRaised) {
            playPercussion(leftArmOsc.gainNode, 400); // Higher percussion
        }
        if (rightArmRaised !== lastRightArmRaised && rightArmRaised) {
            playPercussion(rightArmOsc.gainNode, 350); // Mid-high percussion
        }

        // Update states
        lastLeftStep = leftStep;
        lastRightStep = rightStep;
        lastLeftArmRaised = leftArmRaised;
        lastRightArmRaised = rightArmRaised;
    }
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

