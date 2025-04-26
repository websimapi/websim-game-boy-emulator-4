export class CPU {
    constructor(mmu) {
        this.mmu = mmu;
        
        // Registers
        this.a = 0;
        this.b = 0;
        this.c = 0;
        this.d = 0;
        this.e = 0;
        this.h = 0;
        this.l = 0;
        this.flags = 0;
        
        this.pc = 0; // Program Counter
        this.sp = 0; // Stack Pointer
        
        this.ime = false; // Interrupt Master Enable
        this.halted = false;
        this.stopped = false;
        
        // Flag constants
        this.FLAG_Z = 0x80; // Zero
        this.FLAG_N = 0x40; // Subtract
        this.FLAG_H = 0x20; // Half Carry
        this.FLAG_C = 0x10; // Carry
        
        // Interrupt constants
        this.INT_VBLANK = 0x01;
        this.INT_STAT = 0x02;
        this.INT_TIMER = 0x04;
        this.INT_SERIAL = 0x08;
        this.INT_JOYPAD = 0x10;
        
        // Initialize instruction table
        this.initInstructions();
        this.initCBInstructions();
    }
    
    reset() {
        // Initialize registers to power-up values for DMG
        this.a = 0x01;
        this.b = 0x00;
        this.c = 0x13;
        this.d = 0x00;
        this.e = 0xD8;
        this.h = 0x01;
        this.l = 0x4D;
        this.flags = 0xB0;
        
        this.pc = 0x0100; // Skip boot ROM, start at 0x0100
        this.sp = 0xFFFE;
        
        this.ime = false;
        this.halted = false;
        this.stopped = false;
    }
    
    // Register getters/setters for 16-bit register pairs
    get af() { return (this.a << 8) | this.flags; }
    set af(value) {
        this.a = (value >> 8) & 0xFF;
        this.flags = value & 0xF0; // Lower 4 bits always 0
    }
    
    get bc() { return (this.b << 8) | this.c; }
    set bc(value) {
        this.b = (value >> 8) & 0xFF;
        this.c = value & 0xFF;
    }
    
    get de() { return (this.d << 8) | this.e; }
    set de(value) {
        this.d = (value >> 8) & 0xFF;
        this.e = value & 0xFF;
    }
    
    get hl() { return (this.h << 8) | this.l; }
    set hl(value) {
        this.h = (value >> 8) & 0xFF;
        this.l = value & 0xFF;
    }
    
    // Flag operations
    setFlag(flag, value) {
        if (value) {
            this.flags |= flag;
        } else {
            this.flags &= ~flag;
        }
    }
    
    getFlag(flag) {
        return (this.flags & flag) !== 0;
    }
    
    // Memory access helpers
    readByte(addr) {
        return this.mmu.readByte(addr);
    }
    
    readWord(addr) {
        return this.mmu.readByte(addr) | (this.mmu.readByte(addr + 1) << 8);
    }
    
    writeByte(addr, value) {
        this.mmu.writeByte(addr, value);
    }
    
    writeWord(addr, value) {
        this.mmu.writeByte(addr, value & 0xFF);
        this.mmu.writeByte(addr + 1, value >> 8);
    }
    
    // CPU operations
    fetchByte() {
        const byte = this.readByte(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        return byte;
    }
    
    fetchWord() {
        const word = this.readWord(this.pc);
        this.pc = (this.pc + 2) & 0xFFFF;
        return word;
    }
    
    pushWord(value) {
        this.sp = (this.sp - 2) & 0xFFFF;
        this.writeWord(this.sp, value);
    }
    
    popWord() {
        const value = this.readWord(this.sp);
        this.sp = (this.sp + 2) & 0xFFFF;
        return value;
    }
    
    step() {
        // Handle HALT/STOP states
        if (this.stopped) {
            return 4; // Consume 4 cycles while stopped
        }
        
        if (this.halted) {
            // Check if any interrupt would wake us
            const ie = this.mmu.readByte(0xFFFF);
            const if_ = this.mmu.readByte(0xFF0F);
            if (ie & if_ & 0x1F) {
                this.halted = false;
            } else {
                return 4; // Consume 4 cycles while halted
            }
        }
        
        // Fetch and execute instruction
        const opcode = this.fetchByte();
        
        // Check for CB prefix
        if (opcode === 0xCB) {
            const cbOpcode = this.fetchByte();
            return this.executeCBInstruction(cbOpcode);
        }
        
        // Execute regular instruction
        return this.executeInstruction(opcode);
    }
    
    handleInterrupts() {
        if (!this.ime) return;
        
        const ie = this.mmu.readByte(0xFFFF); // Interrupt Enable
        const if_ = this.mmu.readByte(0xFF0F); // Interrupt Flags
        
        // Check each interrupt
        for (let i = 0; i < 5; i++) {
            const mask = 1 << i;
            if ((ie & if_ & mask) !== 0) {
                // Service this interrupt
                this.ime = false;
                this.halted = false;
                
                // Clear the interrupt flag
                this.mmu.writeByte(0xFF0F, if_ & ~mask);
                
                // Push PC to stack
                this.pushWord(this.pc);
                
                // Jump to interrupt vector
                switch (mask) {
                    case this.INT_VBLANK: this.pc = 0x0040; break;
                    case this.INT_STAT:   this.pc = 0x0048; break;
                    case this.INT_TIMER:  this.pc = 0x0050; break;
                    case this.INT_SERIAL: this.pc = 0x0058; break;
                    case this.INT_JOYPAD: this.pc = 0x0060; break;
                }
                
                return 20; // Interrupt takes 20 cycles
            }
        }
        
        return 0;
    }
    
    initInstructions() {
        // Main instruction set
        this.instructions = [
            // 0x00 - 0x0F
            () => { return 4; }, // 0x00: NOP
            () => { this.bc = this.fetchWord(); return 12; }, // 0x01: LD BC,d16
            () => { this.writeByte(this.bc, this.a); return 8; }, // 0x02: LD (BC),A
            () => { this.bc = (this.bc + 1) & 0xFFFF; return 8; }, // 0x03: INC BC
            () => { // 0x04: INC B
                this.b = (this.b + 1) & 0xFF;
                this.setFlag(this.FLAG_Z, this.b === 0);
                this.setFlag(this.FLAG_N, 0);
                this.setFlag(this.FLAG_H, (this.b & 0x0F) === 0);
                return 4;
            },
            () => { // 0x05: DEC B
                this.b = (this.b - 1) & 0xFF;
                this.setFlag(this.FLAG_Z, this.b === 0);
                this.setFlag(this.FLAG_N, 1);
                this.setFlag(this.FLAG_H, (this.b & 0x0F) === 0x0F);
                return 4;
            },
            () => { this.b = this.fetchByte(); return 8; }, // 0x06: LD B,d8
            () => { // 0x07: RLCA
                const carry = (this.a & 0x80) >> 7;
                this.a = ((this.a << 1) | carry) & 0xFF;
                this.setFlag(this.FLAG_Z, 0);
                this.setFlag(this.FLAG_N, 0);
                this.setFlag(this.FLAG_H, 0);
                this.setFlag(this.FLAG_C, carry === 1);
                return 4;
            },
            () => { this.writeWord(this.fetchWord(), this.sp); return 20; }, // 0x08: LD (a16),SP
            () => { // 0x09: ADD HL,BC
                const result = this.hl + this.bc;
                this.setFlag(this.FLAG_N, 0);
                this.setFlag(this.FLAG_H, ((this.hl & 0xFFF) + (this.bc & 0xFFF)) > 0xFFF);
                this.setFlag(this.FLAG_C, result > 0xFFFF);
                this.hl = result & 0xFFFF;
                return 8;
            },
            () => { this.a = this.readByte(this.bc); return 8; }, // 0x0A: LD A,(BC)
            () => { this.bc = (this.bc - 1) & 0xFFFF; return 8; }, // 0x0B: DEC BC
            () => { // 0x0C: INC C
                this.c = (this.c + 1) & 0xFF;
                this.setFlag(this.FLAG_Z, this.c === 0);
                this.setFlag(this.FLAG_N, 0);
                this.setFlag(this.FLAG_H, (this.c & 0x0F) === 0);
                return 4;
            },
            () => { // 0x0D: DEC C
                this.c = (this.c - 1) & 0xFF;
                this.setFlag(this.FLAG_Z, this.c === 0);
                this.setFlag(this.FLAG_N, 1);
                this.setFlag(this.FLAG_H, (this.c & 0x0F) === 0x0F);
                return 4;
            },
            () => { this.c = this.fetchByte(); return 8; }, // 0x0E: LD C,d8
            () => { // 0x0F: RRCA
                const carry = this.a & 0x01;
                this.a = ((this.a >> 1) | (carry << 7)) & 0xFF;
                this.setFlag(this.FLAG_Z, 0);
                this.setFlag(this.FLAG_N, 0);
                this.setFlag(this.FLAG_H, 0);
                this.setFlag(this.FLAG_C, carry === 1);
                return 4;
            },
            
            // Add all other instructions following the same pattern
            /* ... 0x10 to 0xFF ... */
        ];
        
        // Implement the rest of the main instruction set
        // I'm showing a partial implementation for brevity
    }
    
    initCBInstructions() {
        // CB-prefixed instruction set
        this.cbInstructions = [
            // 0x00 - 0x0F
            () => { // 0x00: RLC B
                const carry = (this.b & 0x80) >> 7;
                this.b = ((this.b << 1) | carry) & 0xFF;
                this.setFlag(this.FLAG_Z, this.b === 0);
                this.setFlag(this.FLAG_N, 0);
                this.setFlag(this.FLAG_H, 0);
                this.setFlag(this.FLAG_C, carry === 1);
                return 8;
            },
            // Add all other CB-prefixed instructions
            /* ... 0x01 to 0xFF ... */
        ];
        
        // Implement the rest of the CB-prefixed instruction set
        // I'm showing a partial implementation for brevity
    }
    
    executeInstruction(opcode) {
        if (this.instructions[opcode]) {
            return this.instructions[opcode]();
        } else {
            console.error(`Unknown opcode: 0x${opcode.toString(16)}`);
            return 4; // Default to 4 cycles
        }
    }
    
    executeCBInstruction(opcode) {
        if (this.cbInstructions[opcode]) {
            return this.cbInstructions[opcode]();
        } else {
            console.error(`Unknown CB opcode: 0x${opcode.toString(16)}`);
            return 8; // Default to 8 cycles
        }
    }
}

