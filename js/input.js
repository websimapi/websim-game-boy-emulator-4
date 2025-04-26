export class Input {
    constructor(mmu) {
        this.mmu = mmu;
        
        // Button state (0 = pressed, 1 = released)
        this.buttonKeys = 0xF; // Start, Select, B, A
        this.directionKeys = 0xF; // Down, Up, Left, Right
        
        // JOYP register (which key type is selected)
        this.joyp = 0xFF;
        
        // Register key handler
        this.setupKeyHandlers();
    }
    
    setupKeyHandlers() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }
    
    handleKeyDown(e) {
        if (e.repeat) return; // Ignore key repeat
        
        let changed = false;
        
        switch (e.key.toLowerCase()) {
            // Direction keys
            case 'arrowdown':
                this.directionKeys &= ~0x08;
                changed = true;
                break;
            case 'arrowup':
                this.directionKeys &= ~0x04;
                changed = true;
                break;
            case 'arrowleft':
                this.directionKeys &= ~0x02;
                changed = true;
                break;
            case 'arrowright':
                this.directionKeys &= ~0x01;
                changed = true;
                break;
                
            // Button keys
            case 'enter': // Start
                this.buttonKeys &= ~0x08;
                changed = true;
                break;
            case 'shift': // Select
                this.buttonKeys &= ~0x04;
                changed = true;
                break;
            case 'x': // B
                this.buttonKeys &= ~0x02;
                changed = true;
                break;
            case 'z': // A
                this.buttonKeys &= ~0x01;
                changed = true;
                break;
        }
        
        // Prevent default behavior for these keys
        if (changed) {
            e.preventDefault();
            this.updateJoypadInterrupt();
        }
    }
    
    handleKeyUp(e) {
        let changed = false;
        
        switch (e.key.toLowerCase()) {
            // Direction keys
            case 'arrowdown':
                this.directionKeys |= 0x08;
                changed = true;
                break;
            case 'arrowup':
                this.directionKeys |= 0x04;
                changed = true;
                break;
            case 'arrowleft':
                this.directionKeys |= 0x02;
                changed = true;
                break;
            case 'arrowright':
                this.directionKeys |= 0x01;
                changed = true;
                break;
                
            // Button keys
            case 'enter': // Start
                this.buttonKeys |= 0x08;
                changed = true;
                break;
            case 'shift': // Select
                this.buttonKeys |= 0x04;
                changed = true;
                break;
            case 'x': // B
                this.buttonKeys |= 0x02;
                changed = true;
                break;
            case 'z': // A
                this.buttonKeys |= 0x01;
                changed = true;
                break;
        }
        
        if (changed) {
            e.preventDefault();
        }
    }
    
    updateJoypadInterrupt() {
        // Request joypad interrupt when a button is pressed
        const if_ = this.mmu.readByte(0xFF0F);
        this.mmu.writeByte(0xFF0F, if_ | 0x10);
    }
    
    read() {
        let result = 0xCF; // Top bits always set
        
        // Check P14 (bit 4) - action buttons
        if ((this.joyp & 0x10) === 0) {
            result &= 0xF0 | this.buttonKeys;
        }
        
        // Check P15 (bit 5) - direction buttons
        if ((this.joyp & 0x20) === 0) {
            result &= 0xF0 | this.directionKeys;
        }
        
        return result;
    }
    
    write(value) {
        this.joyp = value;
    }
}

