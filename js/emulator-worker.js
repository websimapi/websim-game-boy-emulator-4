// emulator-worker.js - Web Worker for the Game Boy Emulator
import { Emulator } from './emulator.js';

// Create the emulator instance
let emulator = null;
let isRunning = false;
let animationFrameId = null;
let lastTimestamp = 0;

// Process messages from the main thread
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch(type) {
        case 'init':
            initEmulator();
            break;
            
        case 'loadROM':
            loadROM(data);
            break;
            
        case 'reset':
            resetEmulator();
            break;
            
        case 'keydown':
            if (emulator) {
                emulator.handleKeyDown(data);
            }
            break;
            
        case 'keyup':
            if (emulator) {
                emulator.handleKeyUp(data);
            }
            break;
    }
};

function initEmulator() {
    try {
        emulator = new Emulator();
        self.postMessage({ type: 'status', data: 'Emulator initialized' });
    } catch (error) {
        self.postMessage({ type: 'error', data: 'Failed to initialize emulator: ' + error.message });
    }
}

function loadROM(romData) {
    try {
        if (!emulator) {
            initEmulator();
        }
        
        const title = emulator.loadROM(romData);
        self.postMessage({ type: 'status', data: `Loaded ROM: ${title}` });
        
        // Reset and start emulation
        emulator.reset();
        emulator.start();
        isRunning = true;
        
        // Start the emulation loop
        if (!animationFrameId) {
            lastTimestamp = performance.now();
            emulationLoop();
        }
        
        self.postMessage({ type: 'loaded' });
    } catch (error) {
        self.postMessage({ type: 'error', data: 'Failed to load ROM: ' + error.message });
    }
}

function resetEmulator() {
    if (emulator) {
        emulator.reset();
        emulator.start();
    }
}

function emulationLoop() {
    if (!isRunning || !emulator) {
        animationFrameId = null;
        return;
    }
    
    const now = performance.now();
    const elapsed = now - lastTimestamp;
    
    // Calculate how many cycles we should run based on elapsed time
    // Target: 4,194,304 cycles per second
    const targetCycles = Math.floor((emulator.CLOCK_SPEED * elapsed) / 1000);
    
    // Run emulation for this batch of cycles
    const cyclesExecuted = emulator.step(targetCycles);
    
    // Send frame if ready
    if (emulator.getFrameReady()) {
        const frameBuffer = emulator.getFrameBuffer();
        self.postMessage({ 
            type: 'frame',
            data: frameBuffer 
        }, [frameBuffer.buffer]);
    }
    
    // Throttle to match Game Boy clock rate
    let sleepTime = 0;
    if (cyclesExecuted > 0) {
        const expectedTime = (cyclesExecuted * 1000) / emulator.CLOCK_SPEED;
        sleepTime = Math.max(0, expectedTime - (performance.now() - now));
    }
    
    // Schedule next emulation batch
    if (sleepTime > 0) {
        setTimeout(() => {
            lastTimestamp = now + sleepTime;
            animationFrameId = requestAnimationFrame(emulationLoop);
        }, sleepTime);
    } else {
        lastTimestamp = now;
        animationFrameId = requestAnimationFrame(emulationLoop);
    }
}