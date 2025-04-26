import { CPU } from 'cpu';
import { MMU } from 'mmu';
import { PPU } from 'ppu';
import { Timer } from 'timer';
import { Input } from 'input';
import { Cartridge } from 'cartridge';

export class Emulator {
    constructor() {
        this.canvas = document.getElementById('screen');
        this.ctx = this.canvas.getContext('2d');
        
        // Create our components
        this.mmu = new MMU();
        this.cartridge = new Cartridge();
        this.ppu = new PPU(this.mmu, this.ctx);
        this.timer = new Timer(this.mmu);
        this.input = new Input(this.mmu);
        this.cpu = new CPU(this.mmu);
        
        // Connect components
        this.mmu.connectComponents(this.cartridge, this.ppu, this.timer, this.input);
        
        this.isRunning = false;
        this.animationFrameId = null;
        
        // Constants
        this.CLOCK_SPEED = 4194304; // Hz
        this.FRAME_TIME = 1000 / 59.7; // ms
        this.cyclesPerFrame = Math.floor(this.CLOCK_SPEED / 59.7);
    }
    
    loadROM(romData) {
        this.cartridge.load(romData);
        console.log('ROM loaded:', this.cartridge.getTitle());
    }
    
    reset() {
        this.cpu.reset();
        this.ppu.reset();
        this.timer.reset();
        this.mmu.reset();
    }
    
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        this.run();
    }
    
    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    run() {
        if (!this.isRunning) return;
        
        // Execute enough cycles for one frame
        let cyclesThisFrame = 0;
        while (cyclesThisFrame < this.cyclesPerFrame) {
            const cycles = this.cpu.step();
            cyclesThisFrame += cycles;
            
            // Update PPU
            this.ppu.step(cycles);
            
            // Update Timer
            this.timer.step(cycles);
            
            // Handle interrupts
            this.cpu.handleInterrupts();
        }
        
        // Schedule next frame
        this.animationFrameId = requestAnimationFrame(() => this.run());
    }
}

