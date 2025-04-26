export class Timer {
    constructor(mmu) {
        this.mmu = mmu;
        
        // Timer registers
        this.div = 0;    // Divider Register (FF04)
        this.tima = 0;   // Timer Counter (FF05)
        this.tma = 0;    // Timer Modulo (FF06)
        this.tac = 0;    // Timer Control (FF07)
        
        // Internal counters
        this.divCounter = 0;
        this.timaCounter = 0;
        
        // Timer frequencies based on TAC bits 0-1
        this.frequencies = [
            1024,  // 4096 Hz (TAC 00)
            16,    // 262144 Hz (TAC 01)
            64,    // 65536 Hz (TAC 10)
            256    // 16384 Hz (TAC 11)
        ];
    }
    
    reset() {
        this.div = 0;
        this.tima = 0;
        this.tma = 0;
        this.tac = 0;
        this.divCounter = 0;
        this.timaCounter = 0;
    }
    
    read(address) {
        switch (address) {
            case 0xFF04: return this.div;
            case 0xFF05: return this.tima;
            case 0xFF06: return this.tma;
            case 0xFF07: return this.tac;
            default: return 0xFF;
        }
    }
    
    write(address, value) {
        switch (address) {
            case 0xFF04: 
                // Writing any value to DIV resets it to 0
                this.div = 0;
                this.divCounter = 0;
                break;
            case 0xFF05: this.tima = value; break;
            case 0xFF06: this.tma = value; break;
            case 0xFF07: this.tac = value & 0x07; break; // Only use bottom 3 bits
        }
    }
    
    step(cycles) {
        // Update DIV register
        // DIV increments at 16384 Hz (every 256 cycles)
        this.divCounter += cycles;
        while (this.divCounter >= 256) {
            this.divCounter -= 256;
            this.div = (this.div + 1) & 0xFF;
        }
        
        // Only update TIMA if timer is enabled (TAC bit 2)
        if (this.tac & 0x04) {
            // Get timer frequency divider
            const freq = this.frequencies[this.tac & 0x03];
            
            // Update timer
            this.timaCounter += cycles;
            while (this.timaCounter >= freq) {
                this.timaCounter -= freq;
                
                // Increment TIMA
                this.tima = (this.tima + 1) & 0xFF;
                
                // Check for TIMA overflow
                if (this.tima === 0) {
                    // Reset TIMA to TMA
                    this.tima = this.tma;
                    
                    // Request timer interrupt
                    const if_ = this.mmu.readByte(0xFF0F);
                    this.mmu.writeByte(0xFF0F, if_ | 0x04);
                }
            }
        }
    }
}

