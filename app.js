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

// Initialize camera
function initCamera() {
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { exact: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    })
    .then(function(stream) {
        video.srcObject = stream;
        video.play();
        
        // Set canvas size
        canvas.width = 1280;
        canvas.height = 720;
        
        // Start camera after video is ready
        const camera = new window.Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            },
            width: 1280,
            height: 720
        });
        camera.start();
    })
    .catch(function(err) {
        console.error("Camera error:", err);
    });
}

// Sound functions
function createSound() {
    try {
        oscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();
        
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        
        oscillator.type = 'triangle';
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        oscillator.start();
    } catch (error) {
        console.error('Error creating sound:', error);
    }
}

function triggerSound(frequency, velocity) {
    if (!audioContext || !oscillator || !gainNode) return;
    
    try {
        const now = audioContext.currentTime;
        oscillator.frequency.setValueAtTime(frequency, now);
        
        const volume = Math.min(0.7, velocity * 2);
        const decayTime = Math.max(0.1, 0.5 - velocity);
        
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        
        if (velocity > 0.3) {
            gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.15);
        } else {
            gainNode.gain.linearRampToValueAtTime(volume * 0.7, now + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + decayTime);
            gainNode.gain.linearRampToValueAtTime(0, now + decayTime + 0.1);
        }
    } catch (error) {
        console.error('Error triggering sound:', error);
    }
}

// Motion detection
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
    
    const leftLegPos = Math.abs(leftAnkle.y - leftKnee.y);
    const rightLegPos = Math.abs(rightAnkle.y - rightKnee.y);
    const leftArmPos = Math.abs(leftWrist.y - leftShoulder.y);
    const rightArmPos = Math.abs(rightWrist.y - rightShoulder.y);
    
    const result = {
        leftLeg: {
            moving: leftLegPos > 0.03 && leftAnkle.visibility > 0.5,
            velocity: Math.abs(leftLegPos - lastPositions.leftLeg)
        },
        rightLeg: {
            moving: rightLegPos > 0.03 && rightAnkle.visibility > 0.5,
            velocity: Math.abs(rightLegPos - lastPositions.rightLeg)
        },
        leftArm: {
            moving: leftArmPos > 0.05 && leftWrist.visibility > 0.5,
            velocity: Math.abs(leftArmPos - lastPositions.leftArm)
        },
        rightArm: {
            moving: rightArmPos > 0.05 && rightWrist.visibility > 0.5,
            velocity: Math.abs(rightArmPos - lastPositions.rightArm)
        }
    };
    
    lastPositions = {
        leftLeg: leftLegPos,
        rightLeg: rightLegPos,
        leftArm: leftArmPos,
        rightArm: rightArmPos
    };
    
    return result;
}

// Process results
function onResults(results) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
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

        const motions = detectMotions(results.poseLandmarks);
        
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

// Initialize everything
initCamera();

// Audio initialization
startButton.addEventListener('click', async () => {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
        createSound();
        startButton.disabled = true;
        startButton.textContent = 'Audio Running';
    } catch (error) {
        console.error('Audio initialization failed:', error);
        startButton.textContent = 'Start Audio';
        startButton.disabled = false;
    }
});

