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

// Updated createPercussionSound function
function createPercussionSound() {
    try {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        // Simpler audio routing
        osc.type = 'triangle';
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        // Initialize with zero gain
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        
        return { oscillator: osc, gainNode: gain };
    } catch (error) {
        console.error('Error creating percussion sound:', error);
        throw error;
    }
}

// Optimize the playPercussion function
function playPercussion(gainNode, frequency, maxVolume = 0.3) {
    const now = audioContext.currentTime;
    try {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(maxVolume, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
    } catch (error) {
        console.error('Error playing percussion:', error);
    }
}

// Updated detectWalkingMotion function with more sensitive thresholds
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

    // Calculate leg movements
    const leftLegMovement = Math.abs((leftAnkle.y - leftHip.y) - (leftKnee.y - leftHip.y));
    const rightLegMovement = Math.abs((rightAnkle.y - rightHip.y) - (rightKnee.y - rightHip.y));

    return {
        leftStep: leftLegMovement > 0.015 && leftAnkle.visibility > 0.5,  // More sensitive threshold
        rightStep: rightLegMovement > 0.015 && rightAnkle.visibility > 0.5
    };
}

// Add function to detect arm movements
function detectArmMovements(landmarks) {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow || !leftWrist || !rightWrist) {
        return { leftArm: false, rightArm: false };
    }

    // Detect significant arm movements
    const leftArmMovement = Math.abs(leftWrist.y - leftShoulder.y);
    const rightArmMovement = Math.abs(rightWrist.y - rightShoulder.y);

    return {
        leftArm: leftArmMovement > 0.1 && leftWrist.visibility > 0.5,
        rightArm: rightArmMovement > 0.1 && rightWrist.visibility > 0.5
    };
}

// Updated updateSoundBasedOnPose function
function updateSoundBasedOnPose(landmarks) {
    if (!audioContext || !landmarks || landmarks.length === 0) return;

    const { leftStep, rightStep } = detectWalkingMotion(landmarks);
    const { leftArm, rightArm } = detectArmMovements(landmarks);
    
    // Leg sounds
    if (leftStep !== lastLeftStep && leftStep) {
        playPercussion(leftLegOsc.gainNode, 150, 0.9); // Bass drum sound
        leftLegOsc.oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
    }
    if (rightStep !== lastRightStep && rightStep) {
        playPercussion(rightLegOsc.gainNode, 200, 0.9); // Mid drum sound
        rightLegOsc.oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
    }

    // Arm sounds
    if (leftArm !== lastLeftArm && leftArm) {
        playPercussion(leftArmOsc.gainNode, 300, 0.7); // Higher percussion
        leftArmOsc.oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
    }
    if (rightArm !== lastRightArm && rightArm) {
        playPercussion(rightArmOsc.gainNode, 350, 0.7); // Highest percussion
        rightArmOsc.oscillator.frequency.setValueAtTime(350, audioContext.currentTime);
    }

    // Update states
    lastLeftStep = leftStep;
    lastRightStep = rightStep;
    lastLeftArm = leftArm;
    lastRightArm = rightArm;
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

// Update camera resolution to match canvas
const camera = new window.Camera(video, {
    onFrame: async () => {
        await pose.send({image: video});
    },
    width: 720,    // Reduced for clearer image
    height: 1280   // Maintained aspect ratio
});

camera.start();

// Updated audio initialization with better error handling and performance
startButton.addEventListener('click', async () => {
    try {
        // First suspend camera processing temporarily
        if (camera) {
            await camera.stop();
        }

        // Initialize audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // Create oscillators one by one with error handling
        const createAndSetupOscillator = async (freq) => {
            const sound = createPercussionSound();
            sound.oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
            return sound;
        };

        // Create oscillators sequentially
        leftLegOsc = await createAndSetupOscillator(100);
        rightLegOsc = await createAndSetupOscillator(150);
        leftArmOsc = await createAndSetupOscillator(200);
        rightArmOsc = await createAndSetupOscillator(250);

        // Start oscillators one by one with delay
        const startOscillator = async (osc) => {
            try {
                osc.oscillator.start();
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (err) {
                console.error('Oscillator start error:', err);
            }
        };

        await startOscillator(leftLegOsc);
        await startOscillator(rightLegOsc);
        await startOscillator(leftArmOsc);
        await startOscillator(rightArmOsc);

        // Resume camera after audio setup
        if (camera) {
            await camera.start();
        }

        startButton.disabled = true;
        startButton.textContent = 'Audio Running';

    } catch (error) {
        console.error('Audio initialization failed:', error);
        startButton.textContent = 'Start Audio';
        startButton.disabled = false;
        
        // Ensure camera is running even if audio fails
        if (camera) {
            camera.start();
        }
    }
});

