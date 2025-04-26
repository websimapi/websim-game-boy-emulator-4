import { CPU } from 'cpu';
import { MMU } from 'mmu';
import { PPU } from 'ppu';
import { Timer } from 'timer';
import { Input } from 'input';
import { Cartridge } from 'cartridge';

export class Emulator {
    constructor() {
        // Create our components
        this.mmu = new MMU();
        this.cartridge = new Cartridge();
        this.ppu = new PPU(this.mmu);
        this.timer = new Timer(this.mmu);
        this.input = new Input(this.mmu);
        this.cpu = new CPU(this.mmu);
        
        // Connect components
        this.mmu.connectComponents(this.cartridge, this.ppu, this.timer, this.input);
        
        this.isRunning = false;
        
        // Constants
        this.CLOCK_SPEED = 4194304; // Hz
        this.FRAME_TIME = 1000 / 59.7; // ms
        this.cyclesPerFrame = Math.floor(this.CLOCK_SPEED / 59.7);
        
        // Frame buffer for rendering
        this.frameBuffer = new Uint8ClampedArray(160 * 144 * 4);
        
        // Performance optimizations
        this.frameCycles = 0;
        this.lastFrameTime = 0;
    }
    
    loadROM(romData) {
        this.cartridge.load(romData);
        return this.cartridge.getTitle();
    }
    
    reset() {
        this.cpu.reset();
        this.ppu.reset();
        this.timer.reset();
        this.mmu.reset();
        this.frameCycles = 0;
        this.lastFrameTime = 0;
    }
    
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
    }
    
    stop() {
        this.isRunning = false;
    }
    
    step(maxCycles) {
        if (!this.isRunning) return 0;
        
        let cyclesExecuted = 0;
        const startCycles = this.frameCycles;
        
        // Run until we've executed enough cycles or hit the max
        while (this.frameCycles < this.cyclesPerFrame && cyclesExecuted < maxCycles) {
            // Execute one CPU instruction
            const cycles = this.cpu.step();
            cyclesExecuted += cycles;
            this.frameCycles += cycles;
            
            // Update PPU
            this.ppu.step(cycles);
            
            // Update Timer
            this.timer.step(cycles);
            
            // Handle interrupts
            this.cpu.handleInterrupts();
            
            // Check if a frame is complete (PPU signals VBlank)
            if (this.ppu.frameComplete) {
                // Transfer the frame buffer
                this.frameBuffer.set(this.ppu.getFrameBuffer());
                this.ppu.frameComplete = false;
                
                // Reset frame cycle counter
                this.frameCycles = 0;
                break;
            }
        }
        
        // If we didn't complete a frame but we've reached the max cycles for this batch,
        // just return and continue in the next batch
        return cyclesExecuted;
    }
    
    getFrameBuffer() {
        return this.frameBuffer;
    }
    
    getFrameReady() {
        return this.ppu.frameComplete;
    }
    
    handleKeyDown(key) {
        this.input.handleKeyDown({ key });
    }
    
    handleKeyUp(key) {
        this.input.handleKeyUp({ key });
    }
}