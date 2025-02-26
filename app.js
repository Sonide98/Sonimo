let video = document.getElementById('videoInput');
let canvas = document.getElementById('canvasOutput');
let ctx = canvas.getContext('2d');
let startButton = document.getElementById('startButton');

// Audio variables
let audioContext;
let oscillator;
let gainNode;
let lastPositions = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 };

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
async function initCamera() {
    try {
        const constraints = {
            video: {
                facingMode: { exact: 'environment' },
                width: { ideal: 640 },
                height: { ideal: 480 },
                zoom: 1
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        // Set canvas size
        canvas.width = 640;
        canvas.height = 480;

        // Start MediaPipe camera
        const camera = new window.Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            },
            width: 640,
            height: 480
        });
        camera.start();

    } catch (err) {
        console.error("Camera error:", err);
    }
}

// Create sound with simpler setup
function createSound() {
    try {
        oscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();
        
        oscillator.type = 'triangle';
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        oscillator.start();
        console.log('Sound created successfully');
    } catch (error) {
        console.error('Error creating sound:', error);
    }
}

// Simplified sound trigger
function triggerSound(frequency, velocity) {
    if (!audioContext || !oscillator || !gainNode) {
        console.log('Audio not ready');
        return;
    }
    
    try {
        const now = audioContext.currentTime;
        oscillator.frequency.setValueAtTime(frequency, now);
        
        const volume = Math.min(0.5, velocity * 2);
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
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
            moving: leftLegPos > 0.04 && leftAnkle.visibility > 0.5,
            velocity: Math.abs(leftLegPos - lastPositions.leftLeg)
        },
        rightLeg: {
            moving: rightLegPos > 0.04 && rightAnkle.visibility > 0.5,
            velocity: Math.abs(rightLegPos - lastPositions.rightLeg)
        },
        leftArm: {
            moving: leftArmPos > 0.06 && leftWrist.visibility > 0.5,
            velocity: Math.abs(leftArmPos - lastPositions.leftArm)
        },
        rightArm: {
            moving: rightArmPos > 0.06 && rightWrist.visibility > 0.5,
            velocity: Math.abs(rightArmPos - lastPositions.rightArm)
        }
    };
    
    lastPositions = { leftLegPos, rightLegPos, leftArmPos, rightArmPos };
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
        console.log('Audio initialized');
        startButton.disabled = true;
        startButton.textContent = 'Audio Running';
    } catch (error) {
        console.error('Audio initialization failed:', error);
        startButton.textContent = 'Start Audio';
        startButton.disabled = false;
    }
});

