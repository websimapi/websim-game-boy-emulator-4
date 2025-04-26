export class MMU {
    constructor() {
        // Memory areas
        this.rom = new Uint8Array(0x8000);  // 32KB ROM (divided into banks)
        this.vram = new Uint8Array(0x2000); // 8KB VRAM
        this.eram = new Uint8Array(0x2000); // 8KB External RAM (cartridge)
        this.wram = new Uint8Array(0x2000); // 8KB Working RAM
        this.oam = new Uint8Array(0xA0);    // Sprite Attribute Table
        this.io = new Uint8Array(0x80);     // I/O Registers
        this.hram = new Uint8Array(0x7F);   // High RAM (zero page)
        this.ie = 0;                        // Interrupt Enable register

        // Components
        this.cartridge = null;
        this.ppu = null;
        this.timer = null;
        this.input = null;
    }
    
    connectComponents(cartridge, ppu, timer, input) {
        this.cartridge = cartridge;
        this.ppu = ppu;
        this.timer = timer;
        this.input = input;
    }
    
    reset() {
        this.vram.fill(0);
        this.wram.fill(0);
        this.oam.fill(0);
        this.io.fill(0);
        this.hram.fill(0);
        this.ie = 0;
        
        // Initialize I/O registers with proper reset values
        this.io[0x05] = 0x00; // TIMA
        this.io[0x06] = 0x00; // TMA
        this.io[0x07] = 0x00; // TAC
        this.io[0x10] = 0x80; // NR10
        this.io[0x11] = 0xBF; // NR11
        this.io[0x12] = 0xF3; // NR12
        this.io[0x14] = 0xBF; // NR14
        this.io[0x16] = 0x3F; // NR21
        this.io[0x17] = 0x00; // NR22
        this.io[0x19] = 0xBF; // NR24
        this.io[0x1A] = 0x7F; // NR30
        this.io[0x1B] = 0xFF; // NR31
        this.io[0x1C] = 0x9F; // NR32
        this.io[0x1E] = 0xBF; // NR33
        this.io[0x20] = 0xFF; // NR41
        this.io[0x21] = 0x00; // NR42
        this.io[0x22] = 0x00; // NR43
        this.io[0x23] = 0xBF; // NR44
        this.io[0x24] = 0x77; // NR50
        this.io[0x25] = 0xF3; // NR51
        this.io[0x26] = 0xF1; // NR52
        this.io[0x40] = 0x91; // LCDC
        this.io[0x42] = 0x00; // SCY
        this.io[0x43] = 0x00; // SCX
        this.io[0x45] = 0x00; // LYC
        this.io[0x47] = 0xFC; // BGP
        this.io[0x48] = 0xFF; // OBP0
        this.io[0x49] = 0xFF; // OBP1
        this.io[0x4A] = 0x00; // WY
        this.io[0x4B] = 0x00; // WX
    }
    
    readByte(address) {
        address &= 0xFFFF; // Ensure 16-bit address
        
        // ROM bank 0 & switchable bank
        if (address < 0x8000) {
            return this.cartridge.read(address);
        }
        // VRAM
        else if (address < 0xA000) {
            // Check if VRAM is accessible (not in mode 3)
            if (this.ppu && this.ppu.inVRAMAccessibleMode()) {
                return this.vram[address - 0x8000];
            }
            return 0xFF;
        }
        // External RAM (cartridge)
        else if (address < 0xC000) {
            return this.cartridge.readRAM(address - 0xA000);
        }
        // WRAM
        else if (address < 0xE000) {
            return this.wram[address - 0xC000];
        }
        // Echo RAM (mirror of C000-DDFF)
        else if (address < 0xFE00) {
            return this.wram[address - 0xE000];
        }
        // OAM
        else if (address < 0xFEA0) {
            // Check if OAM is accessible (not in mode 2 or 3)
            if (this.ppu && this.ppu.inOAMAccessibleMode()) {
                return this.oam[address - 0xFE00];
            }
            return 0xFF;
        }
        // Not usable
        else if (address < 0xFF00) {
            return 0xFF;
        }
        // I/O registers
        else if (address < 0xFF80) {
            return this.readIO(address);
        }
        // HRAM
        else if (address < 0xFFFF) {
            return this.hram[address - 0xFF80];
        }
        // IE register
        else {
            return this.ie;
        }
    }
    
    writeByte(address, value) {
        address &= 0xFFFF; // Ensure 16-bit address
        value &= 0xFF;     // Ensure 8-bit value
        
        // ROM bank 0 & switchable bank
        if (address < 0x8000) {
            this.cartridge.write(address, value);
        }
        // VRAM
        else if (address < 0xA000) {
            // Check if VRAM is accessible (not in mode 3)
            if (this.ppu && this.ppu.inVRAMAccessibleMode()) {
                this.vram[address - 0x8000] = value;
            }
        }
        // External RAM (cartridge)
        else if (address < 0xC000) {
            this.cartridge.writeRAM(address - 0xA000, value);
        }
        // WRAM
        else if (address < 0xE000) {
            this.wram[address - 0xC000] = value;
        }
        // Echo RAM (mirror of C000-DDFF)
        else if (address < 0xFE00) {
            this.wram[address - 0xE000] = value;
        }
        // OAM
        else if (address < 0xFEA0) {
            // Check if OAM is accessible (not in mode 2 or 3)
            if (this.ppu && this.ppu.inOAMAccessibleMode()) {
                this.oam[address - 0xFE00] = value;
            }
        }
        // Not usable
        else if (address < 0xFF00) {
            // Do nothing
        }
        // I/O registers
        else if (address < 0xFF80) {
            this.writeIO(address, value);
        }
        // HRAM
        else if (address < 0xFFFF) {
            this.hram[address - 0xFF80] = value;
        }
        // IE register
        else {
            this.ie = value;
        }
    }
    
    readWord(address) {
        return this.readByte(address) | (this.readByte(address + 1) << 8);
    }
    
    writeWord(address, value) {
        this.writeByte(address, value & 0xFF);
        this.writeByte(address + 1, (value >> 8) & 0xFF);
    }
    
    readIO(address) {
        const offset = address - 0xFF00;
        
        // Handle special I/O registers
        switch (address) {
            case 0xFF00: // JOYP (Joypad)
                return this.input ? this.input.read() : 0xFF;
                
            case 0xFF04: // DIV (Divider)
            case 0xFF05: // TIMA (Timer counter)
            case 0xFF06: // TMA (Timer modulo)
            case 0xFF07: // TAC (Timer control)
                return this.timer ? this.timer.read(address) : this.io[offset];
                
            case 0xFF0F: // IF (Interrupt flags)
                return this.io[0x0F];
                
            case 0xFF40: // LCDC (LCD Control)
            case 0xFF41: // STAT (LCD Status)
            case 0xFF42: // SCY (Scroll Y)
            case 0xFF43: // SCX (Scroll X)
            case 0xFF44: // LY (LCD Y coordinate)
            case 0xFF45: // LYC (LY Compare)
            case 0xFF47: // BGP (BG Palette)
            case 0xFF48: // OBP0 (Object Palette 0)
            case 0xFF49: // OBP1 (Object Palette 1)
            case 0xFF4A: // WY (Window Y)
            case 0xFF4B: // WX (Window X)
                return this.ppu ? this.ppu.read(address) : this.io[offset];
                
            default:
                return this.io[offset];
        }
    }
    
    writeIO(address, value) {
        const offset = address - 0xFF00;
        
        // Handle special I/O registers
        switch (address) {
            case 0xFF00: // JOYP (Joypad)
                if (this.input) this.input.write(value);
                this.io[0x00] = value & 0x30; // Only bits 4-5 are writable
                break;
                
            case 0xFF04: // DIV (Divider)
            case 0xFF05: // TIMA (Timer counter)
            case 0xFF06: // TMA (Timer modulo)
            case 0xFF07: // TAC (Timer control)
                if (this.timer) this.timer.write(address, value);
                break;
                
            case 0xFF0F: // IF (Interrupt flags)
                this.io[0x0F] = value & 0x1F; // Only bits 0-4 used
                break;
                
            case 0xFF40: // LCDC (LCD Control)
            case 0xFF41: // STAT (LCD Status)
            case 0xFF42: // SCY (Scroll Y)
            case 0xFF43: // SCX (Scroll X)
            case 0xFF44: // LY (LCD Y coordinate - read only)
            case 0xFF45: // LYC (LY Compare)
            case 0xFF46: // DMA (OAM DMA transfer)
                if (address === 0xFF46) this.doDMATransfer(value);
                if (this.ppu) this.ppu.write(address, value);
                break;
            
            case 0xFF47: // BGP (BG Palette)
            case 0xFF48: // OBP0 (Object Palette 0)
            case 0xFF49: // OBP1 (Object Palette 1)
            case 0xFF4A: // WY (Window Y)
            case 0xFF4B: // WX (Window X)
                if (this.ppu) this.ppu.write(address, value);
                break;
                
            default:
                this.io[offset] = value;
                break;
        }
    }
    
    doDMATransfer(value) {
        const source = value << 8; // Source address is value * 0x100
        for (let i = 0; i < 0xA0; i++) {
            this.writeByte(0xFE00 + i, this.readByte(source + i));
        }
    }
}

