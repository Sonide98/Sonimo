<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>SoniMo</title>
    <!-- MediaPipe Pose -->
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        h1 {
            color: #333;
            font-family: Arial, sans-serif;
            font-size: 2.5em;
            margin: 20px 0;
            text-align: center;
        }
        .container {
            position: relative;
            width: 100%;
            max-width: 480px;
            margin: 20px auto;
        }
        canvas {
            width: 100%;
            height: auto;
            aspect-ratio: 9/16;
            border-radius: 12px;
            background: #f5f5f5;
            border: 1px solid #ddd;
            display: block;
        }
        video {
            display: none;
        }
        #startButton {
            padding: 12px 24px;
            font-size: 18px;
            background: #5da3b5;
            color: white;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            margin-top: 20px;
            transition: all 0.3s ease;
        }
        #startButton:hover {
            background: #4a8294;
            transform: scale(1.05);
        }
        #startButton:disabled {
            background: #cccccc;
            cursor: not-allowed;
            transform: none;
        }
        #status {
            color: #666;
            margin: 10px 0;
            font-family: Arial, sans-serif;
        }
    </style>
</head>
<body>
    <h1>SoniMo</h1>
    <div id="status">Initializing camera...</div>
    <div class="container">
        <video id="videoInput" playsinline></video>
        <canvas id="canvasOutput"></canvas>
    </div>
    <button id="startButton">Start Audio</button>
    <script src="app.js"></script>
</body>
</html>

